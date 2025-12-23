-- RPC_fn_purchase_invoice.sql

CREATE OR REPLACE FUNCTION pos.fn_create_purchase_invoice(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pos, public
AS $$
DECLARE
  v_purchase_id  uuid;
  v_company_id   char(2);
  v_state_id     char(2);
  v_branch_id    char(2);
  v_vendor_id    char(2);
  v_vendor_inv_no    text;
  v_vendor_inv_date  date;
  v_invoice_date     date;
  v_created_by       varchar(15);
  v_remarks          text;

  v_gross_amount     numeric(12,2) := 0;
  v_discount_amount  numeric(12,2) := 0;
  v_tax_amount       numeric(12,2) := 0;
  v_net_amount       numeric(12,2) := 0;

  v_item          jsonb;
  v_line_no       smallint := 0;

  v_product_id    char(6);
  v_qty           numeric(12,3);
  v_unit_cost     numeric(12,2);
  v_mrp           numeric(12,2);
  v_discount_pct  percent_100 := 0;

  v_line_gross    numeric(12,2);
  v_line_disc_amt numeric(12,2);
  v_taxable       numeric(12,2);

  v_cgst_rate     percent_100;
  v_sgst_rate     percent_100;
  v_igst_rate     percent_100;
  v_cgst_amt      numeric(12,2);
  v_sgst_amt      numeric(12,2);
  v_igst_amt      numeric(12,2);
  v_line_tax      numeric(12,2);
  v_line_total    numeric(12,2);

BEGIN
  v_company_id      := (p_data->>'company_id')::char(2);
  v_state_id        := (p_data->>'state_id')::char(2);
  v_branch_id       := (p_data->>'branch_id')::char(2);
  v_vendor_id       := (p_data->>'vendor_id')::char(2);
  v_vendor_inv_no   := NULLIF(p_data->>'vendor_invoice_no','');
  v_vendor_inv_date := (p_data->>'vendor_invoice_date')::date;
  v_invoice_date    := COALESCE((p_data->>'invoice_date')::date, CURRENT_DATE);
  v_created_by      := COALESCE(p_data->>'created_by', 'system');
  v_remarks         := p_data->>'remarks';

  IF jsonb_array_length(COALESCE(p_data->'items','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'No items supplied to fn_create_purchase_invoice()';
  END IF;

  -- Totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    v_product_id   := (v_item->>'product_id')::char(6);
    v_qty          := (v_item->>'quantity')::numeric;
    v_unit_cost    := COALESCE((v_item->>'unit_price')::numeric, 0);  -- treated as cost
    v_mrp          := (v_item->>'mrp')::numeric;
    v_discount_pct := COALESCE((v_item->>'discount_pct')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id;
    END IF;

    SELECT cgst_rate, sgst_rate, igst_rate
      INTO v_cgst_rate, v_sgst_rate, v_igst_rate
    FROM pos.v_product_current_gst
    WHERE product_id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'GST info not found for product %', v_product_id;
    END IF;

    v_line_gross    := round(v_qty * v_unit_cost, 2);
    v_line_disc_amt := round(v_line_gross * v_discount_pct / 100, 2);
    v_taxable       := v_line_gross - v_line_disc_amt;

    v_cgst_amt := round(v_taxable * v_cgst_rate / 100, 2);
    v_sgst_amt := round(v_taxable * v_sgst_rate / 100, 2);
    v_igst_amt := round(v_taxable * v_igst_rate / 100, 2);
    v_line_tax := v_cgst_amt + v_sgst_amt;
    v_line_total := v_taxable + v_line_tax;

    v_gross_amount    := v_gross_amount    + v_line_gross;
    v_discount_amount := v_discount_amount + v_line_disc_amt;
    v_tax_amount      := v_tax_amount      + v_line_tax;
    v_net_amount      := v_net_amount      + v_line_total;
  END LOOP;

  -- Header
  INSERT INTO pos.purchase_invoice (
    company_id, state_id, branch_id,
    invoice_date,
    vendor_id, vendor_invoice_no, vendor_invoice_date,
    gross_amount, discount_amount, tax_amount, net_amount,
    remarks,
    created_by
  )
  VALUES (
    v_company_id, v_state_id, v_branch_id,
    v_invoice_date,
    v_vendor_id, v_vendor_inv_no, v_vendor_inv_date,
    v_gross_amount, v_discount_amount, v_tax_amount, v_net_amount,
    v_remarks,
    v_created_by
  )
  RETURNING purchase_id INTO v_purchase_id;

  -- Items + stock
  v_line_no := 0;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    v_line_no      := v_line_no + 1;
    v_product_id   := (v_item->>'product_id')::char(6);
    v_qty          := (v_item->>'quantity')::numeric;
    v_unit_cost    := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_mrp          := (v_item->>'mrp')::numeric;
    v_discount_pct := COALESCE((v_item->>'discount_pct')::numeric, 0);

    SELECT cgst_rate, sgst_rate, igst_rate
      INTO v_cgst_rate, v_sgst_rate, v_igst_rate
    FROM pos.v_product_current_gst
    WHERE product_id = v_product_id;

    v_line_gross    := round(v_qty * v_unit_cost, 2);
    v_line_disc_amt := round(v_line_gross * v_discount_pct / 100, 2);
    v_taxable       := v_line_gross - v_line_disc_amt;

    v_cgst_amt := round(v_taxable * v_cgst_rate / 100, 2);
    v_sgst_amt := round(v_taxable * v_sgst_rate / 100, 2);
    v_igst_amt := round(v_taxable * v_igst_rate / 100, 2);
    v_line_tax := v_cgst_amt + v_sgst_amt;
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO pos.purchase_invoice_item (
      purchase_id, line_no, product_id,
      quantity, uom,
      unit_cost, mrp,
      discount_pct, discount_amount,
      taxable_amount,
      cgst_rate, sgst_rate, igst_rate,
      tax_amount,
      line_total
    )
    VALUES (
      v_purchase_id, v_line_no, v_product_id,
      v_qty, 'PCS',
      v_unit_cost, v_mrp,
      v_discount_pct, v_line_disc_amt,
      v_taxable,
      v_cgst_rate, v_sgst_rate, v_igst_rate,
      v_line_tax,
      v_line_total
    );

    -- Stock ledger: PURCHASE (qty_in)
    INSERT INTO pos.stock_ledger (
      company_id, state_id, branch_id, product_id,
      movement_type, qty_in, qty_out,
      ref_table, ref_id
    )
    VALUES (
      v_company_id, v_state_id, v_branch_id, v_product_id,
      'PURCHASE', v_qty, 0,
      'purchase_invoice', v_purchase_id
    );

    -- Update branch_products.on_hand_qty (+qty)
    UPDATE pos.branch_products
    SET on_hand_qty = on_hand_qty + v_qty,
        cost_price  = v_unit_cost,   -- optional: latest cost
        mrp         = COALESCE(v_mrp, mrp),
        updated_at  = NOW()
    WHERE company_id = v_company_id
      AND state_id   = v_state_id
      AND branch_id  = v_branch_id
      AND product_id = v_product_id;

    -- If no row exists, insert a new branch_products record with minimal fields
    IF NOT FOUND THEN
      INSERT INTO pos.branch_products (
        company_id, state_id, branch_id, product_id,
        mrp, sale_price, cost_price,
        on_hand_qty, min_qty, max_qty,
        reorder_level, reorder_qty,
        is_active
      )
      VALUES (
        v_company_id, v_state_id, v_branch_id, v_product_id,
        v_mrp, NULL, v_unit_cost,
        v_qty, 0, NULL,
        0, 0,
        TRUE
      );
    END IF;

  END LOOP;

  RETURN v_purchase_id;
END;
$$;

