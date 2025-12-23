DROP FUNCTION IF EXISTS pos.fn_lookup_product_details_by_id cascade;

CREATE OR REPLACE FUNCTION pos.fn_lookup_product_details_by_id(
  p_company_id   char(2),
  p_state_id     char(2),
  p_branch_id    char(2),
  p_product_id   char(6),
  p_invoice_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  product_id     char(6),
  product_name   text,
  barcode        text,
  mrp            numeric,
  sale_price     numeric,
  discount_pct   percent_100,
  cgst_rate      percent_100,
  sgst_rate      percent_100
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pos, public
AS $$
  SELECT
    p.product_id,
    p.product_name,
    p.barcode,
    bp.mrp,
    bp.sale_price,

    -- 🔹 Discount from pos.discounts (if exists and date-valid), else 0
    COALESCE(d.discount_pct::percent_100, 0::percent_100) AS discount_pct,

    -- 🔹 GST from your view (already split as CGST / SGST)
    g.cgst_rate,
    g.sgst_rate
  FROM pos.products p
  JOIN pos.branch_products bp
    ON bp.product_id = p.product_id
   AND bp.company_id = p_company_id
   AND bp.state_id   = p_state_id
   AND bp.branch_id  = p_branch_id
  JOIN pos.v_product_current_gst g
    ON g.product_id = p.product_id

  -- 🔹 Optional discount row, active for the invoice date
  LEFT JOIN pos.discounts d
    ON d.company_id = bp.company_id
   AND d.state_id   = bp.state_id
   AND d.branch_id  = bp.branch_id
   AND d.product_id = bp.product_id
   AND p_invoice_date BETWEEN d.start_date AND d.end_date

  WHERE p.product_id = p_product_id
  LIMIT 1;
$$;

