BEGIN;

CREATE TABLE "beta_programs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" VARCHAR(24) NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  "release_version" VARCHAR(80) NOT NULL,
  "terms_document_version_id" UUID,
  "privacy_document_version_id" UUID,
  "limits_document_version_id" UUID,
  "created_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_programs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "beta_programs_environment_key_key" ON "beta_programs"("environment", "key");
CREATE INDEX "beta_programs_environment_status_created_idx" ON "beta_programs"("environment", "status", "created_at");

CREATE TABLE "beta_organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "program_id" UUID NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "owner_user_id" UUID,
  "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_organizations_program_fk" FOREIGN KEY ("program_id") REFERENCES "beta_programs"("id") ON DELETE CASCADE
);
CREATE INDEX "beta_organizations_program_type_status_idx" ON "beta_organizations"("program_id", "type", "status");

CREATE TABLE "beta_cohorts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "program_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  "target_counts" JSONB NOT NULL DEFAULT '{}',
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_cohorts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_cohorts_program_fk" FOREIGN KEY ("program_id") REFERENCES "beta_programs"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "beta_cohorts_program_key_key" ON "beta_cohorts"("program_id", "key");
CREATE INDEX "beta_cohorts_program_status_starts_idx" ON "beta_cohorts"("program_id", "status", "starts_at");

CREATE TABLE "beta_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "program_id" UUID NOT NULL,
  "cohort_id" UUID NOT NULL,
  "organization_id" UUID,
  "user_id" UUID,
  "email_hash" CHAR(64) NOT NULL,
  "participant_type" VARCHAR(40) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'INVITED',
  "consented_at" TIMESTAMP(3),
  "privacy_acknowledged_at" TIMESTAMP(3),
  "limitations_acknowledged_at" TIMESTAMP(3),
  "onboarding_checklist" JSONB NOT NULL DEFAULT '{}',
  "activated_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "removed_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_participants_program_fk" FOREIGN KEY ("program_id") REFERENCES "beta_programs"("id") ON DELETE CASCADE,
  CONSTRAINT "beta_participants_cohort_fk" FOREIGN KEY ("cohort_id") REFERENCES "beta_cohorts"("id") ON DELETE RESTRICT,
  CONSTRAINT "beta_participants_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "beta_organizations"("id") ON DELETE SET NULL,
  CONSTRAINT "beta_participants_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "beta_participants_program_user_key" ON "beta_participants"("program_id", "user_id");
CREATE INDEX "beta_participants_program_cohort_type_status_idx" ON "beta_participants"("program_id", "cohort_id", "participant_type", "status");
CREATE INDEX "beta_participants_email_hash_status_idx" ON "beta_participants"("email_hash", "status");

CREATE TABLE "beta_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "program_id" UUID NOT NULL,
  "cohort_id" UUID NOT NULL,
  "organization_id" UUID,
  "participant_type" VARCHAR(40) NOT NULL,
  "target_email_hash" CHAR(64) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'INVITED',
  "resend_generation" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "sent_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_invitations_program_fk" FOREIGN KEY ("program_id") REFERENCES "beta_programs"("id") ON DELETE CASCADE,
  CONSTRAINT "beta_invitations_cohort_fk" FOREIGN KEY ("cohort_id") REFERENCES "beta_cohorts"("id") ON DELETE RESTRICT,
  CONSTRAINT "beta_invitations_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "beta_organizations"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "beta_invitations_token_hash_key" ON "beta_invitations"("token_hash");
CREATE INDEX "beta_invitations_program_cohort_status_expires_idx" ON "beta_invitations"("program_id", "cohort_id", "status", "expires_at");
CREATE INDEX "beta_invitations_target_email_hash_status_idx" ON "beta_invitations"("target_email_hash", "status");

