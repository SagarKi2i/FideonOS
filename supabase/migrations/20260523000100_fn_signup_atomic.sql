-- Atomic signup: accepts invite + creates user + assigns role in one transaction.
-- Called via supabase.rpc('signup_atomic', {...})
CREATE OR REPLACE FUNCTION public.signup_atomic(
    p_token_hash  TEXT,
    p_password_hash TEXT,
    p_now         TIMESTAMPTZ DEFAULT now()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invite      RECORD;
    v_user_id     UUID;
    v_result      JSON;
BEGIN
    -- Lock and validate invite row
    SELECT id, email, status, expires_at
    INTO v_invite
    FROM public.invites
    WHERE token_hash = p_token_hash
      AND status = 'PENDING'
      AND expires_at > p_now
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'invalid_invite');
    END IF;

    -- Mark invite accepted
    UPDATE public.invites
    SET status = 'ACCEPTED'
    WHERE id = v_invite.id;

    -- Create user
    INSERT INTO public.users (email, password_hash, status)
    VALUES (v_invite.email, p_password_hash, 'pending')
    RETURNING id INTO v_user_id;

    -- Assign default role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'user');

    RETURN json_build_object('user_id', v_user_id, 'email', v_invite.email);
END;
$$;

-- Only the service role (FastAPI backend) may call this function
REVOKE EXECUTE ON FUNCTION public.signup_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_atomic TO service_role;
