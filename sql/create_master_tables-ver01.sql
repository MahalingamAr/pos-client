-- ============================================================
-- POS MASTER SCHEMA — v4.4
-- - Clients & Vendors are GLOBAL (no company_code)
-- - Companies: add 5 license categories (number + expiry)
-- - Products global; product_code = major(2)||minor(2)||pack(2); products.hsn_code
-- - product_hsn uses (product_code, hsn_code)
-- - No inventory, no purchase orders
-- - Branch PK = (company_code, state_code, branch_code)
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

-- ---------- Companies (now with 5 license pairs) ----------
CREATE TABLE pos.companies (
  company_code        CHAR(2) PRIMARY KEY,
  company_name        VARCHAR(200) NOT NULL,
  address_line1       VARCHAR(200),
  address_line2       VARCHAR(200),
  city                VARCHAR(100),
  state_name          VARCHAR(100),
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
  CONSTRAINT company_code_digits CHECK (company_code ~ '^[0-9]{2}$')
);
DROP TRIGGER IF EXISTS trg_companies_touch ON pos.companies;
CREATE TRIGGER trg_companies_touch
BEFORE UPDATE ON pos.companies
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Branches (composite PK) ----------
CREATE TABLE pos.branches (
  company_code  CHAR(2) NOT NULL REFERENCES pos.companies(company_code) ON UPDATE CASCADE ON DELETE CASCADE,
  state_code    CHAR(2) NOT NULL,
  branch_code   CHAR(2) NOT NULL,
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
  full_branch_code CHAR(6) GENERATED ALWAYS AS (company_code || state_code || branch_code) STORED,
  CONSTRAINT branch_codes_digits CHECK (state_code ~ '^[0-9]{2}$' AND branch_code ~ '^[0-9]{2}$'),
  CONSTRAINT pk_branches PRIMARY KEY (company_code, state_code, branch_code)
);
DROP TRIGGER IF EXISTS trg_branches_touch ON pos.branches;
CREATE TRIGGER trg_branches_touch
BEFORE UPDATE ON pos.branches
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Categories (GLOBAL) ----------
CREATE TABLE pos.categories_major (
  major_code  CHAR(2) PRIMARY KEY,
  major_name  VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT major_code_digits CHECK (major_code ~ '^[0-9]{2}$')
);
DROP TRIGGER IF EXISTS trg_categories_major_touch ON pos.categories_major;
CREATE TRIGGER trg_categories_major_touch
BEFORE UPDATE ON pos.categories_major
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

CREATE TABLE pos.categories_minor (
  major_code  CHAR(2) NOT NULL REFERENCES pos.categories_major(major_code) ON UPDATE CASCADE ON DELETE CASCADE,
  minor_code  CHAR(2) NOT NULL,
  minor_name  VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT minor_code_digits CHECK (minor_code ~ '^[0-9]{2}$'),
  CONSTRAINT pk_categories_minor PRIMARY KEY (major_code, minor_code)
);
DROP TRIGGER IF EXISTS trg_categories_minor_touch ON pos.categories_minor;
CREATE TRIGGER trg_categories_minor_touch
BEFORE UPDATE ON pos.categories_minor
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Packing Type (GLOBAL) ----------
CREATE TABLE pos.packing_type (
  pack_code CHAR(2) PRIMARY KEY,   -- e.g., BX, PK
  descr     VARCHAR(20) NOT NULL
);

