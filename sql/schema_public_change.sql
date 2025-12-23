\c posdb

-- future tables/sequences in public schema will be owned/usable by pos_user
ALTER SCHEMA public OWNER TO pos_user;
GRANT USAGE, CREATE ON SCHEMA public TO pos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO pos_user;

