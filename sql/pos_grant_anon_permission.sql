-- 1. Allow anon to use the pos schema
grant usage on schema pos to anon;

-- 2. Allow read access to all current tables
grant select on all tables in schema pos to anon;

-- 3. Allow write access (optional)
grant insert, update, delete on all tables in schema pos to anon;

-- 4. Allow execute on all current functions (for RPC)
grant execute on all functions in schema pos to anon;

-- 5. Default privileges for FUTURE tables
alter default privileges in schema pos
grant select, insert, update, delete on tables to anon;

-- 6. Default privileges for FUTURE functions
alter default privileges in schema pos
grant execute on functions to anon;

