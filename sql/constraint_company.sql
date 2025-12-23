alter table pos.users drop constraint users_company_id_fkey;

-- run your seed inserts/updates

alter table pos.users
add constraint users_company_id_fkey
  foreign key (company_id)
  references pos.companies(company_id);