CREATE TABLE "beta_access_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "participant_id" UUID NOT NULL,
  "scope_type" VARCHAR(30) NOT NULL DEFAULT 'PROGRAM',
  "scope_id" UUID,
  "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_access_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_access_grants_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "beta_participants"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "beta_access_grants_participant_key" ON "beta_access_grants"("participant_id");
CREATE INDEX "beta_access_grants_status_valid_until_idx" ON "beta_access_grants"("status", "valid_until");

CREATE TABLE "beta_feedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "participant_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'NEW',
  "current_route" VARCHAR(500) NOT NULL,
  "browser_metadata" JSONB NOT NULL DEFAULT '{}',
  "description" VARCHAR(4000) NOT NULL,
  "expected_behavior" VARCHAR(4000) NOT NULL,
  "actual_behavior" VARCHAR(4000) NOT NULL,
  "screenshot_object_id" UUID,
  "correlation_id" VARCHAR(120),
  "release_version" VARCHAR(80) NOT NULL,
  "duplicate_of_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_feedback_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "beta_participants"("id") ON DELETE CASCADE,
  CONSTRAINT "beta_feedback_duplicate_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "beta_feedback"("id") ON DELETE SET NULL
);
CREATE INDEX "beta_feedback_participant_status_created_idx" ON "beta_feedback"("participant_id", "status", "created_at");
CREATE INDEX "beta_feedback_status_severity_created_idx" ON "beta_feedback"("status", "severity", "created_at");

CREATE TABLE "beta_feedback_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "feedback_id" UUID NOT NULL,
  "stored_object_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_feedback_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_feedback_attachments_feedback_fk" FOREIGN KEY ("feedback_id") REFERENCES "beta_feedback"("id") ON DELETE CASCADE,
  CONSTRAINT "beta_feedback_attachments_object_fk" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "beta_feedback_attachments_feedback_object_key" ON "beta_feedback_attachments"("feedback_id", "stored_object_id");
CREATE INDEX "beta_feedback_attachments_feedback_created_idx" ON "beta_feedback_attachments"("feedback_id", "created_at");

CREATE TABLE "beta_feedback_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "feedback_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_feedback_votes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_feedback_votes_feedback_fk" FOREIGN KEY ("feedback_id") REFERENCES "beta_feedback"("id") ON DELETE CASCADE,
  CONSTRAINT "beta_feedback_votes_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "beta_participants"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "beta_feedback_votes_feedback_participant_key" ON "beta_feedback_votes"("feedback_id", "participant_id");
CREATE INDEX "beta_feedback_votes_feedback_created_idx" ON "beta_feedback_votes"("feedback_id", "created_at");

CREATE TABLE "beta_feedback_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "feedback_id" UUID NOT NULL,
  "from_status" VARCHAR(30),
  "to_status" VARCHAR(30) NOT NULL,
  "changed_by" UUID NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_feedback_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_feedback_status_history_feedback_fk" FOREIGN KEY ("feedback_id") REFERENCES "beta_feedback"("id") ON DELETE CASCADE
);
CREATE INDEX "beta_feedback_status_history_feedback_created_idx" ON "beta_feedback_status_history"("feedback_id", "created_at");

CREATE TABLE "beta_feedback_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "feedback_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "internal" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_feedback_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_feedback_messages_feedback_fk" FOREIGN KEY ("feedback_id") REFERENCES "beta_feedback"("id") ON DELETE CASCADE
);
CREATE INDEX "beta_feedback_messages_feedback_created_idx" ON "beta_feedback_messages"("feedback_id", "created_at");

CREATE TABLE "beta_product_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "participant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_name" VARCHAR(100) NOT NULL,
  "route" VARCHAR(500),
  "session_id_hash" CHAR(64),
  "properties" JSONB NOT NULL DEFAULT '{}',
  "correlation_id" VARCHAR(120),
  "release_version" VARCHAR(80) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_product_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_product_events_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "beta_participants"("id") ON DELETE CASCADE,
  CONSTRAINT "beta_product_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "beta_product_events_participant_name_occurred_idx" ON "beta_product_events"("participant_id", "event_name", "occurred_at");
