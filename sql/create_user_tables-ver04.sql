-- ================================
-- RBAC UPGRADE: schema-aware rights (fixed)
-- ================================

BEGIN;

-- Ensure we are using explicit schemas
SET search_path TO pos;

-- Drop tables in dependency-safe order
DROP TABLE IF EXISTS pos.users CASCADE ;
DROP TABLE IF EXISTS pos.roles CASCADE ;
commit;
-- 1) Base tables
CREATE TABLE IF NOT EXISTS pos.roles (
  role_id  CHAR(2)  PRIMARY KEY,
  role_name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS pos.users (
  company_id    CHAR(2) NOT NULL REFERENCES pos.companies(company_id) ON DELETE RESTRICT,
  role_id       CHAR(2) NOT NULL REFERENCES pos.roles(role_id) ON DELETE RESTRICT,
  user_id       VARCHAR(15)   NOT NULL,
  password_hash TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY ( company_id,role_id,user_id)
);

INSERT INTO pos.roles (role_id,role_name) VALUES  ('01','admin');
INSERT INTO pos.roles (role_id,role_name) VALUES  ('02','manager');
INSERT INTO pos.roles (role_id,role_name) VALUES  ('03','clerk');


INSERT INTO pos.users (user_id, password_hash, role_id, is_active, company_id)
VALUES
  ('Arthy',    '$2b$10$sZN14jXO/7ZkNlNL18xy9eyFkMdtozbs2jCyaGHO/O0Zll/dFpaz6',
               (SELECT role_id FROM pos.roles WHERE role_name = 'admin'),   TRUE, '01'),
  ('JSudhagar','$2b$10$vJml0XnyGBTGZEPuf8MATOy1JMV/5DKDPoYVsUKJOBGLbz.lrvC8K',
               (SELECT role_id FROM pos.roles WHERE role_name = 'manager'), TRUE, '01'),
  ('Haniska',  '$2b$10$FYaFhWFbMFkjZhu6cmhHvuYOt6oui62HdcPoSuz2jnkJxBKLTuB7K',
               (SELECT role_id FROM pos.roles WHERE role_name = 'clerk'),   TRUE, '01');



commit;


