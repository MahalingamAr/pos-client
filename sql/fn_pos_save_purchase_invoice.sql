CREATE OR REPLACE FUNCTION pos.pos_save_purchase_invoice(
  p_header jsonb,
  p_lines  jsonb
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id  int;
BEGIN
  -- if header has "id" -> update, else insert
  v_invoice_id := (p_header->>'id')::int;

  IF v_invoice_id IS NULL THEN
    INSERT INTO pos.purchase_invoice (
      company_id,
      branch_id,
      supplier_id,
      invoice_no,
      invoice_date,
      po_number,
      po_date,
      gross_amount,
      net_amount,
      created_by
    )
    VALUES (
      p_header->>'company_id',
      p_header->>'branch_id',
      (p_header->>'supplier_id')::int,
      p_header->>'invoice_no',
      (p_header->>'invoice_date')::date,
      p_header->>'po_number',
      (p_header->>'po_date')::date,
      COALESCE((p_header->>'gross_amount')::numeric, 0),
      COALESCE((p_header->>'net_amount')::numeric, 0),
      p_header->>'created_by'
    )
    RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE pos.purchase_invoices SET
      supplier_id   = (p_header->>'supplier_id')::int,
      invoice_no    = p_header->>'invoice_no',
      invoice_date  = (p_header->>'invoice_date')::date,
      po_number     = p_header->>'po_number',
      po_date       = (p_header->>'po_date')::date,
      gross_amount  = COALESCE((p_header->>'gross_amount')::numeric, 0),
      net_amount    = COALESCE((p_header->>'net_amount')::numeric, 0),
      modified_by   = p_header->>'modified_by',
      modified_at   = now()
    WHERE id = v_invoice_id;
  END IF;

  -- lines handling as you already have…
  -- delete old lines, insert new, etc.

  RETURN v_invoice_id;
END;
$$;

