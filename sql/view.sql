-- ============================================================
-- VIEW FIXES (explicit column lists, no SELECT *)
-- ============================================================

-- 1) Current GST rates for each product (as of today)
CREATE OR REPLACE VIEW pos.v_product_current_gst AS
SELECT
  p.product_id,
  p.product_name,
  p.company_id,
  h.hsn_code,
  h.cgst_rate,
  h.sgst_rate,
  h.igst_rate
FROM pos.products AS p
JOIN pos.product_hsn AS ph
  ON ph.product_id = p.product_id
JOIN pos.hsn_gst AS h
  ON h.hsn_gst_id = ph.hsn_gst_id
WHERE h.effective_from <= CURRENT_DATE
  AND (h.effective_to IS NULL OR h.effective_to >= CURRENT_DATE);

-- 2) Active discounts today, with product name
CREATE OR REPLACE VIEW pos.v_active_discounts AS
SELECT
  d.discount_id,
  d.company_id,
  d.branch_id,
  d.product_id,
  d.discount_pct,
  d.start_date,
  d.end_date,
  p.product_name
FROM pos.discounts AS d
JOIN pos.products  AS p
  ON p.product_id = d.product_id
WHERE CURRENT_DATE BETWEEN d.start_date AND d.end_date;

-- 3) Inventory below minimum, with product & branch info
CREATE OR REPLACE VIEW pos.v_inventory_below_min AS
SELECT
  i.inventory_id,
  i.company_id,
  i.branch_id,
  i.product_id,
  i.current_qty,
  i.min_qty,
  i.max_qty,
  i.created_at,
  i.updated_at,
  p.product_name,
  b.branch_code,
  b.branch_name
FROM pos.inventory AS i
JOIN pos.products  AS p ON p.product_id  = i.product_id
JOIN pos.branches  AS b ON b.branch_id   = i.branch_id
WHERE i.current_qty < i.min_qty;
