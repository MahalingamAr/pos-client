DROP FUNCTION IF EXISTS pos.pos_select_clients();

CREATE OR REPLACE FUNCTION pos.pos_select_clients()
RETURNS TABLE(
  client_id   char(3),
  client_name varchar,
  phone       varchar
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
  FROM pos.clients c;
$$;

GRANT EXECUTE ON FUNCTION pos.pos_select_clients() TO anon;

