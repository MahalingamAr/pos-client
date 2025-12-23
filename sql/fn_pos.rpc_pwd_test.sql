-- 🔐 Standalone RPC to test bcrypt/crypt for a single user
CREATE OR REPLACE FUNCTION pos.rpc_pwd_test(
  p_user_id    text,
  p_password   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    u         pos.users%rowtype;
    is_match  boolean;
BEGIN
    -- 1) Fetch the user row
    SELECT *
    INTO u
    FROM pos.users
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'reason', 'USER_NOT_FOUND'
        );
    END IF;

    IF u.password_hash IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'reason', 'NO_PASSWORD_HASH'
        );
    END IF;

    -- 2) Compare using bcrypt-compatible crypt()
    is_match := crypt(p_password, u.password_hash) = u.password_hash;

    -- 3) Return debug info
    RETURN jsonb_build_object(
        'ok', true,
        'user_id', u.user_id,
        'match', is_match,
        'hash_prefix', left(u.password_hash, 10)  -- for visual check
    );
END;
$$;

-- 👤 Allow calling from anon/authenticated (adjust if you want)
GRANT EXECUTE ON FUNCTION pos.rpc_pwd_test(text, text)
TO anon, authenticated;

