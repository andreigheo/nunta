BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "database_identities" (
  "id" varchar(32) PRIMARY KEY DEFAULT 'singleton',
  "environment" varchar(24) NOT NULL,
  "database_purpose" varchar(40) NOT NULL,
  "database_instance_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "database_identities_singleton" CHECK ("id" = 'singleton')
);

INSERT INTO "database_identities" ("id", "environment", "database_purpose")
VALUES (
  'singleton',
  CASE
    WHEN current_database() LIKE '%staging%' THEN 'staging'
    WHEN current_database() LIKE '%production%' THEN 'production'
    WHEN current_database() LIKE '%e2e%' OR current_database() LIKE '%integration%' OR current_database() LIKE '%restore%' THEN 'test'
    ELSE 'development'
  END,
  CASE
    WHEN current_database() LIKE '%e2e%' THEN 'e2e'
    WHEN current_database() LIKE '%integration%' THEN 'integration'
    WHEN current_database() LIKE '%restore%' THEN 'restore-target'
    WHEN current_database() LIKE '%staging%' THEN 'staging'
    WHEN current_database() LIKE '%production%' THEN 'production'
    ELSE 'persistent-runtime'
  END
);

CREATE TABLE "mfa_authenticators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL DEFAULT 'TOTP',
  "label" varchar(120) NOT NULL,
  "secret_ciphertext" text NOT NULL,
  "encryption_key_id" varchar(120) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'PENDING',
  "last_accepted_counter" bigint,
  "confirmed_at" timestamptz,
  "disabled_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "mfa_authenticator_status" CHECK ("status" IN ('PENDING','ACTIVE','DISABLED'))
);
CREATE INDEX "mfa_authenticators_user_status_idx" ON "mfa_authenticators"("user_id", "status");
CREATE UNIQUE INDEX "mfa_authenticators_one_active" ON "mfa_authenticators"("user_id") WHERE "status" = 'ACTIVE';

CREATE TABLE "mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "authenticator_id" uuid NOT NULL REFERENCES "mfa_authenticators"("id") ON DELETE CASCADE,
  "batch_id" uuid NOT NULL,
  "code_hash" char(64) NOT NULL UNIQUE,
  "used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mfa_recovery_codes_user_batch_idx" ON "mfa_recovery_codes"("user_id", "batch_id", "used_at");

CREATE TABLE "mfa_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "purpose" varchar(80) NOT NULL,
  "nonce_hash" char(64) NOT NULL UNIQUE,
  "status" varchar(24) NOT NULL DEFAULT 'PENDING',
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "mfa_challenge_status" CHECK ("status" IN ('PENDING','VERIFIED','FAILED','EXPIRED'))
);
CREATE INDEX "mfa_challenges_session_idx" ON "mfa_challenges"("user_id", "session_id", "status", "expires_at");

CREATE TABLE "admin_step_up_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "authenticator_id" uuid NOT NULL REFERENCES "mfa_authenticators"("id") ON DELETE CASCADE,
  "purpose" varchar(80) NOT NULL,
  "nonce_hash" char(64) NOT NULL UNIQUE,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "admin_step_up_sessions_lookup_idx" ON "admin_step_up_sessions"("user_id", "session_id", "purpose", "expires_at");

CREATE TABLE "consent_purposes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(80) NOT NULL UNIQUE,
  "name" varchar(160) NOT NULL,
  "description" varchar(1000) NOT NULL,
  "required" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "data_retention_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(120) NOT NULL,
  "environment" varchar(24) NOT NULL,
  "entity_type" varchar(100) NOT NULL,
  "action" varchar(40) NOT NULL,
  "retention_days" integer NOT NULL,
  "batch_limit" integer NOT NULL DEFAULT 500,
  "legal_hold_aware" boolean NOT NULL DEFAULT true,
  "active" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("key", "environment", "version"),
  CONSTRAINT "retention_rule_batch" CHECK ("batch_limit" BETWEEN 1 AND 5000)
);
CREATE INDEX "data_retention_rules_lookup_idx" ON "data_retention_rules"("environment", "active", "entity_type");

CREATE TABLE "release_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "release_candidate_id" uuid NOT NULL REFERENCES "release_candidates"("id") ON DELETE CASCADE,
  "kind" varchar(60) NOT NULL,
  "path" varchar(1000) NOT NULL,
  "checksum_sha256" char(64) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("release_candidate_id", "kind")
);
CREATE INDEX "release_artifacts_candidate_idx" ON "release_artifacts"("release_candidate_id", "created_at");

CREATE TABLE "release_deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "release_candidate_id" uuid NOT NULL REFERENCES "release_candidates"("id") ON DELETE RESTRICT,
  "environment" varchar(24) NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'PENDING',
  "target_identity" jsonb NOT NULL,
  "deployed_by" uuid NOT NULL,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "rolled_back_at" timestamptz,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "release_deployments_lookup_idx" ON "release_deployments"("release_candidate_id", "environment", "status");

