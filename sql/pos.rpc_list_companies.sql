create or replace function rpc_list_companies()
returns setof pos.companies
language sql
security definer
set search_path = pos, public
as $$
  select * from pos.companies
  order by company_id;
$$;

