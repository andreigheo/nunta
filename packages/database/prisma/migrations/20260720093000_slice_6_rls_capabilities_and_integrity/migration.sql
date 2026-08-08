-- Slice 6 invariants, tenant policies and least-privilege grants.

ALTER TABLE "stored_objects"
  ADD CONSTRAINT "stored_objects_one_owner" CHECK (("workspace_id" IS NOT NULL)::int + ("vendor_organization_id" IS NOT NULL)::int = 1),
  ADD CONSTRAINT "stored_objects_positive_size" CHECK ("size_bytes" IS NULL OR "size_bytes" > 0);
ALTER TABLE "file_upload_sessions"
  ADD CONSTRAINT "file_upload_sessions_one_owner" CHECK (("workspace_id" IS NOT NULL)::int + ("vendor_organization_id" IS NOT NULL)::int = 1),
  ADD CONSTRAINT "file_upload_sessions_positive_limit" CHECK ("maximum_size_bytes" > 0);
ALTER TABLE "document_folders"
  ADD CONSTRAINT "document_folders_one_owner" CHECK (("workspace_id" IS NOT NULL)::int + ("vendor_organization_id" IS NOT NULL)::int = 1);
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_one_owner" CHECK (("workspace_id" IS NOT NULL)::int + ("vendor_organization_id" IS NOT NULL)::int = 1);
ALTER TABLE "online_payment_checkouts"
  ADD CONSTRAINT "online_payment_checkouts_positive_amount" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "online_payment_checkouts_local_paths" CHECK ("success_return_path" ~ '^/[^/]' AND "cancel_return_path" ~ '^/[^/]');
ALTER TABLE "online_payment_transactions"
  ADD CONSTRAINT "online_payment_transactions_amounts" CHECK (
    "amount_authorized_minor" >= 0 AND "amount_captured_minor" >= 0 AND
    "amount_refunded_minor" >= 0 AND "amount_refunded_minor" <= "amount_captured_minor"
  );
ALTER TABLE "online_payment_refunds"
  ADD CONSTRAINT "online_payment_refunds_positive_amount" CHECK ("amount_minor" > 0);

CREATE UNIQUE INDEX "signature_one_active_envelope_per_version"
  ON "electronic_signature_envelopes" ("contract_version_id")
  WHERE "status" IN ('DRAFT','CREATING','READY','SENT','VIEWED','PARTIALLY_SIGNED');
CREATE UNIQUE INDEX "online_checkout_one_active_per_schedule"
  ON "online_payment_checkouts" ("payment_schedule_entry_id")
  WHERE "status" IN ('CREATING','OPEN');

CREATE OR REPLACE FUNCTION public.weddingos_reject_document_version_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'document versions are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "document_versions_immutable"
  BEFORE UPDATE OR DELETE ON "document_versions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_document_version_change();

CREATE OR REPLACE FUNCTION public.weddingos_reject_append_only_access_event_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'document access events are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "document_access_events_append_only"
  BEFORE UPDATE OR DELETE ON "document_access_events"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_append_only_access_event_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "stored_objects", "file_upload_sessions", "document_folders", "documents",
  "document_versions", "document_resource_links", "document_access_grants",
  "document_retention_policies", "contract_document_materializations",
  "electronic_signature_envelopes", "electronic_signature_signers",
  "electronic_signature_evidence", "online_payment_checkouts",
  "online_payment_transactions", "online_payment_attempts", "online_payment_refunds"
TO weddingos_app;
GRANT SELECT, INSERT ON TABLE "document_access_events", "electronic_signature_events", "payment_provider_events" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "payment_reconciliation_runs" TO weddingos_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  "stored_objects", "file_upload_sessions", "documents", "document_versions",
  "document_resource_links", "document_access_grants", "document_access_events",
  "document_retention_policies", "contract_document_materializations",
  "electronic_signature_envelopes", "electronic_signature_signers",
  "electronic_signature_events", "electronic_signature_evidence",
  "online_payment_checkouts", "online_payment_transactions", "online_payment_attempts",
  "online_payment_refunds", "payment_provider_events", "payment_reconciliation_runs"
