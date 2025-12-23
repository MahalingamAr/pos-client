CREATE OR REPLACE FUNCTION pos.pos_list_purchase_invoice(
  p_company_id text,
  p_branch_id  text
)
RETURNS SETOF jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'id',           pi.purchase_id,
    'invoice_no',   pi.invoice_no,
    'invoice_date', pi.invoice_date,
    'po_number',    pi.po_number,
    'po_date',      pi.po_date,
    'supplier_id',  pi.vendor_id,
    'net_amount',   pi.net_amount
  )
  FROM pos.purchase_invoice pi
  WHERE pi.company_id = p_company_id
    AND pi.branch_id  = p_branch_id
  ORDER BY pi.invoice_date DESC, pi.purchase_id DESC;
$$;

