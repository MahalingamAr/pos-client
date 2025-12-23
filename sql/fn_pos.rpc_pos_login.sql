-- function: pos.rpc_pos_login.sql

create or replace function pos.rpc_pos_login(
  p_company_id text,
  p_user_id    text,
  p_password   text
)
returns jsonb
language plpgsql
security definer
set search_path = pos
as $$
declare
  v_company_id text;
  v_user_id    text;
  v_password   text;

  v_company record;
  v_user    record;

  v_token  text;
  v_claims jsonb;
begin
  -- Normalise inputs: pad company to 2 chars, trim user
  v_company_id := lpad(trim(coalesce(p_company_id, '')), 2, '0');
  v_user_id    := trim(coalesce(p_user_id, ''));
  v_password   := coalesce(p_password, '');

  -- Basic presence checks (client also does this, but we keep parity)
  if v_company_id = '' then
    return jsonb_build_object('ok', false, 'error', 'COMPANY_ID_MISSING');
  end if;
  if v_user_id = '' then
    return jsonb_build_object('ok', false, 'error', 'USER_ID_MISSING');
  end if;
  if v_password = '' then
    return jsonb_build_object('ok', false, 'error', 'PASSWORD_MISSING');
  end if;

  -- 1) Company lookup (same as auth.js)
  select
    trim(c.company_id) as company_id,
    c.company_name
  into v_company
  from pos.companies c
  where trim(c.company_id) = v_company_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'COMPANY_NOT_FOUND');
  end if;

  -- 2) User + role lookup
  select
    trim(u.user_id)    as user_id,
    trim(u.company_id) as company_id,
    u.password_hash    as password_hash,
    coalesce(u.is_active, true) as is_active,
    r.role_name        as role_name
  into v_user
  from pos.users u
  join pos.roles r
    on r.role_id = u.role_id
  where trim(u.user_id)    = v_user_id
    and trim(u.company_id) = v_company_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'USER_NOT_FOUND');
  end if;

  if v_user.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'USER_INACTIVE');
  end if;

  -- 3) Password check using bcrypt (pgcrypto's crypt)
  --    crypt(input_password, stored_hash) must equal stored_hash
  if extensions.crypt(v_password, v_user.password_hash) <> v_user.password_hash then
    return jsonb_build_object('ok', false, 'error', 'PASSWORD_MISMATCH');
  end if;

  -- 4) Build claims object similar to auth.js
  v_claims := jsonb_build_object(
    'sub',          v_company.company_id || ':' || v_user.user_id,
    'company_id',   v_company.company_id,
    'company_name', v_company.company_name,
    'user_id',      v_user.user_id,
    'role_name',    v_user.role_name,
    'timezone',     'Asia/Singapore'
  );

  -- 5) Generate a random token (front-end just stores it)
  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  return jsonb_build_object(
    'ok',    true,
    'token', v_token,
    'user',  v_claims
  );
end;
$$;

-- Allow frontend (anon/authenticated) to call it
grant execute on function pos.rpc_pos_login(text, text, text)
  to anon, authenticated;

