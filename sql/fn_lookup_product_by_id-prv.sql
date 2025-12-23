Drop function pos.pos_lookup_product_by_id cascade;
CREATE OR REPLACE FUNCTION pos.pos_lookup_product_by_id(
  p_company_id char(2),
  p_state_id   char(2),
  p_branch_id  char(2),
  p_product_id char(6)
)
RETURNS TABLE (
  product_id   char(6),
  product_name text,
  barcode      text,
  mrp          numeric,
  sale_price   numeric,
  cgst_rate    percent_100,
  sgst_rate    percent_100,
  igst_rate    percent_100
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
    h.cgst_rate,
    h.sgst_rate,
    h.igst_rate
  FROM pos.products p
  JOIN pos.branch_products bp
  JOIN pos.hsn_gst h
   ON bp.product_id = p.product_id
   AND bp.company_id = p_company_id
   AND bp.state_id   = p_state_id
   AND bp.branch_id  = p_branch_id
   AND h.hsn_id = p.hsn_id
   AND p.product_id = p_product_id
  LIMIT 1;
$$;

