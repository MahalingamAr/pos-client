DROP FUNCTION IF EXISTS pos.pos_get_company_by_id(char(2));

CREATE OR REPLACE FUNCTION pos.pos_get_company_by_id(p_company_id char(2))
RETURNS TABLE(
  company_id char(2),
  company_name varchar(200),
  address_line1 varchar(200),
  address_line2 varchar(200),
  city varchar(100),
  state_id varchar(2),
  pincode varchar(10),
  phone varchar(30),
  email varchar(150),
  gst_no varchar(15)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pos, public
AS $$
  SELECT
    c.company_id,
    c.company_name,
    c.address_line1,
    c.address_line2,
    c.city,
    c.state_id,
    c.pincode,
    c.phone,
    c.email,
    c.gst_no
  FROM pos.companies c
  WHERE c.company_id = p_company_id
    AND c.is_active = true
  LIMIT 1;
$$;

