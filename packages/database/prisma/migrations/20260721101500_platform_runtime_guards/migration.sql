BEGIN;

ALTER TABLE "platform_grants"
  ADD CONSTRAINT "platform_grants_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "platform_grants_role_fk" FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "platform_grants_granted_by_fk" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "platform_support_notes"
  ADD CONSTRAINT "platform_support_notes_case_fk" FOREIGN KEY ("case_id") REFERENCES "platform_support_cases"("id") ON DELETE CASCADE;
ALTER TABLE "legal_document_versions"
  ADD CONSTRAINT "legal_document_versions_document_fk" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE CASCADE;
ALTER TABLE "user_consent_records"
  ADD CONSTRAINT "user_consent_records_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "user_consent_records_legal_version_fk" FOREIGN KEY ("legal_document_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "consent_withdrawals"
  ADD CONSTRAINT "consent_withdrawals_consent_fk" FOREIGN KEY ("consent_id") REFERENCES "user_consent_records"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "consent_withdrawals_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "cookie_preferences"
  ADD CONSTRAINT "cookie_preferences_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "data_subject_requests"
  ADD CONSTRAINT "data_subject_requests_requester_fk" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "data_subject_requests_artifact_fk" FOREIGN KEY ("artifact_id") REFERENCES "generated_artifacts"("id") ON DELETE SET NULL;
ALTER TABLE "deletion_requests"
  ADD CONSTRAINT "deletion_requests_requester_fk" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "retention_executions"
  ADD CONSTRAINT "retention_executions_policy_fk" FOREIGN KEY ("policy_id") REFERENCES "data_retention_policies"("id") ON DELETE RESTRICT;
ALTER TABLE "backup_artifacts"
  ADD CONSTRAINT "backup_artifacts_run_fk" FOREIGN KEY ("backup_run_id") REFERENCES "backup_runs"("id") ON DELETE CASCADE;
ALTER TABLE "backup_verifications"
  ADD CONSTRAINT "backup_verifications_run_fk" FOREIGN KEY ("backup_run_id") REFERENCES "backup_runs"("id") ON DELETE CASCADE;
ALTER TABLE "restore_runs"
  ADD CONSTRAINT "restore_runs_backup_fk" FOREIGN KEY ("backup_run_id") REFERENCES "backup_runs"("id") ON DELETE RESTRICT;
ALTER TABLE "restore_validations"
  ADD CONSTRAINT "restore_validations_run_fk" FOREIGN KEY ("restore_run_id") REFERENCES "restore_runs"("id") ON DELETE CASCADE;
ALTER TABLE "release_approvals"
  ADD CONSTRAINT "release_approvals_candidate_fk" FOREIGN KEY ("release_candidate_id") REFERENCES "release_candidates"("id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.weddingos_has_platform_capability(target_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_capability_grants grant_row
    WHERE grant_row.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND grant_row.capability = target_capability
      AND grant_row.active = true
      AND grant_row.revoked_at IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.platform_grants grant_row
    JOIN public.platform_roles role_row ON role_row.id = grant_row.role_id
    WHERE grant_row.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND grant_row.environment = COALESCE(NULLIF(current_setting('app.environment', true), ''), 'development')
      AND grant_row.active = true
      AND grant_row.revoked_at IS NULL
      AND grant_row.valid_from <= now()
      AND (grant_row.valid_until IS NULL OR grant_row.valid_until > now())
      AND role_row.capabilities ? target_capability
  );
$$;
REVOKE ALL ON FUNCTION public.weddingos_has_platform_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_has_platform_capability(text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_is_platform_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_capability_grants grant_row
    WHERE grant_row.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND grant_row.active = true AND grant_row.revoked_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.platform_grants grant_row
    WHERE grant_row.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND grant_row.environment = COALESCE(NULLIF(current_setting('app.environment', true), ''), 'development')
      AND grant_row.active = true AND grant_row.revoked_at IS NULL
      AND grant_row.valid_from <= now()
      AND (grant_row.valid_until IS NULL OR grant_row.valid_until > now())
  );