CREATE INDEX "beta_product_events_name_occurred_idx" ON "beta_product_events"("event_name", "occurred_at");

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'beta_programs','beta_organizations','beta_cohorts','beta_participants','beta_invitations',
    'beta_access_grants','beta_feedback','beta_feedback_attachments','beta_feedback_votes',
    'beta_feedback_status_history','beta_feedback_messages','beta_product_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY "beta_programs_read" ON "beta_programs" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read'));
CREATE POLICY "beta_programs_manage" ON "beta_programs" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.manage'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.manage'));
CREATE POLICY "beta_organizations_read" ON "beta_organizations" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read') OR owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "beta_organizations_manage" ON "beta_organizations" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.manage'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.manage'));
CREATE POLICY "beta_cohorts_read" ON "beta_cohorts" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read'));
CREATE POLICY "beta_cohorts_manage" ON "beta_cohorts" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.manage'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.manage'));

CREATE POLICY "beta_participants_platform" ON "beta_participants" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.manage') OR public.weddingos_has_platform_capability('platform.beta.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.manage'));
CREATE POLICY "beta_participants_self" ON "beta_participants" FOR ALL TO weddingos_app
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY "beta_invitations_platform_read" ON "beta_invitations" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read') OR public.weddingos_has_platform_capability('platform.beta.invite'));
CREATE POLICY "beta_invitations_platform_write" ON "beta_invitations" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.invite'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.invite'));
CREATE POLICY "beta_invitations_token" ON "beta_invitations" FOR SELECT TO weddingos_app
  USING (token_hash = nullif(current_setting('app.current_invitation_token_hash', true), ''));
CREATE POLICY "beta_invitations_accept" ON "beta_invitations" FOR UPDATE TO weddingos_app
  USING (token_hash = nullif(current_setting('app.current_invitation_token_hash', true), ''))
  WITH CHECK (token_hash = nullif(current_setting('app.current_invitation_token_hash', true), ''));

CREATE POLICY "beta_access_grants_platform" ON "beta_access_grants" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.manage') OR public.weddingos_has_platform_capability('platform.beta.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.manage'));
CREATE POLICY "beta_access_grants_self" ON "beta_access_grants" FOR ALL TO weddingos_app
  USING (EXISTS (SELECT 1 FROM beta_participants p WHERE p.id = participant_id AND p.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM beta_participants p WHERE p.id = participant_id AND p.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid));

CREATE POLICY "beta_feedback_platform" ON "beta_feedback" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read') OR public.weddingos_has_platform_capability('platform.beta.triage'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.triage'));
CREATE POLICY "beta_feedback_self" ON "beta_feedback" FOR ALL TO weddingos_app
  USING (created_by = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY "beta_feedback_attachments_access" ON "beta_feedback_attachments" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.triage') OR EXISTS (SELECT 1 FROM beta_feedback f WHERE f.id = feedback_id AND f.created_by = nullif(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (created_by = nullif(current_setting('app.current_user_id', true), '')::uuid OR public.weddingos_has_platform_capability('platform.beta.triage'));
CREATE POLICY "beta_feedback_votes_access" ON "beta_feedback_votes" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read') OR EXISTS (SELECT 1 FROM beta_participants p WHERE p.id = participant_id AND p.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM beta_participants p WHERE p.id = participant_id AND p.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid));
CREATE POLICY "beta_feedback_history_platform" ON "beta_feedback_status_history" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read') OR public.weddingos_has_platform_capability('platform.beta.triage'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.beta.triage'));
CREATE POLICY "beta_feedback_history_self" ON "beta_feedback_status_history" FOR SELECT TO weddingos_app
  USING (EXISTS (SELECT 1 FROM beta_feedback f WHERE f.id = feedback_id AND f.created_by = nullif(current_setting('app.current_user_id', true), '')::uuid));
