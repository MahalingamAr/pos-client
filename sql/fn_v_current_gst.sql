CREATE OR REPLACE VIEW pos.v_product_current_gst AS
SELECT
    p.product_id,
    p.product_name,
    p.hsn_id

    -- CGST and SGST from HSN table
    h.cgst_rate,
    h.sgst_rate,

    -- Optional helper: total GST (useful for reports)
    (h.cgst_rate + h.sgst_rate) AS total_gst_rate

FROM pos.products p
JOIN pos.hsn_gst h
  ON h.hsn_id = p.hsn_id;

