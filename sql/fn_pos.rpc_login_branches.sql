-- Get active branches for a given company & state
create or replace function pos.rpc_login_branches(
  p_company_id text,
  p_state_id   text
)
returns table (
  branch_id   text,
  branch_name text
)
language sql
stable
as $$
  select
    trim(b.branch_id)   as branch_id,
    b.branch_name
  from pos.branches b
  where trim(b.company_id) = trim(p_company_id)
    and trim(b.state_id)   = trim(p_state_id)
    and coalesce(b.is_active, true) = true
  order by trim(b.branch_id);
$$;

grant execute on function pos.rpc_select_branches(text, text) to anon;

