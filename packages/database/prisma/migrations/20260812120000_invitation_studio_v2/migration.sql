-- Sarbato Invitation Studio V2: stable recipient identity, isolated access
-- channels, versioned invitation variants, and explicit guest interactions.

BEGIN;

ALTER TABLE "guest_allergies"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "guest_allergies_workspace_id_guest_id_active_idx"
  ON "guest_allergies"("workspace_id", "guest_id", "active");

DROP POLICY IF EXISTS "stored_objects_guest_invitation_media_read" ON "stored_objects";
CREATE POLICY "stored_objects_guest_invitation_media_read"
ON "stored_objects" FOR SELECT TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "id" = NULLIF(current_setting('app.current_invitation_media_object_id', true), '')::uuid
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
);

CREATE TYPE "InvitationVariantStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "GuestAccessChannel" AS ENUM ('LEGACY', 'EMAIL', 'QR', 'MANUAL', 'WHATSAPP');
CREATE TYPE "InvitationInteractionType" AS ENUM ('LINK_ACCESSED', 'INVITATION_OPENED', 'RSVP_COMPLETED');

CREATE TABLE "invitation_variants" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "invitation_site_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "status" "InvitationVariantStatus" NOT NULL DEFAULT 'ACTIVE',
  "current_draft_version_id" UUID,
  "published_version_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "invitation_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitation_variant_versions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "invitation_variant_id" UUID NOT NULL,
  "base_invitation_version_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "overrides" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3),
  "content_hash" CHAR(64) NOT NULL,
  CONSTRAINT "invitation_variant_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invitation_recipients"
  ADD COLUMN "invitation_site_id" UUID,
  ADD COLUMN "invitation_variant_id" UUID;

-- Keep inserts from the previous API release schema-compatible while the
-- maintenance cutover is in progress. This is not an application-only rollback
-- guarantee: the media policy below requires the V2 API transaction context.
-- The legacy Prisma client does not know the new site column, so derive it from
-- the invitation version before NOT NULL is checked.
-- Install the trigger before the backfill so even a concurrent legacy write is
-- validated if a deploy ever reaches this migration without maintenance mode.
CREATE OR REPLACE FUNCTION public.weddingos_invitation_recipient_site_from_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  resolved_site_id uuid;
  resolved_workspace_id uuid;
BEGIN
  SELECT version."invitation_site_id", version."workspace_id"
  INTO resolved_site_id, resolved_workspace_id
  FROM public."invitation_versions" version
  WHERE version."id" = NEW."invitation_version_id";

  IF resolved_site_id IS NULL THEN
    RAISE EXCEPTION 'Invitation version % does not exist', NEW."invitation_version_id"
      USING ERRCODE = '23503';
  END IF;

  IF NEW."workspace_id" IS DISTINCT FROM resolved_workspace_id THEN
    RAISE EXCEPTION 'Invitation recipient workspace does not match invitation version workspace'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."invitation_site_id" IS NOT NULL
     AND NEW."invitation_site_id" IS DISTINCT FROM resolved_site_id THEN
    RAISE EXCEPTION 'Invitation recipient site does not match invitation version site'
      USING ERRCODE = '23514';
  END IF;

  NEW."invitation_site_id" := resolved_site_id;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_invitation_recipient_site_from_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_invitation_recipient_site_from_version()
  TO weddingos_app, weddingos_worker;

DROP TRIGGER IF EXISTS "invitation_recipients_site_from_version" ON "invitation_recipients";
CREATE TRIGGER "invitation_recipients_site_from_version"
BEFORE INSERT OR UPDATE OF "invitation_version_id", "invitation_site_id", "workspace_id"
ON "invitation_recipients"
FOR EACH ROW
EXECUTE FUNCTION public.weddingos_invitation_recipient_site_from_version();

UPDATE "invitation_recipients" recipient
SET "invitation_site_id" = version."invitation_site_id"
FROM "invitation_versions" version
WHERE version."id" = recipient."invitation_version_id";

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM "invitation_recipients" WHERE "invitation_site_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill invitation recipient site identity';
  END IF;
