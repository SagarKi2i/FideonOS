-- Fideon Admin seed script
-- Run manually after migrations: supabase db execute --file supabase/seed_fideon_admin.sql
-- Email:    fideonadmin@gmail.com
-- Password: Admin@12345  (Argon2id hash below)

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Insert admin user (auto-verified, active)
  INSERT INTO public.users (
    email,
    password_hash,
    status,
    email_verified_at,
    full_name
  )
  VALUES (
    'fideonadmin@gmail.com',
    '$argon2id$v=19$m=65536,t=3,p=4$E4PWSjYunISt2o96TK74pg$LmaZqxloM2dA62bCrvWvTal6/cv0cMfNDAHGpPFPNu0',
    'active',
    now(),
    'Fideon Admin'
  )
  ON CONFLICT (email) DO UPDATE
    SET
      password_hash     = EXCLUDED.password_hash,
      status            = 'active',
      email_verified_at = COALESCE(public.users.email_verified_at, now()),
      full_name         = EXCLUDED.full_name,
      updated_at        = now();

  -- Fetch id separately so ON CONFLICT (re-run) also returns the existing row id
  SELECT id INTO v_admin_id FROM public.users WHERE email = 'fideonadmin@gmail.com';

  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE
    SET role = 'admin';

  RAISE NOTICE 'Fideon Admin seeded: id=%, email=fideonadmin@gmail.com', v_admin_id;
END $$;
