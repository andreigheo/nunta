CREATE TYPE "VendorInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');
CREATE TYPE "RfqAwardPolicy" AS ENUM ('SINGLE_AWARD', 'MULTIPLE_AWARD');
CREATE TYPE "ContractVersionKind" AS ENUM ('INITIAL', 'AMENDMENT');
CREATE TYPE "PaymentLedgerEntryType" AS ENUM ('PAYMENT', 'REVERSAL', 'REFUND');

ALTER TYPE "RfqRecipientStatus" ADD VALUE IF NOT EXISTS 'FAILED' AFTER 'DECLINED';

ALTER TABLE "vendor_organization_invitations"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "VendorInvitationStatus"
    USING CASE "status"::text
      WHEN 'ACTIVE' THEN 'ACCEPTED'::"VendorInvitationStatus"
      WHEN 'REMOVED' THEN 'REVOKED'::"VendorInvitationStatus"
      ELSE 'PENDING'::"VendorInvitationStatus"
    END,
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "token_generation" integer NOT NULL DEFAULT 1,
  ADD COLUMN "sent_at" timestamptz,
  ADD COLUMN "declined_at" timestamptz,
  ADD COLUMN "revoked_by" uuid;

ALTER TABLE "requests_for_quote"
  ADD COLUMN "award_policy" "RfqAwardPolicy" NOT NULL DEFAULT 'SINGLE_AWARD',
  ADD COLUMN "awarded_offer_id" uuid;

ALTER TABLE "rfq_recipients"
  ADD COLUMN "failed_at" timestamptz,
  ADD COLUMN "failure_code" varchar(100);

ALTER TABLE "vendor_bookings"
  ADD COLUMN "accepted_offer_version_id" uuid,
  ADD COLUMN "vendor_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "commercial_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "rfq_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "vendor_bookings" booking
SET "accepted_offer_version_id" = version."id"
FROM "vendor_offer_versions" version
WHERE version."offer_id" = booking."offer_id"
  AND version."version_number" = booking."accepted_offer_version";

UPDATE "vendor_bookings" booking
SET "vendor_snapshot" = jsonb_build_object(
      'vendorOrganizationId', booking."vendor_organization_id",
      'displayName', organization."display_name"
    ),
    "commercial_snapshot" = jsonb_build_object(
      'offerId', booking."offer_id",
      'offerVersionId', booking."accepted_offer_version_id",
      'currency', booking."currency",
      'totalMinor', booking."total_minor",
      'depositMinor', booking."deposit_minor"
    ),
    "rfq_snapshot" = jsonb_build_object('rfqId', booking."rfq_id", 'title', booking."title")
FROM "vendor_organizations" organization
WHERE organization."id" = booking."vendor_organization_id";

ALTER TABLE "vendor_bookings"
  ALTER COLUMN "accepted_offer_version_id" SET NOT NULL,
  ADD CONSTRAINT "vendor_bookings_accepted_offer_version_fk"
    FOREIGN KEY ("accepted_offer_version_id") REFERENCES "vendor_offer_versions"("id") ON DELETE RESTRICT;

ALTER TABLE "vendor_contract_versions"
  ADD COLUMN "kind" "ContractVersionKind" NOT NULL DEFAULT 'INITIAL',
  ADD COLUMN "base_version_id" uuid,
  ADD COLUMN "party_snapshots" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "effective_at" timestamptz,
  ADD COLUMN "superseded_at" timestamptz,
  ADD CONSTRAINT "vendor_contract_versions_base_version_fk"
    FOREIGN KEY ("base_version_id") REFERENCES "vendor_contract_versions"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.weddingos_reject_immutable_commercial_version_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial versions are immutable' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['effective_at', 'superseded_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['effective_at', 'superseded_at']) THEN
    RAISE EXCEPTION 'commercial version content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE "vendor_contract_versions" DISABLE TRIGGER "contract_versions_immutable";

UPDATE "vendor_contract_versions" version
SET "party_snapshots" = jsonb_build_object(
  'workspaceId', version."workspace_id",
  'vendorOrganizationId', version."vendor_organization_id"
);

UPDATE "vendor_contract_versions" version
SET "effective_at" = contract."acknowledged_at"
FROM "vendor_contracts" contract
WHERE contract."agreed_version_id" = version."id";

ALTER TABLE "vendor_contract_versions" ENABLE TRIGGER "contract_versions_immutable";

ALTER TABLE "budget_items"
  ADD COLUMN "source_chain_key" varchar(180),
  ADD COLUMN "manual_override_minor" bigint,
  ADD COLUMN "manual_override_reason" varchar(1000),
  ADD COLUMN "manual_override_by" uuid,
  ADD COLUMN "manual_override_at" timestamptz;

UPDATE "budget_items"
SET "source_chain_key" = 'offer:' || "source_id"::text
WHERE "source_type" = 'ACCEPTED_OFFER' AND "source_id" IS NOT NULL;

