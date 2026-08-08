-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('PASSWORD', 'GOOGLE');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'MAGIC_LINK', 'MFA_CHALLENGE');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OverrideEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "accepted_terms_version" VARCHAR(40) NOT NULL,
    "accepted_terms_at" TIMESTAMP(3) NOT NULL,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "avatar_url" VARCHAR(2048),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_subject" VARCHAR(320),
    "password_hash" VARCHAR(512),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "user_agent" VARCHAR(512),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_one_time_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "code_hash" CHAR(64),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "auth_one_time_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'ro-RO',
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Europe/Bucharest',
    "currency" CHAR(3) NOT NULL DEFAULT 'RON',
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "image_url" VARCHAR(2048),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "partner_one_name" VARCHAR(100),
    "partner_two_name" VARCHAR(100),
    "wedding_date" DATE,
    "location" VARCHAR(160),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "wedding_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "capabilities" JSONB NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_template_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_capability_overrides" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "capability" VARCHAR(100) NOT NULL,
    "effect" "OverrideEffect" NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "membership_capability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role_template_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "capability_overrides" JSONB NOT NULL DEFAULT '[]',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "accepted_by" UUID,
    "invited_by" UUID NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'ro-RO',
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Europe/Bucharest',
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "last_active_workspace_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "security_email" BOOLEAN NOT NULL DEFAULT true,
    "planning_email" BOOLEAN NOT NULL DEFAULT true,
    "marketing_email" BOOLEAN NOT NULL DEFAULT false,
    "product_push" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" UUID,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "request_id" VARCHAR(128),
    "correlation_id" VARCHAR(128),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "operation" VARCHAR(120) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "identities_provider_provider_subject_idx" ON "identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "identities_user_id_provider_key" ON "identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "identities_provider_provider_subject_key" ON "identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_expires_at_idx" ON "sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_one_time_tokens_token_hash_key" ON "auth_one_time_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_one_time_tokens_user_id_purpose_consumed_at_revoked_at_idx" ON "auth_one_time_tokens"("user_id", "purpose", "consumed_at", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_one_time_tokens_code_hash_purpose_idx" ON "auth_one_time_tokens"("code_hash", "purpose");

-- CreateIndex
CREATE INDEX "workspaces_created_by_idx" ON "workspaces"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_profiles_workspace_id_key" ON "wedding_profiles"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_templates_key_key" ON "role_templates"("key");

-- CreateIndex
CREATE INDEX "workspace_memberships_user_id_status_idx" ON "workspace_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "workspace_memberships_workspace_id_status_idx" ON "workspace_memberships"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_key" ON "workspace_memberships"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "membership_capability_overrides_workspace_id_idx" ON "membership_capability_overrides"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_capability_overrides_membership_id_capability_key" ON "membership_capability_overrides"("membership_id", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "team_invitations_workspace_id_status_idx" ON "team_invitations"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "team_invitations_email_status_idx" ON "team_invitations"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_created_at_idx" ON "audit_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_user_id_operation_key_key" ON "idempotency_records"("actor_user_id", "operation", "key");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_one_time_tokens" ADD CONSTRAINT "auth_one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_profiles" ADD CONSTRAINT "wedding_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_capability_overrides" ADD CONSTRAINT "membership_capability_overrides_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "workspace_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Slice 0/1 restricted application role. The role is created by the local
-- container init script and by infrastructure in hosted environments.
GRANT USAGE ON SCHEMA public TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO weddingos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO weddingos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO weddingos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO weddingos_app;

-- Tenant context is set with set_config(..., true) inside a transaction. Empty
-- or missing settings resolve to NULL and therefore match no tenant rows.
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
ALTER TABLE "wedding_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wedding_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "membership_capability_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_capability_overrides" FORCE ROW LEVEL SECURITY;
ALTER TABLE "team_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_invitations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select_policy" ON "workspaces"
  FOR SELECT TO weddingos_app
  USING (
    "id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM "workspace_memberships" AS membership
      WHERE membership."workspace_id" = "workspaces"."id"
        AND membership."user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND membership."status" = 'ACTIVE'
    )
  );

CREATE POLICY "workspaces_insert_policy" ON "workspaces"
  FOR INSERT TO weddingos_app
  WITH CHECK (
    "id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY "workspaces_update_policy" ON "workspaces"
  FOR UPDATE TO weddingos_app
  USING ("id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "workspaces_delete_policy" ON "workspaces"
  FOR DELETE TO weddingos_app
  USING ("id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "wedding_profiles_tenant_policy" ON "wedding_profiles"
  FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "memberships_select_policy" ON "workspace_memberships"
  FOR SELECT TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY "memberships_insert_policy" ON "workspace_memberships"
  FOR INSERT TO weddingos_app
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "memberships_update_policy" ON "workspace_memberships"
  FOR UPDATE TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "memberships_delete_policy" ON "workspace_memberships"
  FOR DELETE TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "capability_overrides_tenant_policy" ON "membership_capability_overrides"
  FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "team_invitations_select_policy" ON "team_invitations"
  FOR SELECT TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR "token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
  );

CREATE POLICY "team_invitations_insert_policy" ON "team_invitations"
  FOR INSERT TO weddingos_app
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "team_invitations_update_policy" ON "team_invitations"
  FOR UPDATE TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR "token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR "token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
  );

CREATE POLICY "team_invitations_delete_policy" ON "team_invitations"
  FOR DELETE TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY "audit_events_tenant_policy" ON "audit_events"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR ("workspace_id" IS NULL AND "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR ("workspace_id" IS NULL AND "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  );

CREATE POLICY "idempotency_records_tenant_policy" ON "idempotency_records"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    OR "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