END
$block$;

ALTER TABLE "invitation_recipients"
  ALTER COLUMN "invitation_site_id" SET NOT NULL;

-- Revoking an invitation recipient is a terminal security boundary for every
-- guest surface that authenticates through one of its access grants. Cascade
-- the revocation to every already-issued channel, and make it impossible to
-- create or reactivate a grant while its recipient remains revoked.
CREATE OR REPLACE FUNCTION public.weddingos_revoke_recipient_guest_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW."revoked_at" IS NOT NULL THEN
    UPDATE public."guest_access_grants" grant_row
    SET "revoked_at" = NEW."revoked_at"
    WHERE grant_row."invitation_recipient_id" = NEW."id"
      AND grant_row."revoked_at" IS NULL;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_revoke_recipient_guest_grants() FROM PUBLIC;

DROP TRIGGER IF EXISTS "invitation_recipients_revoke_guest_grants" ON "invitation_recipients";
CREATE TRIGGER "invitation_recipients_revoke_guest_grants"
AFTER INSERT OR UPDATE OF "revoked_at" ON "invitation_recipients"
FOR EACH ROW
WHEN (NEW."revoked_at" IS NOT NULL)
EXECUTE FUNCTION public.weddingos_revoke_recipient_guest_grants();

CREATE OR REPLACE FUNCTION public.weddingos_guest_grant_inherits_recipient_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  recipient_revoked_at timestamp(3);
BEGIN
  SELECT recipient."revoked_at"
  INTO recipient_revoked_at
  FROM public."invitation_recipients" recipient
  WHERE recipient."id" = NEW."invitation_recipient_id"
  FOR SHARE;

  IF recipient_revoked_at IS NOT NULL THEN
    NEW."revoked_at" := COALESCE(NEW."revoked_at", recipient_revoked_at);
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_guest_grant_inherits_recipient_revocation() FROM PUBLIC;

DROP TRIGGER IF EXISTS "guest_access_grants_inherit_recipient_revocation" ON "guest_access_grants";
CREATE TRIGGER "guest_access_grants_inherit_recipient_revocation"
BEFORE INSERT OR UPDATE OF "invitation_recipient_id", "revoked_at" ON "guest_access_grants"
FOR EACH ROW
EXECUTE FUNCTION public.weddingos_guest_grant_inherits_recipient_revocation();

-- Close historical access identities that were archived before recipient-level
-- revocation existed. Household recipients follow household archival; direct
-- recipients follow either their guest or that guest's household archival.
UPDATE "invitation_recipients" recipient
SET "revoked_at" = CURRENT_TIMESTAMP,
    "version" = recipient."version" + 1
WHERE recipient."revoked_at" IS NULL
  AND (
    (
      recipient."household_id" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "households" household
        WHERE household."id" = recipient."household_id"
          AND household."workspace_id" = recipient."workspace_id"
          AND household."deleted_at" IS NOT NULL
      )
    )
    OR (
      recipient."guest_id" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "guests" guest_row
        LEFT JOIN "households" household
          ON household."id" = guest_row."household_id"
         AND household."workspace_id" = guest_row."workspace_id"
        WHERE guest_row."id" = recipient."guest_id"
          AND guest_row."workspace_id" = recipient."workspace_id"
          AND (
            guest_row."status" <> 'ACTIVE'
            OR guest_row."deleted_at" IS NOT NULL
            OR household."deleted_at" IS NOT NULL
          )
      )
    )
  );

-- Close grants issued before this migration for recipients that were already
-- revoked. The surrounding transaction makes this backfill atomic with both
-- triggers, so no active-token window is exposed.
UPDATE "guest_access_grants" grant_row
SET "revoked_at" = recipient."revoked_at"
FROM "invitation_recipients" recipient
WHERE recipient."id" = grant_row."invitation_recipient_id"
  AND recipient."revoked_at" IS NOT NULL
  AND grant_row."revoked_at" IS NULL;

ALTER TABLE "guest_access_grants"
  ADD COLUMN "channel" "GuestAccessChannel" NOT NULL DEFAULT 'LEGACY';