TO weddingos_worker;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'stored_objects','file_upload_sessions','document_folders','documents',
    'document_versions','document_resource_links','document_access_grants',
    'document_access_events','document_retention_policies',
    'contract_document_materializations','electronic_signature_envelopes',
    'electronic_signature_signers','electronic_signature_evidence',
    'online_payment_checkouts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING ((workspace_id IS NOT NULL AND public.weddingos_has_workspace_access(workspace_id)) OR (vendor_organization_id IS NOT NULL AND public.weddingos_has_vendor_access(vendor_organization_id))) WITH CHECK ((workspace_id IS NOT NULL AND public.weddingos_has_workspace_access(workspace_id)) OR (vendor_organization_id IS NOT NULL AND public.weddingos_has_vendor_access(vendor_organization_id)))',
      table_name || '_app_tenant', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id))',
      table_name || '_worker_tenant', table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'online_payment_transactions','online_payment_attempts','online_payment_refunds'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_workspace_access(workspace_id)) WITH CHECK (public.weddingos_has_workspace_access(workspace_id))',
      table_name || '_app_workspace', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL))',
      table_name || '_worker_workspace', table_name
    );
  END LOOP;
END $$;

DROP POLICY "file_upload_sessions_app_tenant" ON "file_upload_sessions";
CREATE POLICY "file_upload_sessions_app_tenant" ON "file_upload_sessions" FOR ALL TO weddingos_app
USING (
  "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND (("workspace_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "workspace_memberships" membership
    WHERE membership.workspace_id = file_upload_sessions.workspace_id
      AND membership.user_id = file_upload_sessions.user_id AND membership.status = 'ACTIVE'
  )) OR ("vendor_organization_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "vendor_organization_memberships" membership
    WHERE membership.vendor_organization_id = file_upload_sessions.vendor_organization_id
      AND membership.user_id = file_upload_sessions.user_id AND membership.status = 'ACTIVE'
  )))
)
WITH CHECK (
  "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND (("workspace_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "workspace_memberships" membership
    WHERE membership.workspace_id = file_upload_sessions.workspace_id
      AND membership.user_id = file_upload_sessions.user_id AND membership.status = 'ACTIVE'
  )) OR ("vendor_organization_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "vendor_organization_memberships" membership
    WHERE membership.vendor_organization_id = file_upload_sessions.vendor_organization_id
      AND membership.user_id = file_upload_sessions.user_id AND membership.status = 'ACTIVE'
  )))
);