$$;
REVOKE ALL ON FUNCTION public.weddingos_is_platform_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_is_platform_actor() TO weddingos_app;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'platform_roles','platform_grants','platform_admin_actions','platform_support_cases',
    'platform_support_notes','platform_incidents','platform_feature_flags','platform_maintenance_windows',
    'legal_documents','legal_document_versions','user_consent_records','consent_withdrawals',
    'cookie_preferences','data_subject_requests','deletion_requests','data_retention_policies',
    'legal_holds','retention_executions','security_events','security_alerts','backup_runs',
    'backup_artifacts','backup_verifications','restore_runs','restore_validations',
    'release_candidates','release_approvals'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO weddingos_app', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO weddingos_worker', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY "platform_roles_platform" ON "platform_roles" FOR SELECT TO weddingos_app
  USING (public.weddingos_is_platform_actor());
CREATE POLICY "platform_grants_platform" ON "platform_grants" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.audit.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.audit.read'));
CREATE POLICY "platform_grants_self" ON "platform_grants" FOR SELECT TO weddingos_app
  USING ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "platform_admin_actions_read" ON "platform_admin_actions" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.audit.read'));
CREATE POLICY "platform_admin_actions_insert" ON "platform_admin_actions" FOR INSERT TO weddingos_app
  WITH CHECK (public.weddingos_is_platform_actor());

CREATE POLICY "platform_support_cases_read" ON "platform_support_cases" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.support.read'));
CREATE POLICY "platform_support_cases_write" ON "platform_support_cases" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.support.write'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.support.write'));
CREATE POLICY "platform_support_notes_read" ON "platform_support_notes" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.support.read'));
CREATE POLICY "platform_support_notes_write" ON "platform_support_notes" FOR INSERT TO weddingos_app
  WITH CHECK (public.weddingos_has_platform_capability('platform.support.write'));

CREATE POLICY "platform_incidents_platform" ON "platform_incidents" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.security.read') OR public.weddingos_has_platform_capability('platform.dashboard.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.security.respond'));
CREATE POLICY "platform_feature_flags_read" ON "platform_feature_flags" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.feature_flag.read'));
CREATE POLICY "platform_feature_flags_write" ON "platform_feature_flags" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.feature_flag.write'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.feature_flag.write'));
CREATE POLICY "platform_maintenance_read" ON "platform_maintenance_windows" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.maintenance.read'));
CREATE POLICY "platform_maintenance_write" ON "platform_maintenance_windows" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.maintenance.write'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.maintenance.write'));

CREATE POLICY "legal_documents_published" ON "legal_documents" FOR SELECT TO weddingos_app USING (true);
CREATE POLICY "legal_documents_platform" ON "legal_documents" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.process'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));
CREATE POLICY "legal_versions_published" ON "legal_document_versions" FOR SELECT TO weddingos_app
  USING ("status" = 'PUBLISHED' AND "effective_at" <= now());
CREATE POLICY "legal_versions_platform" ON "legal_document_versions" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.process'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));

CREATE POLICY "consent_owner" ON "user_consent_records" FOR SELECT TO weddingos_app
  USING ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid OR public.weddingos_has_platform_capability('platform.privacy.read'));
CREATE POLICY "consent_owner_insert" ON "user_consent_records" FOR INSERT TO weddingos_app
  WITH CHECK ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "withdrawal_owner" ON "consent_withdrawals" FOR SELECT TO weddingos_app
  USING ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid OR public.weddingos_has_platform_capability('platform.privacy.read'));
CREATE POLICY "withdrawal_owner_insert" ON "consent_withdrawals" FOR INSERT TO weddingos_app
  WITH CHECK ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "cookie_owner" ON "cookie_preferences" FOR ALL TO weddingos_app
  USING ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "dsr_owner" ON "data_subject_requests" FOR SELECT TO weddingos_app
  USING ("requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid OR public.weddingos_has_platform_capability('platform.privacy.read'));
CREATE POLICY "dsr_owner_insert" ON "data_subject_requests" FOR INSERT TO weddingos_app
  WITH CHECK ("requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "dsr_platform_update" ON "data_subject_requests" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.process'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));
CREATE POLICY "deletion_owner" ON "deletion_requests" FOR SELECT TO weddingos_app
  USING ("requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid OR public.weddingos_has_platform_capability('platform.privacy.read'));
CREATE POLICY "deletion_owner_insert" ON "deletion_requests" FOR INSERT TO weddingos_app
  WITH CHECK ("requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "deletion_platform_update" ON "deletion_requests" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.process'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));

CREATE POLICY "retention_platform" ON "data_retention_policies" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));
CREATE POLICY "legal_hold_platform" ON "legal_holds" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));
CREATE POLICY "retention_execution_platform" ON "retention_executions" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));

