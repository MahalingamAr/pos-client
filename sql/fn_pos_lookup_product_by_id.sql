CREATE OR REPLACE FUNCTION pos.fn_lookup_product_by_id(
  p_company_id   char(2),
  p_state_id     char(2),
  p_branch_id    char(2),
  p_product_id   char(6)
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

    -- 🔹 Discount from active discount view (or 0)
    COALESCE(ad.discount_pct::percent_100, 0::percent_100) AS discount_pct,

    -- 🔹 GST (your GST lookup view should return only CGST & SGST now)
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

  LEFT JOIN pos.v_active_discounts ad
    ON ad.company_id = p_company_id
   AND ad.state_id   = p_state_id
   AND ad.branch_id  = p_branch_id
   AND ad.product_id = p.product_id

  WHERE p.product_id = p_product_id
  LIMIT 1;
$$;

