drop function if exists pos.rpc_list_of_companies;

create  function pos.rpc_list_of_companies()
returns table(company_id char , company_name varchar,pincode varchar,phone varchar,gst_no varchar )
language sql
security definer
set search_path = pos
as $$
  select company_id, company_name,picode,phone,gst_no
    from pos.companies
  order by company_id
  limit 5;
$$;

