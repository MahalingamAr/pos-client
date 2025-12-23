Drop function pos.pos_lookup_client_by_name cascade;
CREATE OR REPLACE FUNCTION pos.pos_lookup_client_by_name(p_search text)
RETURNS TABLE (
  client_id        char(15),
  client_name      varchar(50),
  phone            varchar(30),
  address_line1    varchar(100),
  address_line2    varchar(100),
  city             varchar(100),
  state_name       varchar(100),
  pincode          varchar(10),
  is_igst          boolean,
  gst_no	   varchar(20)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pos, public
AS $$
  SELECT
    c.client_id,
    c.client_name,
    c.phone,
    c.address_line1,
    c.address_line2,
    c.city,
    c.state_name,
    c.pincode,
    c.is_igst,
    c.gst_no
  FROM pos.clients c
  WHERE c.is_active = true
    AND (c.client_name ILIKE '%' || p_search || '%'
         OR c.client_id::text ILIKE '%' || p_search || '%'
         OR c.phone ILIKE '%' || p_search || '%')
  ORDER BY c.client_name
  LIMIT 10;
$$;