CREATE OR REPLACE FUNCTION public.weddingos_can_read_document(target_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents document
    WHERE document.id = target_document_id
      AND document.deleted_at IS NULL
      AND (
        (document.workspace_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.workspace_memberships membership
          WHERE membership.workspace_id = document.workspace_id
            AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND membership.status = 'ACTIVE'
        ))
        OR (document.vendor_organization_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.vendor_organization_memberships membership
          WHERE membership.vendor_organization_id = document.vendor_organization_id
            AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND membership.status = 'ACTIVE'
        ))
        OR EXISTS (
          SELECT 1 FROM public.document_access_grants grant_row
          WHERE grant_row.document_id = document.id
            AND grant_row.revoked_at IS NULL
            AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
            AND (
              (grant_row.grantee_type = 'USER' AND grant_row.grantee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
              OR (grant_row.grantee_type IN ('WORKSPACE','CONTRACT_PARTY','BOOKING_PARTY') AND EXISTS (
                SELECT 1 FROM public.workspace_memberships membership
                WHERE membership.workspace_id = grant_row.grantee_id
                  AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                  AND membership.status = 'ACTIVE'
              ))
              OR (grant_row.grantee_type IN ('VENDOR_ORGANIZATION','CONTRACT_PARTY','BOOKING_PARTY') AND EXISTS (
                SELECT 1 FROM public.vendor_organization_memberships membership
                WHERE membership.vendor_organization_id = grant_row.grantee_id
                  AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                  AND membership.status = 'ACTIVE'
              ))
            )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.weddingos_can_read_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_can_read_document(uuid) TO weddingos_app, weddingos_worker;

CREATE POLICY "documents_shared_read" ON "documents" FOR SELECT TO weddingos_app
USING (public.weddingos_can_read_document("id"));
CREATE POLICY "document_versions_shared_read" ON "document_versions" FOR SELECT TO weddingos_app
USING (public.weddingos_can_read_document("document_id"));
CREATE POLICY "document_links_shared_read" ON "document_resource_links" FOR SELECT TO weddingos_app
USING (public.weddingos_can_read_document("document_id"));
CREATE POLICY "document_grants_shared_read" ON "document_access_grants" FOR SELECT TO weddingos_app
USING (public.weddingos_can_read_document("document_id"));
CREATE POLICY "document_events_shared_read" ON "document_access_events" FOR SELECT TO weddingos_app
USING (public.weddingos_can_read_document("document_id"));

CREATE OR REPLACE FUNCTION public.weddingos_resolve_document_tenant(target_document_id uuid, target_user_id uuid)
RETURNS TABLE (workspace_id uuid, vendor_organization_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
BEGIN
  PERFORM set_config('app.current_user_id', target_user_id::text, true);
  RETURN QUERY
  SELECT document.workspace_id, document.vendor_organization_id
  FROM public.documents document
  WHERE document.id = target_document_id
    AND public.weddingos_can_read_document(document.id)
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_document_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_document_tenant(uuid, uuid) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_payment_provider_context(
  target_provider text,
  target_provider_checkout_id text
)
RETURNS TABLE (workspace_id uuid, checkout_id uuid, actor_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT checkout.workspace_id, checkout.id, checkout.created_by
  FROM public.online_payment_checkouts checkout
  WHERE checkout.provider = target_provider
    AND checkout.provider_checkout_id = target_provider_checkout_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_payment_provider_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_payment_provider_context(text, text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_signature_provider_context(
  target_provider text,
  target_provider_envelope_id text
)
RETURNS TABLE (workspace_id uuid, vendor_organization_id uuid, envelope_id uuid, actor_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT envelope.workspace_id, envelope.vendor_organization_id, envelope.id, envelope.created_by
  FROM public.electronic_signature_envelopes envelope
  WHERE envelope.provider = target_provider
    AND envelope.provider_envelope_id = target_provider_envelope_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_signature_provider_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_signature_provider_context(text, text) TO weddingos_app;

ALTER TABLE "electronic_signature_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "electronic_signature_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "signature_events_app_related" ON "electronic_signature_events" FOR SELECT TO weddingos_app USING (
  EXISTS (SELECT 1 FROM "electronic_signature_envelopes" envelope WHERE envelope.id = envelope_id)
);
CREATE POLICY "signature_events_app_insert" ON "electronic_signature_events" FOR INSERT TO weddingos_app WITH CHECK (true);
CREATE POLICY "signature_events_worker" ON "electronic_signature_events" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

ALTER TABLE "payment_provider_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_provider_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_provider_events_app_insert" ON "payment_provider_events" FOR INSERT TO weddingos_app WITH CHECK (true);
CREATE POLICY "payment_provider_events_app_related" ON "payment_provider_events" FOR SELECT TO weddingos_app USING (
  EXISTS (
    SELECT 1 FROM "online_payment_checkouts" checkout
    WHERE checkout.provider = payment_provider_events.provider
      AND (checkout.provider_checkout_id = payment_provider_events.provider_checkout_id OR EXISTS (
        SELECT 1 FROM "online_payment_transactions" transaction_row
        WHERE transaction_row.checkout_id = checkout.id
          AND transaction_row.provider_payment_id = payment_provider_events.provider_payment_id
      ))
  )
);
CREATE POLICY "payment_provider_events_worker" ON "payment_provider_events" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

ALTER TABLE "payment_reconciliation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_reconciliation_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_reconciliation_app" ON "payment_reconciliation_runs" FOR ALL TO weddingos_app USING (
  NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
) WITH CHECK (NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL);
CREATE POLICY "payment_reconciliation_worker" ON "payment_reconciliation_runs" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

UPDATE "role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '[
    "document.read","document.write","document.upload","document.download","document.share","document.delete","document.read_sensitive","document.manage_retention","document.view_access_log",
    "signature.read","signature.create","signature.send","signature.cancel","signature.sign","signature.download_evidence","signature.configure_provider",
    "online_payment.read","online_payment.create_checkout","online_payment.expire_checkout","online_payment.request_refund","online_payment.read_provider_details","online_payment.reconcile","online_payment.configure_provider"
  ]'::jsonb) capability
)
WHERE "key" IN ('couple_owner','couple_partner');

UPDATE "role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '[
    "document.read","document.write","document.upload","document.download",
    "signature.read","signature.create","signature.send","signature.sign","signature.download_evidence",
    "online_payment.read","online_payment.create_checkout","online_payment.expire_checkout"
  ]'::jsonb) capability
)
WHERE "key" = 'wedding_planner';

UPDATE "role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '["document.read","signature.read","online_payment.read"]'::jsonb) capability
)
WHERE "key" IN ('family_collaborator','viewer');

UPDATE "vendor_role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '[
    "document.read","document.write","document.upload","document.download","document.share","document.delete","document.view_access_log",
    "signature.read","signature.create","signature.send","signature.cancel","signature.sign","signature.download_evidence"
  ]'::jsonb) capability
)
WHERE "key" IN ('vendor_owner','vendor_manager');

UPDATE "vendor_role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '["document.read","document.download","signature.read","signature.sign"]'::jsonb) capability
)
WHERE "key" IN ('vendor_sales','vendor_operations','vendor_viewer');