INSERT INTO "platform_roles" ("id","key","name","description","capabilities","critical","system","version","created_at","updated_at") VALUES
  (gen_random_uuid(),'PLATFORM_SUPER_ADMIN','Super administrator','Toate capabilitățile platformă revizuite explicit.',
   '["platform.dashboard.read","platform.user.read","platform.user.suspend","platform.user.reactivate","platform.user.request_deletion","platform.workspace.read","platform.workspace.suspend","platform.workspace.reactivate","platform.workspace.request_deletion","platform.vendor.read","platform.vendor.suspend","platform.vendor.reactivate","platform.support.read","platform.support.write","platform.support.assign","platform.support.close","platform.trust.read","platform.trust.moderate","platform.finance.read","platform.finance.reconcile","platform.finance.hold","platform.finance.release","platform.provider.read","platform.provider.manage","platform.provider.reconcile","platform.feature_flag.read","platform.feature_flag.write","platform.maintenance.read","platform.maintenance.write","platform.audit.read","platform.audit.export","platform.privacy.read","platform.privacy.process","platform.privacy.override_hold","platform.security.read","platform.security.respond","platform.release.read","platform.release.approve","platform.review_moderate","platform.review_view_private","platform.review_decide","platform.vendor_suspend","platform.subscription.read","platform.subscription.write_plans","platform.subscription.manage","platform.subscription.reconcile","platform.settlement.read","platform.settlement.calculate","platform.settlement.finalize","platform.payout.create","platform.payout.reconcile","platform.payout.view_provider_details"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_OPERATIONS','Operațiuni platformă','Status, suport, mentenanță, furnizori și release read.','["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.vendor.suspend","platform.vendor.reactivate","platform.support.read","platform.support.write","platform.support.assign","platform.support.close","platform.provider.read","platform.feature_flag.read","platform.maintenance.read","platform.maintenance.write","platform.audit.read","platform.release.read"]'::jsonb,false,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_SUPPORT','Suport platformă','Cazuri de suport și metadate redactate.','["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.support.read","platform.support.write","platform.support.assign","platform.support.close"]'::jsonb,false,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_TRUST_SAFETY','Trust & Safety','Moderare, incidente și suspendări controlate.','["platform.dashboard.read","platform.user.read","platform.user.suspend","platform.user.reactivate","platform.vendor.read","platform.vendor.suspend","platform.vendor.reactivate","platform.trust.read","platform.trust.moderate","platform.security.read","platform.review_moderate","platform.review_view_private","platform.review_decide","platform.vendor_suspend"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_FINANCE','Finanțe platformă','Ledger, reconciliere, hold și payout.','["platform.dashboard.read","platform.vendor.read","platform.finance.read","platform.finance.reconcile","platform.finance.hold","platform.finance.release","platform.provider.read","platform.provider.reconcile","platform.subscription.read","platform.subscription.reconcile","platform.settlement.read","platform.settlement.calculate","platform.settlement.finalize","platform.payout.create","platform.payout.reconcile","platform.payout.view_provider_details"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_SECURITY','Securitate platformă','Alerte, incidente, audit și răspuns.','["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.audit.read","platform.security.read","platform.security.respond","platform.provider.read","platform.maintenance.read"]'::jsonb,true,true,1,now(),now()),
  (gen_random_uuid(),'PLATFORM_READ_ONLY','Platformă read-only','Status și metadate operaționale fără mutații.','["platform.dashboard.read","platform.user.read","platform.workspace.read","platform.vendor.read","platform.support.read","platform.trust.read","platform.finance.read","platform.provider.read","platform.feature_flag.read","platform.maintenance.read","platform.audit.read","platform.privacy.read","platform.security.read","platform.release.read"]'::jsonb,false,true,1,now(),now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "legal_documents" ("id","type","key","name","description","created_at","updated_at") VALUES
  (gen_random_uuid(),'TERMS','terms','Termeni de utilizare','Conținut versionat; necesită review juridic înainte de public launch.',now(),now()),
  (gen_random_uuid(),'PRIVACY_POLICY','privacy-policy','Politica de confidențialitate','Descrie fluxurile implementate și drepturile utilizatorului.',now(),now()),
  (gen_random_uuid(),'COOKIE_POLICY','cookie-policy','Politica de cookie-uri','Categorii reale, fără analytics implicit.',now(),now()),
  (gen_random_uuid(),'AI_DATA_POLICY','ai-data-policy','Politica privind datele AI','Explică providerii configurați, minimizarea și retenția.',now(),now()),
  (gen_random_uuid(),'VENDOR_TERMS','vendor-terms','Termeni pentru furnizori','Necesită review juridic.',now(),now()),
  (gen_random_uuid(),'PAYMENT_TERMS','payment-terms','Termeni pentru plăți','Providerul extern procesează plățile; necesită review juridic.',now(),now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "legal_document_versions" ("id","document_id","version","language","status","content","content_hash","effective_at","published_at","created_by","created_at")
SELECT gen_random_uuid(), d.id, '2026-07-21-beta', 'ro-RO', 'PUBLISHED',
       'Versiune controlată pentru beta. Necesită revizuire juridică înainte de lansarea publică.',
       encode(digest(d.key || ':2026-07-21-beta:ro-RO', 'sha256'), 'hex'), now(), now(),
       '00000000-0000-4000-8000-000000000010'::uuid, now()
FROM "legal_documents" d
ON CONFLICT ("document_id","version","language") DO NOTHING;

INSERT INTO "consent_purposes" ("key","name","description","required") VALUES
  ('essential-service','Serviciu esențial','Procesare necesară furnizării și securizării WeddingOS.',true),
  ('product-analytics','Analytics produs','Măsurare opțională, dezactivată implicit.',false),
  ('marketing','Comunicări marketing','Comunicări opționale retragibile.',false),
  ('ai-assistance','Asistență AI','Procesare controlată pentru funcțiile AI activate explicit.',false)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "data_retention_policies" ("id","key","environment","entity_type","status_filter","retention_days","archive_days","purge_behavior","legal_basis","active","version","created_at","updated_at")
SELECT gen_random_uuid(), seed.key, environment.name, seed.entity_type, '[]'::jsonb, seed.retention_days, seed.archive_days, seed.behavior, seed.basis, true, 1, now(), now()
FROM (VALUES ('auth-sessions','sessions',30,7,'DELETE','SECURITY'),('one-time-tokens','auth_one_time_tokens',7,NULL,'DELETE','SECURITY'),('generated-artifacts','generated_artifacts',7,NULL,'DELETE_OBJECT_AND_ROW','CONTRACT'),('provider-events','provider_events',365,NULL,'ANONYMIZE_PAYLOAD','LEGAL_OBLIGATION'),('notifications','notifications',180,30,'DELETE','LEGITIMATE_INTEREST'),('activity','activity_items',730,365,'ANONYMIZE','LEGITIMATE_INTEREST'),('copilot','copilot_records',180,30,'ANONYMIZE','CONSENT_OR_CONTRACT'),('support','platform_support_cases',1095,365,'ANONYMIZE','LEGITIMATE_INTEREST'),('audit','audit_events',2555,730,'ARCHIVE','LEGAL_OBLIGATION'),('financial','financial_ledgers',3650,2555,'TOMBSTONE','LEGAL_OBLIGATION')) AS seed(key,entity_type,retention_days,archive_days,behavior,basis)
CROSS JOIN (VALUES ('development'),('test'),('staging'),('production')) AS environment(name)
ON CONFLICT ("key","environment","version") DO NOTHING;

INSERT INTO "data_retention_rules" ("key","environment","entity_type","action","retention_days","batch_limit")
SELECT policy.key, policy.environment, policy.entity_type, policy.purge_behavior, policy.retention_days, 500
FROM "data_retention_policies" policy
ON CONFLICT ("key","environment","version") DO NOTHING;

INSERT INTO "platform_feature_flags" ("id","key","environment","description","value_type","default_value","rules","kill_switch","reason","created_by","updated_by","version","created_at","updated_at")
SELECT gen_random_uuid(), 'system.maintenance_mode', env.name, 'System reference flag; active maintenance is stored in maintenance windows.', 'BOOLEAN', 'false'::jsonb, '[]'::jsonb, true, 'Slice 10B required system reference.', '00000000-0000-4000-8000-000000000010'::uuid, '00000000-0000-4000-8000-000000000010'::uuid, 1, now(), now()
FROM (VALUES ('development'),('test'),('staging'),('production')) AS env(name)
ON CONFLICT ("key","environment") DO NOTHING;

REVOKE DELETE, TRUNCATE ON "platform_roles", "legal_documents", "legal_document_versions", "consent_purposes", "data_retention_policies", "data_retention_rules", "database_identities" FROM weddingos_app, weddingos_worker;
GRANT SELECT ON "database_identities", "consent_purposes", "data_retention_rules" TO weddingos_app, weddingos_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "mfa_authenticators", "mfa_recovery_codes", "mfa_challenges", "admin_step_up_sessions" TO weddingos_app;
GRANT SELECT ON "mfa_authenticators", "mfa_recovery_codes", "mfa_challenges", "admin_step_up_sessions" TO weddingos_worker;
GRANT SELECT, INSERT, UPDATE ON "release_artifacts", "release_deployments" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE ON "release_artifacts", "release_deployments" TO weddingos_worker;

COMMIT;