ALTER TABLE "payment_schedule_entries"
  ADD COLUMN "source_contract_version_id" uuid,
  ADD COLUMN "currency" char(3);

UPDATE "payment_schedule_entries" schedule
SET "currency" = plan."currency"
FROM "budget_items" item
JOIN "budget_plans" plan ON plan."id" = item."budget_plan_id"
WHERE item."id" = schedule."budget_item_id";

UPDATE "payment_schedule_entries" schedule
SET "source_contract_version_id" = version."id"
FROM "vendor_contracts" contract
JOIN "vendor_contract_versions" version
  ON version."contract_id" = contract."id"
 AND version."version_number" = contract."current_version_number"
WHERE contract."id" = schedule."contract_id";

ALTER TABLE "payment_schedule_entries"
  ALTER COLUMN "currency" SET NOT NULL,
  ADD CONSTRAINT "payment_schedule_source_contract_version_fk"
    FOREIGN KEY ("source_contract_version_id") REFERENCES "vendor_contract_versions"("id") ON DELETE RESTRICT;

ALTER TABLE "payment_records"
  ADD COLUMN "currency" char(3),
  ADD COLUMN "entry_type" "PaymentLedgerEntryType" NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN "original_payment_id" uuid;

UPDATE "payment_records" payment
SET "currency" = plan."currency"
FROM "budget_items" item
JOIN "budget_plans" plan ON plan."id" = item."budget_plan_id"
WHERE item."id" = payment."budget_item_id";

UPDATE "payment_records"
SET "original_payment_id" = "reversal_of_id",
    "entry_type" = CASE
      WHEN "reversal_of_id" IS NOT NULL AND "status" = 'REFUNDED' THEN 'REFUND'::"PaymentLedgerEntryType"
      WHEN "reversal_of_id" IS NOT NULL THEN 'REVERSAL'::"PaymentLedgerEntryType"
      ELSE 'PAYMENT'::"PaymentLedgerEntryType"
    END;

ALTER TABLE "payment_records"
  ALTER COLUMN "currency" SET NOT NULL,
  ADD CONSTRAINT "payment_records_original_payment_fk"
    FOREIGN KEY ("original_payment_id") REFERENCES "payment_records"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "payment_records_positive_amount" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "payment_records_adjustment_source" CHECK (
    ("entry_type" = 'PAYMENT' AND "original_payment_id" IS NULL)
    OR ("entry_type" IN ('REVERSAL', 'REFUND') AND "original_payment_id" IS NOT NULL)
  );

ALTER TABLE "requests_for_quote"
  ADD CONSTRAINT "requests_for_quote_awarded_offer_fk"
    FOREIGN KEY ("awarded_offer_id") REFERENCES "vendor_offers"("id") ON DELETE RESTRICT;

UPDATE "requests_for_quote" rfq
SET "awarded_offer_id" = (
  SELECT offer."id"
  FROM "vendor_offers" offer
  WHERE offer."rfq_id" = rfq."id" AND offer."status" = 'ACCEPTED'
  ORDER BY offer."accepted_at" NULLS LAST, offer."id"
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM "vendor_offers" offer
  WHERE offer."rfq_id" = rfq."id" AND offer."status" = 'ACCEPTED'
);

CREATE UNIQUE INDEX "requests_for_quote_awarded_offer_key"
  ON "requests_for_quote" ("awarded_offer_id") WHERE "awarded_offer_id" IS NOT NULL;
CREATE UNIQUE INDEX "vendor_offers_single_award_key"
  ON "vendor_offers" ("rfq_id") WHERE "status" = 'ACCEPTED';
CREATE UNIQUE INDEX "booking_service_items_source_key"
  ON "booking_service_items" ("booking_id", "source_offer_line_item_id");
CREATE UNIQUE INDEX "vendor_availability_booking_key"
  ON "vendor_availability_blocks" ("booking_id") WHERE "booking_id" IS NOT NULL;
CREATE UNIQUE INDEX "budget_items_source_key"
  ON "budget_items" ("workspace_id", "source_type", "source_id") WHERE "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "budget_items_chain_key"
  ON "budget_items" ("workspace_id", "source_chain_key") WHERE "source_chain_key" IS NOT NULL;
CREATE UNIQUE INDEX "payment_schedule_contract_version_sequence_key"
  ON "payment_schedule_entries" ("source_contract_version_id", "sequence")
  WHERE "source_contract_version_id" IS NOT NULL;
CREATE UNIQUE INDEX "payment_records_one_reversal_key"
  ON "payment_records" ("original_payment_id")
  WHERE "entry_type" = 'REVERSAL';

CREATE OR REPLACE FUNCTION public.weddingos_protect_confirmed_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'CONFIRMED' AND (
    NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
    OR NEW.original_payment_id IS DISTINCT FROM OLD.original_payment_id
    OR NEW.payment_schedule_entry_id IS DISTINCT FROM OLD.payment_schedule_entry_id
    OR NEW.budget_item_id IS DISTINCT FROM OLD.budget_item_id
    OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
    OR NEW.vendor_organization_id IS DISTINCT FROM OLD.vendor_organization_id
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
    OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
  ) THEN
    RAISE EXCEPTION 'confirmed payment fields are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_confirmed_fields_immutable"
  BEFORE UPDATE ON "payment_records"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_protect_confirmed_payment();