CREATE POLICY "security_events_platform" ON "security_events" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.security.read'));
CREATE POLICY "security_events_insert" ON "security_events" FOR INSERT TO weddingos_app WITH CHECK (true);
CREATE POLICY "security_alerts_platform" ON "security_alerts" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.security.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.security.respond'));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['backup_runs','backup_artifacts','backup_verifications','restore_runs','restore_validations'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_platform_capability(''platform.release.read'')) WITH CHECK (public.weddingos_has_platform_capability(''platform.release.approve''))',
      table_name || '_platform', table_name
    );
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['release_candidates','release_approvals'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_platform_capability(''platform.release.read'')) WITH CHECK (public.weddingos_has_platform_capability(''platform.release.approve''))',
      table_name || '_platform', table_name
    );
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY[
    'data_subject_requests','deletion_requests','data_retention_policies','legal_holds','retention_executions',
    'security_events','security_alerts','backup_runs','backup_artifacts','backup_verifications',
    'restore_runs','restore_validations','release_candidates','release_approvals'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (true) WITH CHECK (true)', table_name || '_worker', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.weddingos_reject_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;

CREATE TRIGGER "platform_admin_actions_append_only" BEFORE UPDATE OR DELETE ON "platform_admin_actions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_append_only_mutation();
CREATE TRIGGER "user_consent_records_append_only" BEFORE UPDATE OR DELETE ON "user_consent_records"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_append_only_mutation();
CREATE TRIGGER "consent_withdrawals_append_only" BEFORE UPDATE OR DELETE ON "consent_withdrawals"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_append_only_mutation();
CREATE TRIGGER "security_events_append_only" BEFORE UPDATE OR DELETE ON "security_events"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_append_only_mutation();

INSERT INTO "platform_roles" ("id","key","name","description","capabilities","critical","system","version","created_at","updated_at") VALUES
  (gen_random_uuid(),'PLATFORM_SUPER_ADMIN','Super administrator','Toate capabilitățile platformă revizuite explicit.',
   '["platform.dashboard.read","platform.user.read","platform.user.suspend","platform.user.reactivate","platform.user.request_deletion","platform.workspace.read","platform.workspace.suspend","platform.workspace.reactivate","platform.workspace.request_deletion","platform.vendor.read","platform.vendor.suspend","platform.vendor.reactivate","platform.support.read","platform.support.write","platform.support.assign","platform.support.close","platform.trust.read","platform.trust.moderate","platform.finance.read","platform.finance.reconcile","platform.finance.hold","platform.finance.release","platform.provider.read","platform.provider.manage","platform.provider.reconcile","platform.feature_flag.read","platform.feature_flag.write","platform.maintenance.read","platform.maintenance.write","platform.audit.read","platform.audit.export","platform.privacy.read","platform.privacy.process","platform.privacy.override_hold","platform.security.read","platform.security.respond","platform.release.read","platform.release.approve","platform.review_moderate","platform.review_view_private","platform.review_decide","platform.vendor_suspend","platform.subscription.read","platform.subscription.write_plans","platform.subscription.manage","platform.subscription.reconcile","platform.settlement.read","platform.settlement.calculate","platform.settlement.finalize","platform.payout.create","platform.payout.reconcile","platform.payout.view_provider_details"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_OPERATIONS','Operațiuni platformă','Status, suport, mentenanță, furnizori și release read.',
   '["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.vendor.suspend","platform.vendor.reactivate","platform.support.read","platform.support.write","platform.support.assign","platform.support.close","platform.provider.read","platform.feature_flag.read","platform.maintenance.read","platform.maintenance.write","platform.audit.read","platform.release.read"]'::jsonb,false,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_SUPPORT','Suport platformă','Cazuri de suport și metadate redactate.',
   '["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.support.read","platform.support.write","platform.support.assign","platform.support.close"]'::jsonb,false,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_TRUST_SAFETY','Trust & Safety','Moderare, incidente și suspendări controlate.',
   '["platform.dashboard.read","platform.user.read","platform.user.suspend","platform.user.reactivate","platform.vendor.read","platform.vendor.suspend","platform.vendor.reactivate","platform.trust.read","platform.trust.moderate","platform.security.read","platform.review_moderate","platform.review_view_private","platform.review_decide","platform.vendor_suspend"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_FINANCE','Finanțe platformă','Ledger, reconciliere, hold și payout.',
   '["platform.dashboard.read","platform.vendor.read","platform.finance.read","platform.finance.reconcile","platform.finance.hold","platform.finance.release","platform.provider.read","platform.provider.reconcile","platform.subscription.read","platform.subscription.reconcile","platform.settlement.read","platform.settlement.calculate","platform.settlement.finalize","platform.payout.create","platform.payout.reconcile","platform.payout.view_provider_details"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_SECURITY','Securitate platformă','Alerte, incidente, audit și răspuns.',
   '["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.audit.read","platform.security.read","platform.security.respond","platform.provider.read","platform.maintenance.read"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_READ_ONLY','Platformă read-only','Status și metadate operaționale fără mutații.',
   '["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.support.read","platform.trust.read","platform.finance.read","platform.provider.read","platform.feature_flag.read","platform.maintenance.read","platform.audit.read","platform.privacy.read","platform.security.read","platform.release.read"]'::jsonb,false,true,1,now(),now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "legal_documents" ("id","type","key","name","description","created_at","updated_at") VALUES
  (gen_random_uuid(),'TERMS','terms','Termeni de utilizare','Conținut versionat; necesită review juridic înainte de public launch.',now(),now()),
  (gen_random_uuid(),'PRIVACY_POLICY','privacy-policy','Politica de confidențialitate','Descrie fluxurile implementate și drepturile utilizatorului.',now(),now()),
  (gen_random_uuid(),'COOKIE_POLICY','cookie-policy','Politica de cookie-uri','Categorii reale, fără analytics implicit.',now(),now()),
  (gen_random_uuid(),'AI_DATA_POLICY','ai-data-policy','Politica privind datele AI','Explică providerii configurați, minimizarea și retenția.',now(),now()),
  (gen_random_uuid(),'VENDOR_TERMS','vendor-terms','Termeni pentru furnizori','Necesită review juridic.',now(),now()),
  (gen_random_uuid(),'PAYMENT_TERMS','payment-terms','Termeni pentru plăți','Providerul extern procesează plățile; necesită review juridic.',now(),now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "data_retention_policies" ("id","key","environment","entity_type","status_filter","retention_days","archive_days","purge_behavior","legal_basis","active","version","created_at","updated_at")
SELECT gen_random_uuid(), seed.key, environment.name, seed.entity_type, '[]'::jsonb, seed.retention_days, seed.archive_days, seed.behavior, seed.basis, true, 1, now(), now()
FROM (VALUES ('auth-sessions','sessions',30,7,'DELETE','SECURITY'),('one-time-tokens','auth_one_time_tokens',7,NULL,'DELETE','SECURITY'),('generated-artifacts','generated_artifacts',7,NULL,'DELETE_OBJECT_AND_ROW','CONTRACT'),('provider-events','provider_events',365,NULL,'ANONYMIZE_PAYLOAD','LEGAL_OBLIGATION'),('notifications','notifications',180,30,'DELETE','LEGITIMATE_INTEREST'),('activity','activity_items',730,365,'ANONYMIZE','LEGITIMATE_INTEREST'),('copilot','copilot_records',180,30,'ANONYMIZE','CONSENT_OR_CONTRACT'),('support','platform_support_cases',1095,365,'ANONYMIZE','LEGITIMATE_INTEREST'),('audit','audit_events',2555,730,'ARCHIVE','LEGAL_OBLIGATION'),('financial','financial_ledgers',3650,2555,'TOMBSTONE','LEGAL_OBLIGATION')) AS seed(key,entity_type,retention_days,archive_days,behavior,basis)
CROSS JOIN (VALUES ('development'),('test'),('staging'),('production')) AS environment(name)
ON CONFLICT ("key","environment","version") DO NOTHING;

COMMIT;