CREATE POLICY "beta_feedback_messages_access" ON "beta_feedback_messages" FOR SELECT TO weddingos_app
  USING ((NOT internal AND EXISTS (SELECT 1 FROM beta_feedback f WHERE f.id = feedback_id AND f.created_by = nullif(current_setting('app.current_user_id', true), '')::uuid)) OR public.weddingos_has_platform_capability('platform.beta.triage'));
CREATE POLICY "beta_feedback_messages_insert" ON "beta_feedback_messages" FOR INSERT TO weddingos_app
  WITH CHECK ((author_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid AND NOT internal) OR public.weddingos_has_platform_capability('platform.beta.triage'));

CREATE POLICY "beta_product_events_platform" ON "beta_product_events" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.beta.read'));
CREATE POLICY "beta_product_events_self_insert" ON "beta_product_events" FOR INSERT TO weddingos_app
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid AND EXISTS (SELECT 1 FROM beta_participants p WHERE p.id = participant_id AND p.user_id = user_id AND p.status IN ('ONBOARDING','ACTIVE','COMPLETED')));

GRANT SELECT, INSERT, UPDATE ON "beta_programs", "beta_organizations", "beta_cohorts", "beta_participants", "beta_invitations", "beta_access_grants", "beta_feedback", "beta_feedback_attachments", "beta_feedback_votes", "beta_feedback_status_history", "beta_feedback_messages", "beta_product_events" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "beta_programs", "beta_organizations", "beta_cohorts", "beta_participants", "beta_invitations", "beta_access_grants", "beta_feedback", "beta_feedback_attachments", "beta_feedback_votes", "beta_feedback_status_history", "beta_feedback_messages", "beta_product_events" TO weddingos_worker;

UPDATE "platform_roles"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '["platform.beta.read","platform.beta.manage","platform.beta.invite","platform.beta.triage"]'::jsonb) capability
), "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('PLATFORM_SUPER_ADMIN', 'PLATFORM_OPERATIONS');

UPDATE "platform_roles"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '["platform.beta.read","platform.beta.triage"]'::jsonb) capability
), "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'PLATFORM_SUPPORT';

INSERT INTO "legal_documents" ("id", "type", "key", "name", "description", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'BETA_TERMS', 'beta-terms', 'Controlled Beta Terms', 'DRAFT — requires professional legal review before external use.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BETA_PRIVACY_NOTICE', 'beta-privacy-notice', 'Controlled Beta Privacy Notice', 'DRAFT — requires professional privacy and legal review before external use.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BETA_KNOWN_LIMITATIONS', 'beta-known-limitations', 'Controlled Beta Known Limitations', 'Operational disclosure; provider and infrastructure facts must be updated before invitations are sent.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "consent_purposes" ("id", "key", "name", "description", "required", "active", "version", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'beta_participation', 'Participare în beta controlată', 'Acord explicit pentru condițiile, privacy notice și limitările programului beta.', true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'beta_product_analytics', 'Analiză de produs beta', 'Evenimente de utilizare fără conținut sensibil; respectă preferința analytics.', false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "data_retention_rules" ("id", "key", "environment", "entity_type", "action", "retention_days", "batch_limit", "legal_hold_aware", "active", "version", "created_at", "updated_at")
SELECT gen_random_uuid(), seed.key, environment.name, seed.entity_type, seed.action, seed.days, 500, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('beta-feedback-retention','beta_feedback','ANONYMIZE',1095),('beta-event-retention','beta_product_events','DELETE',180),('beta-invitation-retention','beta_invitations','ANONYMIZE',365)) AS seed(key,entity_type,action,days)
CROSS JOIN (VALUES ('development'),('test'),('staging'),('beta'),('production')) AS environment(name)
ON CONFLICT ("key","environment","version") DO NOTHING;

COMMIT;
