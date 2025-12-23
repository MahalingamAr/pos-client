CREATE OR REPLACE FUNCTION pos.pos_clients_default_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.delivery_address_line1 := COALESCE(NEW.delivery_address_line1, NEW.address_line1);
  NEW.delivery_address_line2 := COALESCE(NEW.delivery_address_line2, NEW.address_line2);
  NEW.delivery_city          := COALESCE(NEW.delivery_city, NEW.city);
  NEW.delivery_pincode       := COALESCE(NEW.delivery_pincode, NEW.pincode);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_default_delivery ON pos.clients;

CREATE TRIGGER trg_clients_default_delivery
BEFORE INSERT OR UPDATE ON pos.clients
FOR EACH ROW
EXECUTE FUNCTION pos.pos_clients_default_delivery();

