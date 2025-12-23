
      SELECT 
        u.user_id,
        TRIM(u.company_id) AS company_id,
        u.password_hash,
        u.is_active,
        TRIM(u.role_id) AS role_id,
        r.name AS role_name
      FROM public.users u
      JOIN public.roles r
        ON TRIM(r.id) = TRIM(u.role_id) -- both CHAR(2)
      WHERE u.user_id = 'Arthy'
        AND TRIM(u.company_id) = TRIM('01')
      LIMIT 1
