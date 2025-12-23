CREATE OR REPLACE FUNCTION pos.pos_get_purchase_invoice(
  p_invoice_id int
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_header jsonb;
  v_lines  jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',           pi.id,
    'company_id', pi.company_id,
    'branch_id',  pi.branch_id,
    'supplier_id',  pi.supplier_id,
    'invoice_no',   pi.invoice_no,
    'invoice_date', pi.invoice_date,
    'po_number',    pi.po_number,
    'po_date',      pi.po_date,
    'gross_amount', pi.gross_amount,
    'net_amount',   pi.net_amount
  )
  INTO v_header
  FROM pos.purchase_invoice pi
  WHERE pi.id = p_invoice_id;

  SELECT jsonb_agg(
           jsonb_build_object(
             'id',          l.id,
             'product_id',  l.product_id,
             'qty',         l.qty,
             'rate',        l.rate,
             'amount',      l.amount
           )
         )
  INTO v_lines
  FROM pos.purchase_invoice_lines l
  WHERE l.invoice_id = p_invoice_id;

  RETURN jsonb_build_object(
    'header', v_header,
    'lines',  COALESCE(v_lines, '[]'::jsonb)
  );
END;
$$;

