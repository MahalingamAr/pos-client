CREATE OR REPLACE FUNCTION pos.pos_get_client_delivery(p_client_id varchar)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pos, public
AS $$
  SELECT jsonb_build_object(
    'client_id', c.client_id,
    'client_name', c.client_name,
    'phone', c.phone,
    'delivery_address_line1', COALESCE(c.delivery_address_line1, c.address_line1),
    'delivery_address_line2', COALESCE(c.delivery_address_line2, c.address_line2),
    'delivery_city', COALESCE(c.delivery_city, c.city),
    'delivery_pincode', COALESCE(c.delivery_pincode, c.pincode)
  )
  FROM pos.clients c
  WHERE c.client_id = p_client_id;
$$;

