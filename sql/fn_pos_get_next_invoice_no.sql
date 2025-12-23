CREATE OR REPLACE FUNCTION pos.pos_get_next_invoice_no(
  p_company_id   char(2),
  p_state_id     char(2),
  p_branch_id    char(2),
  p_invoice_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pos, public
AS $$
DECLARE
  v_yymmdd      text;
  v_last_suffix integer;
  v_next_suffix integer;
  v_lock_key    bigint;
BEGIN
  IF p_invoice_date IS NULL THEN
    RAISE EXCEPTION 'p_invoice_date cannot be null';
  END IF;

  v_yymmdd := pg_catalog.to_char(p_invoice_date, 'YYMMDD');

  -- ✅ One lock per branch per day
  v_lock_key :=
    hashtextextended(
      p_company_id::text || '|' || p_state_id::text || '|' || p_branch_id::text || '|' || p_invoice_date::text,
      0
    );

  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT max(substring(invoice_no, 7, 3)::int)
  INTO v_last_suffix
  FROM pos.sales_invoice
  WHERE company_id   = p_company_id
    AND state_id     = p_state_id
    AND branch_id    = p_branch_id
    AND invoice_date = p_invoice_date
    AND invoice_no LIKE v_yymmdd || '%';

  v_next_suffix := COALESCE(v_last_suffix, 0) + 1;

  IF v_next_suffix > 999 THEN
    RAISE EXCEPTION
      'Invoice sequence overflow (>999) for %, %, %, date %',
      p_company_id, p_state_id, p_branch_id, p_invoice_date;
  END IF;

  RETURN v_yymmdd || lpad(v_next_suffix::text, 3, '0');
END;
$$;