ALTER TABLE "campaign_recipients"
  ADD COLUMN "invitation_variant_version_id" UUID;

CREATE TABLE "invitation_recipient_interactions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "invitation_recipient_id" UUID NOT NULL,
  "guest_access_grant_id" UUID NOT NULL,
  "type" "InvitationInteractionType" NOT NULL,
  "source" VARCHAR(40) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitation_recipient_interactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitation_variants_invitation_site_id_code_key"
  ON "invitation_variants"("invitation_site_id", "code");
CREATE INDEX "invitation_variants_workspace_id_site_id_status_idx"
  ON "invitation_variants"("workspace_id", "invitation_site_id", "status");
CREATE UNIQUE INDEX "invitation_variant_versions_variant_id_number_key"
  ON "invitation_variant_versions"("invitation_variant_id", "version_number");
CREATE INDEX "invitation_variant_versions_workspace_id_variant_created_idx"
  ON "invitation_variant_versions"("workspace_id", "invitation_variant_id", "created_at");
CREATE INDEX "invitation_variant_versions_base_version_id_idx"
  ON "invitation_variant_versions"("base_invitation_version_id");
CREATE INDEX "invitation_recipients_site_id_variant_id_idx"
  ON "invitation_recipients"("invitation_site_id", "invitation_variant_id");
CREATE INDEX "guest_access_grants_recipient_channel_revoked_idx"
  ON "guest_access_grants"("invitation_recipient_id", "channel", "revoked_at");
CREATE UNIQUE INDEX "guest_access_grants_active_recipient_channel_key"
  ON "guest_access_grants"("invitation_recipient_id", "channel")
  WHERE "revoked_at" IS NULL AND "channel" <> 'LEGACY';
CREATE UNIQUE INDEX "invitation_recipient_interactions_recipient_type_key_key"
  ON "invitation_recipient_interactions"("invitation_recipient_id", "type", "idempotency_key");
CREATE INDEX "invitation_recipient_interactions_workspace_type_occurred_idx"
  ON "invitation_recipient_interactions"("workspace_id", "type", "occurred_at");
CREATE INDEX "invitation_recipient_interactions_grant_occurred_idx"
  ON "invitation_recipient_interactions"("guest_access_grant_id", "occurred_at");

ALTER TABLE "invitation_variants" ADD CONSTRAINT "invitation_variants_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_variants" ADD CONSTRAINT "invitation_variants_site_id_fkey"
  FOREIGN KEY ("invitation_site_id") REFERENCES "invitation_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_variants" ADD CONSTRAINT "invitation_variants_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_variant_versions" ADD CONSTRAINT "invitation_variant_versions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_variant_versions" ADD CONSTRAINT "invitation_variant_versions_variant_id_fkey"
  FOREIGN KEY ("invitation_variant_id") REFERENCES "invitation_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_variant_versions" ADD CONSTRAINT "invitation_variant_versions_base_version_id_fkey"
  FOREIGN KEY ("base_invitation_version_id") REFERENCES "invitation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_variant_versions" ADD CONSTRAINT "invitation_variant_versions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_variants" ADD CONSTRAINT "invitation_variants_draft_version_id_fkey"
  FOREIGN KEY ("current_draft_version_id") REFERENCES "invitation_variant_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation_variants" ADD CONSTRAINT "invitation_variants_published_version_id_fkey"
  FOREIGN KEY ("published_version_id") REFERENCES "invitation_variant_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_site_id_fkey"
  FOREIGN KEY ("invitation_site_id") REFERENCES "invitation_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_variant_id_fkey"
  FOREIGN KEY ("invitation_variant_id") REFERENCES "invitation_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_variant_version_id_fkey"
  FOREIGN KEY ("invitation_variant_version_id") REFERENCES "invitation_variant_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation_recipient_interactions" ADD CONSTRAINT "invitation_recipient_interactions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_recipient_interactions" ADD CONSTRAINT "invitation_recipient_interactions_recipient_id_fkey"
  FOREIGN KEY ("invitation_recipient_id") REFERENCES "invitation_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_recipient_interactions" ADD CONSTRAINT "invitation_recipient_interactions_grant_id_fkey"
  FOREIGN KEY ("guest_access_grant_id") REFERENCES "guest_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "invitation_variants", "invitation_variant_versions", "invitation_recipient_interactions"
