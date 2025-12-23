-- ============================================================
-- POS MASTER SCHEMA — v4.4
-- - Clients & Vendors are GLOBAL (no company_id)
-- - Companies: add 5 license categories (number + expiry)
-- - Products global; product_id = major(2)||minor(2)||pack(2); products.hsn_id
-- - product_hsn uses (product_id, hsn_id)
-- - No inventory, no purchase orders
-- - Branch PK = (company_id, state_id, branch_id)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS pos;

-- ---------- Drop views ----------
DROP VIEW IF EXISTS pos.v_product_current_gst;
DROP VIEW IF EXISTS pos.v_active_discounts;
DROP VIEW IF EXISTS pos.v_inventory_below_min;

-- ---------- Drop tables (safe order) ----------
DROP TABLE IF EXISTS pos.branch_products CASCADE;
DROP TABLE IF EXISTS pos.discounts       CASCADE;
DROP TABLE IF EXISTS pos.products        CASCADE;
DROP TABLE IF EXISTS pos.categories_minor CASCADE;
DROP TABLE IF EXISTS pos.categories_major CASCADE;
DROP TABLE IF EXISTS pos.clients         CASCADE;
DROP TABLE IF EXISTS pos.vendors         CASCADE;
DROP TABLE IF EXISTS pos.branches        CASCADE;
DROP TABLE IF EXISTS pos.hsn_gst         CASCADE;
DROP TABLE IF EXISTS pos.packing_type    CASCADE;
DROP TABLE IF EXISTS pos.companies       CASCADE;

-- ---------- Utility: updated_at toucher ----------
CREATE OR REPLACE FUNCTION pos.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------- Domain ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='percent_100') THEN
    CREATE DOMAIN percent_100 AS numeric(5,2)
      CHECK (VALUE >= 0 AND VALUE <= 100);
  END IF;
END$$;
-- create table_states
-- pos schema assumed
DROP table if exists pos.states cascade ;

CREATE TABLE IF NOT EXISTS pos.states (
  state_id   CHAR(2) PRIMARY KEY,
  state_name TEXT NOT NULL,
  CONSTRAINT states_state_id_ck CHECK (state_id ~ '^[A-Z0-9]{2}$')
);


-- sample data (add more as needed)
INSERT INTO pos.states(state_id, state_name) VALUES
  ('01','Tamil Nadu'),
  ('02','Karnataka'),
  ('03','Kerala')
ON CONFLICT (state_id) DO NOTHING;

commit;

-- ---------- Companies (now with 5 license pairs) ----------
CREATE TABLE pos.companies (
  company_id        CHAR(2) PRIMARY KEY,
  company_name        VARCHAR(200) NOT NULL,
  address_line1       VARCHAR(200),
  address_line2       VARCHAR(200),
  city                VARCHAR(100),
  state_id            VARCHAR(2),
  pincode             VARCHAR(10),
  phone               VARCHAR(30),
  email               VARCHAR(150),
  -- 1) Establishments no and pan no.
  company_incorp_no   VARCHAR(50),
  gst_no              VARCHAR(15) UNIQUE,
  pan_no              VARCHAR(20),
  tin_no       	      VARCHAR(50),
  iec_no              VARCHAR(20),
  iec_expiry_date     DATE,
  -- 2) FSSAI
  fssai_license_no    VARCHAR(30),
  fssai_expiry_date   DATE,
  -- 3) Spices board  License 
  spices_license_no   VARCHAR(50),
  spices_expiry_date  DATE,
  -- 4) tea board license no.
  tea_license_no      VARCHAR(50),
  tea_expiry_date     DATE,

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_id CHECK (company_id ~ '^[0-9]{2}$')
);
DROP TRIGGER IF EXISTS trg_companies_touch ON pos.companies;
CREATE TRIGGER trg_companies_touch
BEFORE UPDATE ON pos.companies
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Branches (composite PK) ----------
CREATE TABLE pos.branches (
  company_id  CHAR(2) NOT NULL REFERENCES pos.companies(company_id) ON UPDATE CASCADE ON DELETE CASCADE,
  state_id    CHAR(2) NOT NULL REFERENCES pos.states(state_id) on UPDATE CASCADE ON DELETE CASCADE ,
  branch_id   CHAR(2) NOT NULL,
  branch_name   VARCHAR(150) NOT NULL,
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city          VARCHAR(100),
  pincode       VARCHAR(10),
  phone         VARCHAR(30),
  email         VARCHAR(150),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  full_branch_id CHAR(6) GENERATED ALWAYS AS (company_id || state_id || branch_id) STORED,
  CONSTRAINT branch_id CHECK (state_id ~ '^[0-9]{2}$' AND branch_id ~ '^[0-9]{2}$'),
  CONSTRAINT pk_branches PRIMARY KEY (company_id, state_id, branch_id)
);
DROP TRIGGER IF EXISTS trg_branches_touch ON pos.branches;
CREATE TRIGGER trg_branches_touch
BEFORE UPDATE ON pos.branches
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Categories (GLOBAL) ----------
CREATE TABLE pos.categories_major (
  major_id  CHAR(2) PRIMARY KEY,
  major_name  VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT major_id CHECK (major_id ~ '^[0-9]{2}$')
);
DROP TRIGGER IF EXISTS trg_categories_major_touch ON pos.categories_major;
CREATE TRIGGER trg_categories_major_touch
BEFORE UPDATE ON pos.categories_major
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

