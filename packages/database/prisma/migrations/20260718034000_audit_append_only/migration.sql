-- Audit rows are append-only for the runtime application role. Migrations and
-- controlled owner-level retention jobs remain the only mutation path.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM weddingos_app;