TO weddingos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE
  "invitation_variants", "invitation_variant_versions", "invitation_recipient_interactions"
TO weddingos_worker;

ALTER TABLE "invitation_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_variants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invitation_variant_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_variant_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invitation_recipient_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_recipient_interactions" FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.weddingos_guest_recipient_identity_matches(
  target_workspace_id uuid,
  target_invitation_site_id uuid,
  target_household_id uuid,
  target_guest_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.guest_access_grants grant_row
    JOIN public.invitation_recipients granted_recipient
      ON granted_recipient.id = grant_row.invitation_recipient_id
    LEFT JOIN public.guests granted_guest
      ON granted_guest.id = granted_recipient.guest_id
      AND granted_guest.workspace_id = granted_recipient.workspace_id
    LEFT JOIN public.guests target_guest
      ON target_guest.id = target_guest_id
      AND target_guest.workspace_id = target_workspace_id
    WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
      AND grant_row.token_hash = NULLIF(current_setting('app.current_guest_token_hash', true), '')
      AND grant_row.workspace_id = target_workspace_id
      AND grant_row.revoked_at IS NULL
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
      AND granted_recipient.workspace_id = target_workspace_id
      AND granted_recipient.invitation_site_id = target_invitation_site_id
      AND granted_recipient.revoked_at IS NULL
      AND (
        (
          COALESCE(granted_recipient.household_id, granted_guest.household_id) IS NOT NULL
          AND grant_row.household_id = COALESCE(granted_recipient.household_id, granted_guest.household_id)
          AND COALESCE(granted_recipient.household_id, granted_guest.household_id)
            = COALESCE(target_household_id, target_guest.household_id)
        )
        OR (
          COALESCE(granted_recipient.household_id, granted_guest.household_id) IS NULL
          AND COALESCE(target_household_id, target_guest.household_id) IS NULL
          AND granted_recipient.guest_id IS NOT NULL
          AND granted_recipient.guest_id = target_guest_id
        )
      )
  );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_guest_recipient_identity_matches(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_recipient_identity_matches(uuid, uuid, uuid, uuid) TO weddingos_app;

-- A legacy recipient row may still own an RSVP submission after the same
-- household was represented by a newer recipient row. Resolve authorization
-- through the site-scoped recipient identity instead of the exact row id so
-- every still-valid channel sees and updates one coherent RSVP state.
CREATE OR REPLACE FUNCTION public.weddingos_guest_recipient_reference_matches(
  target_workspace_id uuid,
  target_household_id uuid,
  target_recipient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    public.weddingos_guest_grant_matches(target_workspace_id, target_household_id, NULL)
    AND EXISTS (
      SELECT 1
      FROM public.invitation_recipients recipient
      WHERE recipient.id = target_recipient_id
        AND recipient.workspace_id = target_workspace_id
        AND public.weddingos_guest_recipient_identity_matches(
          recipient.workspace_id,
          recipient.invitation_site_id,
          recipient.household_id,
          recipient.guest_id
        )
    );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_guest_recipient_reference_matches(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_recipient_reference_matches(uuid, uuid, uuid) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_guest_submission_identity_matches(
  target_workspace_id uuid,
  target_submission_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.rsvp_submissions submission
    WHERE submission.id = target_submission_id
      AND submission.workspace_id = target_workspace_id
      AND public.weddingos_guest_recipient_reference_matches(
        submission.workspace_id,
        submission.household_id,
        submission.invitation_recipient_id
      )
  );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_guest_submission_identity_matches(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_submission_identity_matches(uuid, uuid) TO weddingos_app;

DROP POLICY "invitation_recipients_guest_policy" ON "invitation_recipients";
CREATE POLICY "invitation_recipients_guest_policy" ON "invitation_recipients"
FOR SELECT TO weddingos_app
USING (public.weddingos_guest_recipient_identity_matches("workspace_id", "invitation_site_id", "household_id", "guest_id"));
DROP POLICY "invitation_recipients_guest_update_policy" ON "invitation_recipients";
CREATE POLICY "invitation_recipients_guest_update_policy" ON "invitation_recipients"
FOR UPDATE TO weddingos_app
USING (public.weddingos_guest_recipient_identity_matches("workspace_id", "invitation_site_id", "household_id", "guest_id"))
WITH CHECK (public.weddingos_guest_recipient_identity_matches("workspace_id", "invitation_site_id", "household_id", "guest_id"));

DROP POLICY "rsvp_submissions_guest_policy" ON "rsvp_submissions";
CREATE POLICY "rsvp_submissions_guest_policy" ON "rsvp_submissions"
FOR ALL TO weddingos_app
USING (public.weddingos_guest_recipient_reference_matches("workspace_id", "household_id", "invitation_recipient_id"))
WITH CHECK (public.weddingos_guest_recipient_reference_matches("workspace_id", "household_id", "invitation_recipient_id"));

DROP POLICY "guest_event_responses_guest_policy" ON "guest_event_responses";
CREATE POLICY "guest_event_responses_guest_policy" ON "guest_event_responses"
FOR ALL TO weddingos_app
USING (public.weddingos_guest_submission_identity_matches("workspace_id", "submission_id"))
WITH CHECK (public.weddingos_guest_submission_identity_matches("workspace_id", "submission_id"));

CREATE POLICY "invitation_variants_organizer_policy" ON "invitation_variants"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "invitation_variant_versions_organizer_policy" ON "invitation_variant_versions"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "invitation_recipient_interactions_organizer_policy" ON "invitation_recipient_interactions"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "invitation_variants_worker_policy" ON "invitation_variants"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));
CREATE POLICY "invitation_variant_versions_worker_policy" ON "invitation_variant_versions"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));
CREATE POLICY "invitation_recipient_interactions_worker_policy" ON "invitation_recipient_interactions"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "invitation_variants_guest_policy" ON "invitation_variants"
FOR SELECT TO weddingos_app
USING (
  "status" = 'ACTIVE'
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1 FROM "invitation_recipients" recipient
    WHERE recipient."invitation_variant_id" = invitation_variants."id"
      AND public.weddingos_guest_grant_matches(recipient."workspace_id", recipient."household_id", recipient."id")
  )
);