CREATE OR REPLACE FUNCTION public.weddingos_vendor_invitation_preview(
  target_token_hash char(64), target_user_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  vendor_organization_id uuid,
  vendor_display_name text,
  role_name text,
  expires_at timestamptz,
  invitation_version integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT invitation.id, invitation.vendor_organization_id,
         organization.display_name::text, role.name::text,
         invitation.expires_at, invitation.version
  FROM public.vendor_organization_invitations invitation
  JOIN public.users actor ON actor.id = target_user_id
  JOIN public.vendor_organizations organization ON organization.id = invitation.vendor_organization_id
  JOIN public.vendor_role_templates role ON role.id = invitation.role_template_id
  WHERE invitation.token_hash = target_token_hash
    AND lower(invitation.email) = lower(actor.email)
    AND invitation.status = 'PENDING'
    AND invitation.expires_at > now()
    AND organization.status IN ('DRAFT', 'ACTIVE')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.weddingos_accept_vendor_invitation(
  target_token_hash char(64), target_user_id uuid
)
RETURNS TABLE (invitation_id uuid, vendor_organization_id uuid, membership_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE invitation_record public.vendor_organization_invitations%ROWTYPE;
DECLARE membership_record public.vendor_organization_memberships%ROWTYPE;
BEGIN
  SELECT invitation.* INTO invitation_record
  FROM public.vendor_organization_invitations invitation
  JOIN public.users actor ON actor.id = target_user_id
  JOIN public.vendor_organizations organization ON organization.id = invitation.vendor_organization_id
  WHERE invitation.token_hash = target_token_hash
    AND lower(invitation.email) = lower(actor.email)
    AND invitation.status = 'PENDING'
    AND invitation.expires_at > now()
    AND organization.status IN ('DRAFT', 'ACTIVE')
  FOR UPDATE OF invitation;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.vendor_organization_memberships (
    id, vendor_organization_id, user_id, role_template_id, status, joined_at,
    created_by, updated_by, created_at, updated_at, version
  ) VALUES (
    gen_random_uuid(), invitation_record.vendor_organization_id, target_user_id,
    invitation_record.role_template_id, 'ACTIVE', now(), invitation_record.created_by,
    target_user_id, now(), now(), 1
  )
  ON CONFLICT (vendor_organization_id, user_id) DO UPDATE SET
    role_template_id = EXCLUDED.role_template_id,
    status = 'ACTIVE', joined_at = COALESCE(vendor_organization_memberships.joined_at, now()),
    removed_at = NULL, updated_by = target_user_id, updated_at = now(),
    version = vendor_organization_memberships.version + 1
  RETURNING * INTO membership_record;

  UPDATE public.vendor_organization_invitations
  SET status = 'ACCEPTED', accepted_by = target_user_id, accepted_at = now(),
      token_hash = encode(digest(token_hash || ':used:' || gen_random_uuid()::text, 'sha256'), 'hex'),
      updated_at = now(), version = version + 1
  WHERE id = invitation_record.id;

  RETURN QUERY SELECT invitation_record.id, invitation_record.vendor_organization_id, membership_record.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.weddingos_decline_vendor_invitation(
  target_token_hash char(64), target_user_id uuid
)
RETURNS TABLE (invitation_id uuid, vendor_organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
BEGIN
  RETURN QUERY
  UPDATE public.vendor_organization_invitations invitation
  SET status = 'DECLINED', declined_at = now(),
      token_hash = encode(digest(token_hash || ':declined:' || gen_random_uuid()::text, 'sha256'), 'hex'),
      updated_at = now(), version = version + 1
  FROM public.users actor
  WHERE actor.id = target_user_id
    AND invitation.token_hash = target_token_hash
    AND lower(invitation.email) = lower(actor.email)
    AND invitation.status = 'PENDING'
    AND invitation.expires_at > now()
  RETURNING invitation.id, invitation.vendor_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_vendor_invitation_preview(char(64), uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weddingos_accept_vendor_invitation(char(64), uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weddingos_decline_vendor_invitation(char(64), uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_vendor_invitation_preview(char(64), uuid) TO weddingos_app;
GRANT EXECUTE ON FUNCTION public.weddingos_accept_vendor_invitation(char(64), uuid) TO weddingos_app;
GRANT EXECUTE ON FUNCTION public.weddingos_decline_vendor_invitation(char(64), uuid) TO weddingos_app;

ALTER TABLE "vendor_organization_invitations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "requests_for_quote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rfq_recipients" FORCE ROW LEVEL SECURITY;
ALTER TABLE "vendor_bookings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "booking_service_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "vendor_contract_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "budget_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_schedule_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_records" FORCE ROW LEVEL SECURITY;
