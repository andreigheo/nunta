-- Pre-marketplace accommodation sourcing. Public discovery remains informational;
-- availability and pricing in this workflow are explicit provider declarations.
CREATE TYPE "AccommodationProviderLeadStatus" AS ENUM (
  'NEEDS_VERIFICATION',
  'READY_TO_CONTACT',
  'CONTACTED',
  'RESPONDED',
  'QUALIFIED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TYPE "AccommodationInquiryStatus" AS ENUM (
  'DRAFT',
  'READY',
  'CONTACTED',
  'RESPONDED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'ARCHIVED'
);

CREATE TYPE "AccommodationInquiryChannel" AS ENUM (
  'EMAIL',
  'PHONE',
  'CONTACT_FORM',
  'WHATSAPP',
  'OTHER'
);

CREATE TYPE "AccommodationAvailabilityDeclaration" AS ENUM (
  'UNKNOWN',
  'AVAILABLE',
  'PARTIALLY_AVAILABLE',
  'UNAVAILABLE'
);

CREATE TYPE "AccommodationContactDirection" AS ENUM (
  'OUTBOUND',
  'INBOUND',
  'INTERNAL_NOTE'
);

CREATE TABLE "accommodation_provider_leads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "wedding_event_id" UUID NOT NULL,
  "recommendation_id" UUID NOT NULL,
  "status" "AccommodationProviderLeadStatus" NOT NULL DEFAULT 'NEEDS_VERIFICATION',
  "contact_name" VARCHAR(180),
  "contact_email" VARCHAR(320),
  "contact_phone" VARCHAR(80),
  "contact_url" VARCHAR(2048),
  "verification_note" VARCHAR(2000),
  "verified_at" TIMESTAMPTZ,
  "verified_by" UUID,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accommodation_provider_leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accommodation_provider_leads_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_provider_leads_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_provider_leads_recommendation_fk" FOREIGN KEY ("recommendation_id") REFERENCES "accommodation_recommendations"("id") ON DELETE RESTRICT,
  CONSTRAINT "accommodation_provider_leads_verified_by_fk" FOREIGN KEY ("verified_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_provider_leads_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_provider_leads_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_provider_leads_version_ck" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "accommodation_provider_leads_workspace_recommendation_key"
  ON "accommodation_provider_leads"("workspace_id", "recommendation_id");
CREATE INDEX "accommodation_provider_leads_workspace_event_status_updated_idx"
  ON "accommodation_provider_leads"("workspace_id", "wedding_event_id", "status", "updated_at");

CREATE TABLE "accommodation_provider_inquiries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "wedding_event_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "status" "AccommodationInquiryStatus" NOT NULL DEFAULT 'DRAFT',
  "channel" "AccommodationInquiryChannel" NOT NULL,
  "check_in_date" DATE NOT NULL,
  "check_out_date" DATE NOT NULL,
  "rooms" INTEGER NOT NULL,
  "adults" INTEGER NOT NULL,
  "children" INTEGER NOT NULL,
  "budget_max_minor" INTEGER,
  "currency" CHAR(3) NOT NULL,
  "subject" VARCHAR(240) NOT NULL,
  "message" TEXT NOT NULL,
  "response_deadline" TIMESTAMPTZ,
  "contacted_at" TIMESTAMPTZ,
  "responded_at" TIMESTAMPTZ,
  "availability" "AccommodationAvailabilityDeclaration" NOT NULL DEFAULT 'UNKNOWN',
  "quoted_total_minor" INTEGER,
  "quote_currency" CHAR(3),
  "response_note" VARCHAR(4000),
  "declared_by_contact" VARCHAR(180),
  "declaration_recorded_at" TIMESTAMPTZ,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accommodation_provider_inquiries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accommodation_provider_inquiries_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_provider_inquiries_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_provider_inquiries_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "accommodation_provider_leads"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_provider_inquiries_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_provider_inquiries_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_provider_inquiries_dates_ck" CHECK ("check_out_date" > "check_in_date"),
  CONSTRAINT "accommodation_provider_inquiries_occupancy_ck" CHECK ("rooms" > 0 AND "adults" >= 0 AND "children" >= 0 AND ("adults" + "children") > 0),
  CONSTRAINT "accommodation_provider_inquiries_budget_ck" CHECK ("budget_max_minor" IS NULL OR "budget_max_minor" >= 0),
  CONSTRAINT "accommodation_provider_inquiries_quote_ck" CHECK (
    ("quoted_total_minor" IS NULL AND "quote_currency" IS NULL)
    OR ("quoted_total_minor" >= 0 AND "quote_currency" IS NOT NULL)
  ),
  CONSTRAINT "accommodation_provider_inquiries_version_ck" CHECK ("version" > 0)
);

CREATE INDEX "accommodation_provider_inquiries_workspace_event_status_deadline_idx"
  ON "accommodation_provider_inquiries"("workspace_id", "wedding_event_id", "status", "response_deadline");
CREATE INDEX "accommodation_provider_inquiries_workspace_lead_created_idx"
  ON "accommodation_provider_inquiries"("workspace_id", "lead_id", "created_at");

CREATE TABLE "accommodation_contact_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "inquiry_id" UUID,
  "direction" "AccommodationContactDirection" NOT NULL,
  "channel" "AccommodationInquiryChannel" NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "summary" VARCHAR(2000) NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accommodation_contact_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accommodation_contact_entries_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_contact_entries_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "accommodation_provider_leads"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_contact_entries_inquiry_fk" FOREIGN KEY ("inquiry_id") REFERENCES "accommodation_provider_inquiries"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_contact_entries_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);

CREATE INDEX "accommodation_contact_entries_workspace_lead_occurred_idx"
  ON "accommodation_contact_entries"("workspace_id", "lead_id", "occurred_at");
CREATE INDEX "accommodation_contact_entries_workspace_inquiry_occurred_idx"
  ON "accommodation_contact_entries"("workspace_id", "inquiry_id", "occurred_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "accommodation_provider_leads",
  "accommodation_provider_inquiries",
  "accommodation_contact_entries"
TO weddingos_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "accommodation_provider_leads",
  "accommodation_provider_inquiries",
  "accommodation_contact_entries"
TO weddingos_worker;

ALTER TABLE "accommodation_provider_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_provider_leads" FORCE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_provider_inquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_provider_inquiries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_contact_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_contact_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "accommodation_provider_leads_organizer_policy"
ON "accommodation_provider_leads" FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "accommodation_provider_inquiries_organizer_policy"
ON "accommodation_provider_inquiries" FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "accommodation_contact_entries_organizer_policy"
ON "accommodation_contact_entries" FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "accommodation_provider_leads_worker_policy"
ON "accommodation_provider_leads" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "accommodation_provider_inquiries_worker_policy"
ON "accommodation_provider_inquiries" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "accommodation_contact_entries_worker_policy"
ON "accommodation_contact_entries" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));