CREATE POLICY "invitation_variant_versions_guest_policy" ON "invitation_variant_versions"
FOR SELECT TO weddingos_app
USING (
  "published_at" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1
    FROM "invitation_variants" variant
    JOIN "invitation_recipients" recipient ON recipient."invitation_variant_id" = variant."id"
    WHERE variant."published_version_id" = invitation_variant_versions."id"
      AND public.weddingos_guest_grant_matches(recipient."workspace_id", recipient."household_id", recipient."id")
  )
);

CREATE POLICY "invitation_recipient_interactions_guest_select_policy" ON "invitation_recipient_interactions"
FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", NULL, "invitation_recipient_id"));
CREATE POLICY "invitation_recipient_interactions_guest_insert_policy" ON "invitation_recipient_interactions"
FOR INSERT TO weddingos_app
WITH CHECK (
  "guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, "invitation_recipient_id")
);

DROP POLICY "invitation_versions_guest_policy" ON "invitation_versions";
CREATE POLICY "invitation_versions_guest_policy" ON "invitation_versions"
FOR SELECT TO weddingos_app
USING (
  "published_at" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1
    FROM "invitation_sites" site
    JOIN "invitation_recipients" recipient ON recipient."invitation_site_id" = site."id"
    WHERE site."published_version_id" = invitation_versions."id"
      AND site."status" = 'PUBLISHED'
      AND public.weddingos_guest_grant_matches(recipient."workspace_id", recipient."household_id", recipient."id")
  )
);

COMMIT;
