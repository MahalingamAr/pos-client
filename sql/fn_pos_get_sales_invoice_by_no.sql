CREATE OR REPLACE FUNCTION pos.pos_get_sales_invoice_by_no(
  p_company_id   char(2),
  p_state_id     char(2),
  p_branch_id    char(2),
  p_invoice_date date,
  p_invoice_no   text,
  p_status       text DEFAULT 'ACTIVE'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pos, public
AS $$
DECLARE
  v_sales_id uuid;
  v_header jsonb;
  v_items  jsonb;
  v_status text;
BEGIN
  -- normalize status input
  v_status := UPPER(COALESCE(NULLIF(TRIM(p_status), ''), 'ACTIVE'));

  SELECT s.sales_id
    INTO v_sales_id
  FROM pos.sales_invoice s
  WHERE s.company_id   = p_company_id
    AND s.state_id     = p_state_id
    AND s.branch_id    = p_branch_id
    AND s.invoice_date = p_invoice_date
    AND s.invoice_no   = p_invoice_no
    AND UPPER(COALESCE(s.status, 'ACTIVE')) = v_status;

  IF v_sales_id IS NULL THEN
    RETURN jsonb_build_object(
      'sales_id', null,
      'header', null,
      'items', '[]'::jsonb
    );
  END IF;

  SELECT to_jsonb(s)
    INTO v_header
  FROM pos.sales_invoice s
  WHERE s.sales_id = v_sales_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.line_no), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT
      i.line_no,
      i.product_id,
      p.product_name,
      p.barcode,

      i.quantity,
      i.uom AS uom,
      i.unit_price,
      i.mrp,

      i.discount_pct,
      i.discount_amount,
      i.taxable_amount,
      i.tax_amount,
      i.line_total,

      i.cgst_amount,
      i.sgst_amount,
      i.igst_amount,

      COALESCE(h.cgst_rate, 0)::numeric AS cgst_rate,
      COALESCE(h.sgst_rate, 0)::numeric AS sgst_rate

    FROM pos.sales_invoice_item i
    JOIN pos.products p
      ON p.product_id = i.product_id
    LEFT JOIN pos.hsn_gst h
      ON h.hsn_id = p.hsn_id
    WHERE i.sales_id = v_sales_id
      AND UPPER(COALESCE(i.status, 'ACTIVE')) = v_status   -- ✅ FIX: load ACTIVE/DELETED lines correctly
  ) t;

  RETURN jsonb_build_object(
    'sales_id', v_sales_id,
    'header', v_header,
    'items', v_items
  );
END;
$$;

