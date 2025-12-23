CREATE OR REPLACE FUNCTION pos.pos_lookup_product_by_barcode(
  p_company_id char(2),
  p_state_id   char(2),
  p_branch_id  char(2),
  p_barcode    text
)
RETURNS TABLE (
  product_id   char(6),
  product_name text,
  barcode      text,
  mrp          numeric,
  sale_price   numeric
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
    bp.sale_price
  FROM pos.products p
  JOIN pos.branch_products bp
    ON bp.product_id = p.product_id
   AND bp.company_id = p_company_id
   AND bp.state_id   = p_state_id
   AND bp.branch_id  = p_branch_id
  WHERE TRIM(p.barcode) = TRIM(p_barcode)
  LIMIT 1;
$$;

