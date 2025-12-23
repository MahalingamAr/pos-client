CREATE OR REPLACE FUNCTION pos.pos_update_sales_invoice(
  p_sales_id uuid,
  p_data     jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pos, public
AS $$
DECLARE
  v_items        jsonb;

  v_company_id   char(2);
  v_state_id     char(2);
  v_branch_id    char(2);

  v_old_invoice_no   text;
  v_old_invoice_date date;

  v_new_invoice_no   text;
  v_new_invoice_date date;

  v_updated_by   varchar(15);
BEGIN
  IF p_sales_id IS NULL THEN
    RAISE EXCEPTION 'p_sales_id is required';
  END IF;

  v_items := COALESCE(p_data->'items', '[]'::jsonb);

  /* =========================================================
     0) Lock header + get context + existing immutable values
     ========================================================= */
  SELECT
    s.company_id, s.state_id, s.branch_id,
    s.invoice_no, s.invoice_date
  INTO
    v_company_id, v_state_id, v_branch_id,
    v_old_invoice_no, v_old_invoice_date
  FROM pos.sales_invoice s
  WHERE s.sales_id = p_sales_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found for sales_id %', p_sales_id;
  END IF;

  /* =========================================================
     0.1) If payload contains invoice_no/date, allow only if SAME
     ========================================================= */
  IF p_data ? 'invoice_no' THEN
    v_new_invoice_no := NULLIF(TRIM(p_data->>'invoice_no'), '');
    IF v_new_invoice_no IS NOT NULL AND v_new_invoice_no <> v_old_invoice_no THEN
      RAISE EXCEPTION 'invoice_no cannot be changed for sales_id %', p_sales_id;
    END IF;
  END IF;

  IF p_data ? 'invoice_date' THEN
    v_new_invoice_date := NULLIF(TRIM(p_data->>'invoice_date'), '')::date;
    IF v_new_invoice_date IS NOT NULL AND v_new_invoice_date <> v_old_invoice_date THEN
      RAISE EXCEPTION 'invoice_date cannot be changed for sales_id %', p_sales_id;
    END IF;
  END IF;

  /* Optional hardening: strip keys so nobody accidentally updates later */
  p_data := p_data - 'invoice_no' - 'invoice_date';

  /* =========================================================
     0.2) Lock existing items rows too (prevents concurrent update issues)
     ========================================================= */
  PERFORM 1
  FROM pos.sales_invoice_item i
  WHERE i.sales_id = p_sales_id
  FOR UPDATE;

  /* =========================================================
     1) LEDGER: reverse OLD (ACTIVE only) => qty_in
     ========================================================= */
  INSERT INTO pos.stock_ledger(
    company_id, state_id, branch_id, product_id,
    movement_time, movement_type,
    qty_in, qty_out,
    ref_table, ref_id
  )
  SELECT
    v_company_id, v_state_id, v_branch_id,
    i.product_id,
    now(),
    'SALE'::text,
    SUM(i.quantity)::numeric(12,3) AS qty_in,
    0::numeric(12,3)               AS qty_out,
    'sales_invoice',
    p_sales_id
  FROM pos.sales_invoice_item i
  WHERE i.sales_id = p_sales_id
    AND i.status = 'ACTIVE'
  GROUP BY i.product_id;

  /* =========================================================
     2) Revert OLD stock (ACTIVE only): add back
     ========================================================= */
  UPDATE pos.branch_products bp
  SET on_hand_qty = COALESCE(bp.on_hand_qty, 0) + x.qty
  FROM (
    SELECT product_id, SUM(quantity)::numeric(12,3) AS qty
    FROM pos.sales_invoice_item
    WHERE sales_id = p_sales_id
      AND status = 'ACTIVE'
    GROUP BY product_id
  ) x
  WHERE bp.company_id = v_company_id
    AND bp.state_id   = v_state_id
    AND bp.branch_id  = v_branch_id
    AND bp.product_id = x.product_id;

  /* =========================================================
     3) Update header (NO invoice_no, NO invoice_date)
     ========================================================= */
  v_updated_by := NULLIF(TRIM(p_data->>'updated_by'), '');

  UPDATE pos.sales_invoice s
  SET
    client_id        = NULLIF(TRIM(p_data->>'client_id'),'')::varchar(10),
    customer_name    = NULLIF(TRIM(p_data->>'customer_name'),''),
    payment_mode     = COALESCE(NULLIF(TRIM(p_data->>'payment_mode'),''), s.payment_mode),

    gross_amount     = COALESCE(NULLIF(p_data->>'gross_amount','')::numeric, s.gross_amount),
    discount_amount  = COALESCE(NULLIF(p_data->>'discount_amount','')::numeric, s.discount_amount),
    taxable_amount   = COALESCE(NULLIF(p_data->>'taxable_amount','')::numeric, s.taxable_amount),

    cgst_amount      = COALESCE(NULLIF(p_data->>'cgst_amount','')::numeric, s.cgst_amount),
    sgst_amount      = COALESCE(NULLIF(p_data->>'sgst_amount','')::numeric, s.sgst_amount),
    igst_amount      = COALESCE(NULLIF(p_data->>'igst_amount','')::numeric, s.igst_amount),

    tax_amount       = COALESCE(NULLIF(p_data->>'tax_amount','')::numeric, s.tax_amount),
    net_amount       = COALESCE(NULLIF(p_data->>'net_amount','')::numeric, s.net_amount),

    paid_amount      = COALESCE(NULLIF(p_data->>'paid_amount','')::numeric, s.paid_amount),
    balance_amount   = COALESCE(NULLIF(p_data->>'balance_amount','')::numeric, s.balance_amount),

    remarks          = NULLIF(TRIM(p_data->>'remarks'),''),
    is_igst          = COALESCE(NULLIF(p_data->>'is_igst','')::boolean, s.is_igst),

    updated_at       = now(),
    updated_by       = COALESCE(v_updated_by, s.updated_by)
  WHERE s.sales_id = p_sales_id;

  /* =========================================================
     4) Soft-delete OLD items (ACTIVE -> DELETED)
     ========================================================= */
  UPDATE pos.sales_invoice_item
  SET status = 'DELETED'
  WHERE sales_id = p_sales_id
    AND status = 'ACTIVE';

  /* =========================================================
     5) Insert NEW items as ACTIVE
     ========================================================= */
  INSERT INTO pos.sales_invoice_item(
    sales_id, line_no, product_id, quantity, uom, unit_price, mrp,
    discount_pct, discount_amount, taxable_amount,
    cgst_amount, sgst_amount, igst_amount,
    tax_amount, line_total,
    status
  )
  SELECT
    p_sales_id,
    (ROW_NUMBER() OVER (ORDER BY (it->>'product_id')))::smallint AS line_no,
    NULLIF(it->>'product_id','')::char(6),
    COALESCE(NULLIF(it->>'quantity','')::numeric(12,3), 0),
    COALESCE(NULLIF(it->>'uom',''), 'PCS'),
    COALESCE(NULLIF(it->>'unit_price','')::numeric(12,2), 0),
    NULLIF(it->>'mrp','')::numeric(12,2),

    COALESCE(NULLIF(it->>'discount_pct','')::numeric(5,2), 0),
    COALESCE(NULLIF(it->>'discount_amount','')::numeric(12,2), 0),
    COALESCE(NULLIF(it->>'taxable_amount','')::numeric(12,2), 0),

    COALESCE(NULLIF(it->>'cgst_amount','')::numeric(12,2), 0),
    COALESCE(NULLIF(it->>'sgst_amount','')::numeric(12,2), 0),
    COALESCE(NULLIF(it->>'igst_amount','')::numeric(12,2), 0),

    COALESCE(NULLIF(it->>'tax_amount','')::numeric(12,2), 0),
    COALESCE(NULLIF(it->>'line_total','')::numeric(12,2), 0),

    'ACTIVE'::text
  FROM jsonb_array_elements(v_items) it;

  /* =========================================================
     6) LEDGER: apply NEW => qty_out
     ========================================================= */
  INSERT INTO pos.stock_ledger(
    company_id, state_id, branch_id, product_id,
    movement_time, movement_type,
    qty_in, qty_out,
    ref_table, ref_id
  )
  SELECT
    v_company_id, v_state_id, v_branch_id,
    (it->>'product_id')::char(6) AS product_id,
    now(),
    'SALE'::text,
    0::numeric(12,3) AS qty_in,
    SUM(COALESCE(NULLIF(it->>'quantity','')::numeric,0))::numeric(12,3) AS qty_out,
    'sales_invoice',
    p_sales_id
  FROM jsonb_array_elements(v_items) it
  GROUP BY (it->>'product_id')::char(6);

  /* =========================================================
     7) Apply NEW stock: subtract
     ========================================================= */
  UPDATE pos.branch_products bp
  SET on_hand_qty = COALESCE(bp.on_hand_qty, 0) - x.qty,
      updated_at  = now()
  FROM (
    SELECT
      (it->>'product_id')::char(6) AS product_id,
      SUM(COALESCE(NULLIF(it->>'quantity','')::numeric,0))::numeric(12,3) AS qty
    FROM jsonb_array_elements(v_items) it
    GROUP BY (it->>'product_id')::char(6)
  ) x
  WHERE bp.company_id = v_company_id
    AND bp.state_id   = v_state_id
    AND bp.branch_id  = v_branch_id
    AND bp.product_id = x.product_id;

  RETURN 'OK';
END;
$$;

