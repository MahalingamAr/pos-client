-- Drop the old 5-param version
DROP FUNCTION if exists  pos.pos_delete_sales_invoice_by_no cascade;


-- Now recreate ONLY the 6-param version (with your column names updated_at/updated_by)
CREATE OR REPLACE FUNCTION pos.pos_delete_sales_invoice_by_no( 
  p_company_id   char(2),
  p_state_id     char(2),
  p_branch_id    char(2),
  p_invoice_date date,
  p_invoice_no   text,
  p_updated_by   varchar(15) DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pos, public
AS $$
DECLARE
  v_sales_id uuid;
BEGIN
  SELECT s.sales_id
    INTO v_sales_id
  FROM pos.sales_invoice s
  WHERE s.company_id    = p_company_id
    AND s.state_id      = p_state_id
    AND s.branch_id     = p_branch_id
    AND s.invoice_date  = p_invoice_date
    AND s.invoice_no    = p_invoice_no
    AND s.status        = 'ACTIVE';

  IF v_sales_id IS NULL THEN
    RETURN 'NOT_FOUND_OR_ALREADY_DELETED';
  END IF;

  -- Reverse stock for ACTIVE items
  UPDATE pos.branch_products bp
  SET on_hand_qty = COALESCE(bp.on_hand_qty,0) + x.qty
  FROM (
    SELECT product_id, SUM(quantity)::numeric AS qty
    FROM pos.sales_invoice_item
    WHERE sales_id = v_sales_id
      AND status   = 'ACTIVE'
    GROUP BY product_id
  ) x
  WHERE bp.company_id = p_company_id
    AND bp.state_id   = p_state_id
    AND bp.branch_id  = p_branch_id
    AND bp.product_id = x.product_id;

  -- Soft delete items
  UPDATE pos.sales_invoice_item
  SET status = 'DELETED'
  WHERE sales_id = v_sales_id
    AND status   = 'ACTIVE';

  -- Soft delete header + mark updated fields
  UPDATE pos.sales_invoice
  SET status     = 'DELETED',
      updated_at = now(),
      updated_by = p_updated_by
  WHERE sales_id = v_sales_id
    AND status   = 'ACTIVE';

  RETURN 'OK';
END;
$$;

