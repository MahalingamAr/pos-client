-- Get distinct states that have active branches for a given company
create or replace function pos.rpc_login_states(
  p_company_id text
)
returns table (
  state_id   text,
  state_name text
)
language sql
stable
as $$
  select distinct
    trim(s.state_id) as state_id,
    s.state_name
  from pos.branches b
  join pos.states   s
    on trim(s.state_id) = trim(b.state_id)
  where trim(b.company_id) = trim(p_company_id)
    and coalesce(b.is_active, true) = true
  order by trim(s.state_id);
$$;

grant execute on function pos.rpc_login_states(text) to anon;
commit;

