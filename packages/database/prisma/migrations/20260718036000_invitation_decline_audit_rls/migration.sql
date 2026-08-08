DROP POLICY "audit_events_tenant_policy" ON "audit_events";

CREATE POLICY "audit_events_tenant_policy" ON "audit_events"
  FOR ALL TO weddingos_app
  USING (
    ("workspace_id" IS NULL AND "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    OR (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND (
        public.weddingos_has_workspace_access("workspace_id")
        OR public.weddingos_has_valid_invitation("workspace_id", "actor_user_id")
      )
    )
  )
  WITH CHECK (
    ("workspace_id" IS NULL AND "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    OR (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND (
        public.weddingos_has_workspace_access("workspace_id")
        OR public.weddingos_has_valid_invitation("workspace_id", "actor_user_id")
      )
    )
  );
