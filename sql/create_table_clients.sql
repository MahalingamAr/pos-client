DROP TABLE IF EXISTS pos.clients CASCADE;

CREATE TABLE pos.clients (
  client_id      varchar(10)  NOT NULL,
  client_name    varchar(50)  NOT NULL,
  gst_no         varchar(20)  NULL,
  phone          varchar(30)  NULL,
  email          varchar(100) NULL,
  address_line1  varchar(100) NULL,
  address_line2  varchar(100) NULL,
  city           varchar(100) NULL,
  state_name     varchar(50)  NULL,
  pincode        varchar(10)  NULL,
  is_active      boolean      NOT NULL DEFAULT true,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  is_igst        boolean      NOT NULL DEFAULT false,

  CONSTRAINT clients_pkey PRIMARY KEY (client_id),

  -- client_id must be exactly 15 digits
  CONSTRAINT clients_client_id_chk
      CHECK (client_id ~ '^[0-9]{3,10}$'),

  -- phone allows digits, space, +, -, (, )
  -- and requires at least one digit
  CONSTRAINT clients_phone_chk
    CHECK (
      phone IS NULL
      OR (
        phone ~ '^[0-9+\-() ]{10,30}$'
      )
    )
) TABLESPACE pg_default;

DROP TRIGGER IF EXISTS trg_clients_touch ON pos.clients;
CREATE TRIGGER trg_clients_touch
BEFORE UPDATE ON pos.clients
FOR EACH ROW
EXECUTE FUNCTION pos.touch_updated_at();

