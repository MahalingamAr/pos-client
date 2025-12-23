-- ================================
-- RBAC UPGRADE: schema-aware rights (fixed)
-- ================================

BEGIN;

-- Ensure we are using explicit schemas
SET search_path TO public;

-- ⚠️ If you intend to reset RBAC tables, keep these drops; otherwise remove them.
-- Drop function first to avoid dependency errors

-- Drop tables in dependency-safe order
DROP TABLE IF EXISTS public.role_table_rights CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE ;
DROP TABLE IF EXISTS public.roles CASCADE ;
commit;

-- 1) Base tables
CREATE TABLE IF NOT EXISTS public.roles (
  id  CHAR(2)  PRIMARY KEY,
  name VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.staff (
  company_id    CHAR(2) NOT NULL REFERENCES pos.companies(company_id) ON DELETE RESTRICT,
  role_id       CHAR(2) NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  user_id       VARCHAR(10)   NOT NULL,
  password_hash TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY ( company_id,user_id)
);

-- Schema-aware rights table (adds table_schema)
CREATE TABLE IF NOT EXISTS public.role_table_rights (
  role_id     CHAR(2) NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  table_schema TEXT  NOT NULL,
  table_name   TEXT  NOT NULL,
  can_read     BOOLEAN NOT NULL DEFAULT TRUE,
  can_create   BOOLEAN NOT NULL DEFAULT FALSE,
  can_update   BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (role_id, table_schema, table_name)
);


commit;
END;