CREATE TABLE pos.categories_minor (
  major_id  CHAR(2) NOT NULL REFERENCES pos.categories_major(major_id) ON UPDATE CASCADE ON DELETE CASCADE,
  minor_id  CHAR(2) NOT NULL,
  minor_name  VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT minor_id CHECK (minor_id ~ '^[0-9]{2}$'),
  CONSTRAINT pk_categories_minor PRIMARY KEY (major_id, minor_id)
);
DROP TRIGGER IF EXISTS trg_categories_minor_touch ON pos.categories_minor;
CREATE TRIGGER trg_categories_minor_touch
BEFORE UPDATE ON pos.categories_minor
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Packing Type (GLOBAL) ----------
CREATE TABLE pos.packing_type (
  pack_id CHAR(2) PRIMARY KEY,   -- e.g., BX, PK
  descr     VARCHAR(20) NOT NULL
);

-- ---------- HSN & GST (GLOBAL; PK = hsn_id, with hsn_name) ----------
CREATE TABLE pos.hsn_gst (
  hsn_id   VARCHAR(10) PRIMARY KEY,
  hsn_name   VARCHAR(200) NOT NULL,
  cgst_rate  percent_100 NOT NULL,
  sgst_rate  percent_100 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_hsn_gst_touch ON pos.hsn_gst;
CREATE TRIGGER trg_hsn_gst_touch
BEFORE UPDATE ON pos.hsn_gst
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Products (GLOBAL; product_id = major||minor||pack; + hsn_id) ----------
CREATE TABLE pos.products (
  major_id    CHAR(2) NOT NULL REFERENCES pos.categories_major(major_id) ON UPDATE CASCADE ON DELETE CASCADE,
  minor_id    CHAR(2) NOT NULL ,
  pack_id     CHAR(2) NOT NULL REFERENCES pos.packing_type(pack_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  product_id  CHAR(6) GENERATED ALWAYS AS (major_id || minor_id || pack_id) STORED,
  hsn_id      VARCHAR(10) NOT NULL REFERENCES pos.hsn_gst(hsn_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  sku_id      VARCHAR(20) NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  uom           VARCHAR(20) NOT NULL DEFAULT 'PCS',
  barcode       VARCHAR(50),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_products PRIMARY KEY (product_id),
  CONSTRAINT pk_minor FOREIGN KEY (major_id,minor_id)
    REFERENCES pos.categories_minor(major_id,minor_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS trg_products_touch ON pos.products;
CREATE TRIGGER trg_products_touch
BEFORE UPDATE ON pos.products
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_barcode
ON pos.products (TRIM(barcode));

-- ---------- Branch Products (branch inventory) ----------
CREATE TABLE pos.branch_products (
  company_id  CHAR(2) NOT NULL,
  state_id    CHAR(2) NOT NULL,
  branch_id   CHAR(2) NOT NULL,
  product_id  CHAR(6) NOT NULL,
  branch_product_key CHAR(12) GENERATED ALWAYS AS (company_id || state_id || branch_id || product_id) STORED,

  -- pricing
  mrp           NUMERIC(12,2),
  sale_price    NUMERIC(12,2),
  cost_price    NUMERIC(12,2),

  -- stock
  on_hand_qty   NUMERIC(9,3) NOT NULL DEFAULT 0,
  min_qty       NUMERIC(9,3) NOT NULL DEFAULT 0,
  max_qty       NUMERIC(9,3),
  reorder_level NUMERIC(9,3) DEFAULT 0,
  reorder_qty   NUMERIC(9,3) DEFAULT 0,

  -- audit
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_branch_products PRIMARY KEY (company_id, state_id, branch_id, product_id),
  CONSTRAINT fk_bp_branch FOREIGN KEY (company_id, state_id, branch_id)
    REFERENCES pos.branches(company_id, state_id, branch_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_bp_product FOREIGN KEY (product_id)
    REFERENCES pos.products(product_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_branch_products_key ON pos.branch_products (branch_product_key);
DROP TRIGGER IF EXISTS trg_branch_products_touch ON pos.branch_products;
CREATE TRIGGER trg_branch_products_touch
BEFORE UPDATE ON pos.branch_products
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Clients (GLOBAL) ----------
CREATE TABLE pos.clients (
  client_id   CHAR(3) PRIMARY KEY,
  client_name   VARCHAR(200) NOT NULL,
  gst_no        VARCHAR(15),
  phone         VARCHAR(30),
  email         VARCHAR(150),
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city          VARCHAR(100),
  state_name    VARCHAR(100),
  pincode       VARCHAR(10),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_id CHECK (client_id ~ '^[0-9]{3}$')
);
DROP TRIGGER IF EXISTS trg_clients_touch ON pos.clients;
CREATE TRIGGER trg_clients_touch
BEFORE UPDATE ON pos.clients
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Vendors (GLOBAL) ----------
CREATE TABLE pos.vendors (
  vendor_id   CHAR(2) PRIMARY KEY,
  vendor_name   VARCHAR(200) NOT NULL,
  gst_no        VARCHAR(15),
  phone         VARCHAR(30),
  email         VARCHAR(150),
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city          VARCHAR(100),
  state_name    VARCHAR(100),
  pincode       VARCHAR(10),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendor_id CHECK (vendor_id ~ '^[0-9]{2}$')
);
DROP TRIGGER IF EXISTS trg_vendors_touch ON pos.vendors;
CREATE TRIGGER trg_vendors_touch
BEFORE UPDATE ON pos.vendors
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Discounts (branch + product scoped) ----------
CREATE TABLE pos.discounts (
  company_id  CHAR(2) NOT NULL,
  state_id    CHAR(2) NOT NULL,
  branch_id   CHAR(2) NOT NULL,
  product_id  CHAR(6) NOT NULL,
  discount_pct  percent_100 NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_discount_dates CHECK (end_date >= start_date),
  CONSTRAINT pk_discounts PRIMARY KEY (company_id, state_id, branch_id, product_id),
  CONSTRAINT fk_disc_branch FOREIGN KEY (company_id, state_id, branch_id)
    REFERENCES pos.branches(company_id, state_id, branch_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_disc_product FOREIGN KEY (product_id)
    REFERENCES pos.products(product_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- ---------- Helpful indexes ----------
CREATE INDEX IF NOT EXISTS ix_products_name           ON pos.products (product_name);
CREATE INDEX IF NOT EXISTS ix_branch_products_lookup  ON pos.branch_products (company_id, state_id, branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON pos.products ( (TRIM(barcode)) );
CREATE INDEX IF NOT EXISTS idx_products_code    ON pos.products ( (TRIM(product_id)) );
CREATE INDEX IF NOT EXISTS idx_branch_products  ON pos.branch_products ( (TRIM(company_id)), (TRIM(state_id)), (TRIM(branch_id)), (TRIM(product_id)) );
-- ---------- Views ----------
-- Current GST for each product (products.hsn_id → hsn_gst)
CREATE OR REPLACE VIEW pos.v_product_current_gst AS
SELECT
  p.product_id,
  p.product_name,
  p.hsn_id,
  h.hsn_name,
  h.cgst_rate,
  h.sgst_rate
FROM pos.products p
JOIN pos.hsn_gst h ON h.hsn_id = p.hsn_id;

-- Active discounts today
CREATE OR REPLACE VIEW pos.v_active_discounts AS
SELECT
  d.company_id, d.state_id, d.branch_id,
  d.product_id, d.discount_pct, d.start_date, d.end_date,
  p.product_name
FROM pos.discounts d
JOIN pos.products  p ON p.product_id = d.product_id
WHERE CURRENT_DATE BETWEEN d.start_date AND d.end_date;

-- Low stock at branches (branch_products)
CREATE OR REPLACE VIEW pos.v_inventory_below_min AS
SELECT
  bp.company_id, bp.state_id, bp.branch_id, bp.product_id,
  bp.on_hand_qty, bp.min_qty, bp.max_qty,
  p.product_name,
  b.branch_name
FROM pos.branch_products bp
JOIN pos.products p ON p.product_id = bp.product_id
JOIN pos.branches b
  ON b.company_id = bp.company_id
 AND b.state_id   = bp.state_id
 AND b.branch_id  = bp.branch_id
WHERE bp.on_hand_qty < bp.min_qty;

-- ============================================================
-- END v4.4
-- ============================================================
commit;
