drop view pos.v_product_current_gst cascade;
CREATE OR REPLACE VIEW pos.v_product_current_gst AS
SELECT
  p.product_id,
  p.product_name,
  p.barcode,
  p.hsn_id,

  -- Cast numeric(5,2) to your percent_100 domain for consistency
  h.cgst_rate::percent_100 AS cgst_rate,
  h.sgst_rate::percent_100 AS sgst_rate,

  -- Optional: total GST rate (useful for reports)
  (h.cgst_rate + h.sgst_rate)::percent_100 AS total_gst_rate

FROM pos.products p
JOIN pos.hsn_gst h
  ON h.hsn_id = p.hsn_id;

