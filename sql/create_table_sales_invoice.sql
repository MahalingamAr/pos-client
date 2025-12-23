Drop table pos.sales_invoice cascade;

create table pos.sales_invoice (
  sales_id uuid not null default gen_random_uuid (),
  company_id character(2) not null,
  state_id character(2) not null,
  branch_id character(2) not null,
  invoice_no text  not null,
  invoice_date date not null default CURRENT_DATE,
  invoice_time time without time zone not null default (now())::time without time zone,
  client_id character(3) null,
  customer_name character varying(200) null,
  payment_mode text not null,
  gross_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  net_amount numeric(12, 2) not null default 0,
  remarks character varying(300) null,
  created_by character varying(15) not null,
  created_at timestamp with time zone not null default now(),
  constraint sales_invoice_pkey primary key (sales_id),
  constraint sales_invoice_company_id_fkey foreign KEY (company_id) references pos.companies (company_id),
  constraint sales_invoice_state_id_fkey foreign KEY (state_id) references pos.states (state_id),
  constraint fk_sales_branch foreign KEY (company_id, state_id, branch_id) references pos.branches (company_id, state_id, branch_id) on update CASCADE on delete RESTRICT,
  constraint sales_invoice_client_id_fkey foreign KEY (client_id) references pos.clients (client_id),
  constraint sales_invoice_payment_mode_check check (
    (
      payment_mode = any (
        array[
          'CASH'::text,
          'CARD'::text,
          'UPI'::text,
          'CREDIT'::text,
          'MIXED'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists ix_sales_invoice_branch_date on pos.sales_invoice using btree (company_id, state_id, branch_id, invoice_date) TABLESPACE pg_default;
