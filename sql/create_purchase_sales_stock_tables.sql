BEGIN;

-- Sales invoice header (billing)
CREATE TABLE IF NOT EXISTS pos.sales_invoice (
  sales_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id     CHAR(2)     NOT NULL REFERENCES pos.companies(company_id),
  state_id       CHAR(2)     NOT NULL REFERENCES pos.states(state_id),
  branch_id      CHAR(2)     NOT NULL,
  CONSTRAINT fk_sales_branch FOREIGN KEY (company_id, state_id, branch_id)
    REFERENCES pos.branches (company_id, state_id, branch_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  invoice_no     text,                    -- format yymmddnnn like 251201001
  invoice_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  invoice_time   TIMESTAMPTZ NOT NULL DEFAULT now(),

  client_id      CHAR(3)     NULL REFERENCES pos.clients(client_id),
  customer_name  VARCHAR(200),

  payment_mode   TEXT        NOT NULL CHECK (
                  payment_mode IN ('CASH','CARD','UPI','CREDIT','MIXED')
                ),

  gross_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,

  cgst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,

  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- total GST (CGST+SGST+IGST)
  net_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,

  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,

  remarks        VARCHAR(300),

  created_by     VARCHAR(15) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sales_invoice_branch_date
  ON pos.sales_invoice (company_id, state_id, branch_id, invoice_date);

COMMIT;
BEGIN;

CREATE TABLE IF NOT EXISTS pos.sales_invoice_item (
  sales_item_id   BIGSERIAL PRIMARY KEY,
  sales_id        uuid      NOT NULL REFERENCES pos.sales_invoice(sales_id) ON DELETE CASCADE,

  line_no         SMALLINT  NOT NULL,
  product_id      CHAR(6)   NOT NULL REFERENCES pos.products(product_id),

  quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  uom             VARCHAR(20)   NOT NULL DEFAULT 'PCS',

  unit_price      NUMERIC(12,2) NOT NULL,
  mrp             NUMERIC(12,2),

  discount_pct    percent_100   NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  taxable_amount  NUMERIC(12,2) NOT NULL,

  cgst_rate       percent_100   NOT NULL,
  sgst_rate       percent_100   NOT NULL,
  igst_rate       percent_100   NOT NULL,

  cgst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,

  tax_amount      NUMERIC(12,2) NOT NULL,  -- total GST on this line
  line_total      NUMERIC(12,2) NOT NULL,  -- taxable + tax

  CONSTRAINT uk_sales_item_line UNIQUE (sales_id, line_no)
);

CREATE INDEX IF NOT EXISTS ix_sales_item_product
  ON pos.sales_invoice_item (product_id);

COMMIT;
BEGIN;

CREATE TABLE IF NOT EXISTS pos.purchase_invoice (
  purchase_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id     CHAR(2)     NOT NULL REFERENCES pos.companies(company_id),
  state_id       CHAR(2)     NOT NULL REFERENCES pos.states(state_id),
  branch_id      CHAR(2)     NOT NULL,
  CONSTRAINT fk_pur_branch FOREIGN KEY (company_id, state_id, branch_id)
    REFERENCES pos.branches (company_id, state_id, branch_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  invoice_no     BIGSERIAL,
  invoice_date   DATE        NOT NULL,
  invoice_time   TIMESTAMPTZ NOT NULL DEFAULT now(),

  vendor_id      CHAR(2)     NOT NULL REFERENCES pos.vendors(vendor_id),
  vendor_invoice_no   VARCHAR(50),
  vendor_invoice_date DATE,

  gross_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,

  cgst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,

  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,

  remarks        VARCHAR(300),

  created_by     VARCHAR(15) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_purchase_branch_date
  ON pos.purchase_invoice (company_id, state_id, branch_id, invoice_date);

COMMIT;
BEGIN;

CREATE TABLE IF NOT EXISTS pos.purchase_invoice_item (
  purchase_item_id BIGSERIAL PRIMARY KEY,
  purchase_id      uuid      NOT NULL REFERENCES pos.purchase_invoice(purchase_id) ON DELETE CASCADE,

  line_no          SMALLINT  NOT NULL,
  product_id       CHAR(6)   NOT NULL REFERENCES pos.products(product_id),

  quantity         NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  uom              VARCHAR(20)   NOT NULL DEFAULT 'PCS',

  unit_cost        NUMERIC(12,2) NOT NULL,
  mrp              NUMERIC(12,2),

  discount_pct     percent_100   NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,

  taxable_amount   NUMERIC(12,2) NOT NULL,

  cgst_rate        percent_100   NOT NULL,
  sgst_rate        percent_100   NOT NULL,
  igst_rate        percent_100   NOT NULL,

  cgst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,

  tax_amount       NUMERIC(12,2) NOT NULL,
  line_total       NUMERIC(12,2) NOT NULL,

  CONSTRAINT uk_purchase_item_line UNIQUE (purchase_id, line_no)
);

CREATE INDEX IF NOT EXISTS ix_purchase_item_product
  ON pos.purchase_invoice_item (product_id);

COMMIT;
BEGIN;

CREATE TABLE IF NOT EXISTS pos.stock_ledger (
  id             BIGSERIAL PRIMARY KEY,

  company_id     CHAR(2) NOT NULL,
  state_id       CHAR(2) NOT NULL,
  branch_id      CHAR(2) NOT NULL,
  product_id     CHAR(6) NOT NULL,

  movement_time  TIMESTAMPTZ NOT NULL DEFAULT now(),

  movement_type  TEXT NOT NULL CHECK (
                  movement_type IN (
                    'OPENING',
                    'PURCHASE',
                    'SALE',
                    'ADJUST_PLUS',
                    'ADJUST_MINUS',
                    'TRANSFER_IN',
                    'TRANSFER_OUT'
                  )
                ),

  qty_in         NUMERIC(12,3) NOT NULL DEFAULT 0,
  qty_out        NUMERIC(12,3) NOT NULL DEFAULT 0,

  ref_table      TEXT,
  ref_id         uuid,

  CONSTRAINT fk_ledger_branch FOREIGN KEY (company_id, state_id, branch_id)
    REFERENCES pos.branches (company_id, state_id, branch_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT fk_ledger_product FOREIGN KEY (product_id)
    REFERENCES pos.products (product_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_stock_ledger_product_branch
  ON pos.stock_ledger (company_id, state_id, branch_id, product_id);

COMMIT;

CREATE OR REPLACE VIEW pos.v_current_stock AS
SELECT
  company_id,
  state_id,
  branch_id,
  product_id,
  sum(qty_in - qty_out) AS qty_balance
FROM pos.stock_ledger
GROUP BY company_id, state_id, branch_id, product_id;

COMMIT;

