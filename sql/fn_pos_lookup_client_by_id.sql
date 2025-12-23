DROP FUNCTION IF EXISTS pos.pos_lookup_client_by_id(text);

CREATE OR REPLACE FUNCTION pos.pos_lookup_client_by_id(
  p_client_id text
)
RETURNS TABLE(
  client_id    char(3),
  client_name  varchar,
  phone        varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pos, public
AS $$
  SELECT
      c.client_id,
      c.client_name,
      c.phone
  FROM pos.clients c
  WHERE c.client_id = p_client_id;
$$;

GRANT EXECUTE ON FUNCTION pos.pos_lookup_client_by_id(text) TO anon;

