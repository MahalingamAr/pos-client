-- Get distinct states that have active branches for a given company
create or replace function pos.rpc_list_vendors(
)
returns table (
  vendor_id   text,
  vendor_name text
)
language sql
stable
as $$
  select vendor_id,vendor_name from pos.vendors;
$$;

grant execute on function pos.rpc_list_vendors() to anon;
commit;