-- ---------- HSN & GST (GLOBAL; PK = hsn_code, with hsn_name) ----------
CREATE TABLE pos.hsn_gst (
  hsn_code   VARCHAR(10) PRIMARY KEY,
  hsn_name   VARCHAR(200) NOT NULL,
  cgst_rate  percent_100 NOT NULL,
  sgst_rate  percent_100 NOT NULL,
  igst_rate  percent_100 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gst_sum CHECK (igst_rate = cgst_rate + sgst_rate)
);
DROP TRIGGER IF EXISTS trg_hsn_gst_touch ON pos.hsn_gst;
CREATE TRIGGER trg_hsn_gst_touch
BEFORE UPDATE ON pos.hsn_gst
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Products (GLOBAL; product_code = major||minor||pack; + hsn_code) ----------
CREATE TABLE pos.products (
  major_code    CHAR(2) NOT NULL REFERENCES pos.categories_major(major_code) ON UPDATE CASCADE ON DELETE CASCADE,
  minor_code    CHAR(2) NOT NULL ,
  pack_code     CHAR(2) NOT NULL REFERENCES pos.packing_type(pack_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  product_code  CHAR(6) GENERATED ALWAYS AS (major_code || minor_code || pack_code) STORED,
  hsn_code      VARCHAR(10) NOT NULL REFERENCES pos.hsn_gst(hsn_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  sku_code      VARCHAR(20) NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  uom           VARCHAR(20) NOT NULL DEFAULT 'PCS',
  barcode       VARCHAR(50),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_products PRIMARY KEY (product_code),
  CONSTRAINT pk_minor FOREIGN KEY (major_code,minor_code)
    REFERENCES pos.categories_minor(major_code,minor_code)
    ON UPDATE CASCADE ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS trg_products_touch ON pos.products;
CREATE TRIGGER trg_products_touch
BEFORE UPDATE ON pos.products
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Branch Products (branch inventory) ----------
CREATE TABLE pos.branch_products (
  company_code  CHAR(2) NOT NULL,
  state_code    CHAR(2) NOT NULL,
  branch_code   CHAR(2) NOT NULL,
  product_code  CHAR(6) NOT NULL,
  branch_product_key CHAR(12) GENERATED ALWAYS AS (company_code || state_code || branch_code || product_code) STORED,

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

  CONSTRAINT pk_branch_products PRIMARY KEY (company_code, state_code, branch_code, product_code),
  CONSTRAINT fk_bp_branch FOREIGN KEY (company_code, state_code, branch_code)
    REFERENCES pos.branches(company_code, state_code, branch_code)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_bp_product FOREIGN KEY (product_code)
    REFERENCES pos.products(product_code)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_branch_products_key ON pos.branch_products (branch_product_key);
DROP TRIGGER IF EXISTS trg_branch_products_touch ON pos.branch_products;
CREATE TRIGGER trg_branch_products_touch
BEFORE UPDATE ON pos.branch_products
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Clients (GLOBAL) ----------
CREATE TABLE pos.clients (
  client_code   CHAR(3) PRIMARY KEY,
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
  CONSTRAINT client_code_digits CHECK (client_code ~ '^[0-9]{3}$')
);
DROP TRIGGER IF EXISTS trg_clients_touch ON pos.clients;
CREATE TRIGGER trg_clients_touch
BEFORE UPDATE ON pos.clients
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Vendors (GLOBAL) ----------
CREATE TABLE pos.vendors (
  vendor_code   CHAR(2) PRIMARY KEY,
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
  CONSTRAINT vendor_code_digits CHECK (vendor_code ~ '^[0-9]{2}$')
);
DROP TRIGGER IF EXISTS trg_vendors_touch ON pos.vendors;
CREATE TRIGGER trg_vendors_touch
BEFORE UPDATE ON pos.vendors
FOR EACH ROW EXECUTE FUNCTION pos.touch_updated_at();

-- ---------- Discounts (branch + product scoped) ----------
CREATE TABLE pos.discounts (
  company_code  CHAR(2) NOT NULL,
  state_code    CHAR(2) NOT NULL,
  branch_code   CHAR(2) NOT NULL,
  product_code  CHAR(6) NOT NULL,
  discount_pct  percent_100 NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_discount_dates CHECK (end_date >= start_date),
  CONSTRAINT pk_discounts PRIMARY KEY (company_code, state_code, branch_code, product_code, start_date, end_date),
  CONSTRAINT fk_disc_branch FOREIGN KEY (company_code, state_code, branch_code)
    REFERENCES pos.branches(company_code, state_code, branch_code)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_disc_product FOREIGN KEY (product_code)
    REFERENCES pos.products(product_code)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_discounts_dates
  ON pos.discounts (company_code, state_code, branch_code, product_code, start_date, end_date);

-- ---------- Helpful indexes ----------
CREATE INDEX IF NOT EXISTS ix_products_name           ON pos.products (product_name);
CREATE INDEX IF NOT EXISTS ix_branch_products_lookup  ON pos.branch_products (company_code, state_code, branch_code, product_code);

-- ---------- Views ----------
-- Current GST for each product (products.hsn_code → hsn_gst)
CREATE OR REPLACE VIEW pos.v_product_current_gst AS
SELECT
  p.product_code,
  p.product_name,
  p.hsn_code,
  h.hsn_name,
  h.cgst_rate,
  h.sgst_rate,
  h.igst_rate
FROM pos.products p
JOIN pos.hsn_gst h ON h.hsn_code = p.hsn_code;

-- Active discounts today
CREATE OR REPLACE VIEW pos.v_active_discounts AS
SELECT
  d.company_code, d.state_code, d.branch_code,
  d.product_code, d.discount_pct, d.start_date, d.end_date,
  p.product_name
FROM pos.discounts d
JOIN pos.products  p ON p.product_code = d.product_code
WHERE CURRENT_DATE BETWEEN d.start_date AND d.end_date;

-- Low stock at branches (branch_products)
CREATE OR REPLACE VIEW pos.v_inventory_below_min AS
SELECT
  bp.company_code, bp.state_code, bp.branch_code, bp.product_code,
  bp.on_hand_qty, bp.min_qty, bp.max_qty,
  p.product_name,
  b.branch_name
FROM pos.branch_products bp
JOIN pos.products p ON p.product_code = bp.product_code
JOIN pos.branches b
  ON b.company_code = bp.company_code
 AND b.state_code   = bp.state_code
 AND b.branch_code  = bp.branch_code
WHERE bp.on_hand_qty < bp.min_qty;

-- ============================================================
-- END v4.4
-- ============================================================

