-- public.password_history — last-3 password reuse check (Argon2id hashes)
-- Prune trigger keeps at most 3 rows per user.
-- See: backend/docs/Auth_Module_Plan.md §2.8

CREATE TABLE public.password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prune_password_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.password_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.password_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 3
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER prune_password_history_trigger
  AFTER INSERT ON public.password_history
  FOR EACH ROW EXECUTE FUNCTION public.prune_password_history();

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
