-- audit_logs must be INSERT-only for the authenticator role.
-- Prevents any application code from updating or deleting audit records.
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticator;
