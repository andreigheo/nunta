BEGIN;

CREATE POLICY "workspaces_platform_subscription_touch"
ON "workspaces" FOR UPDATE TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.subscription.manage'))
WITH CHECK (public.weddingos_has_platform_capability('platform.subscription.manage'));

-- Cross-tenant administrative reads are capability-scoped. These policies are
-- intentionally read-only except for the explicit subscription management path.
CREATE POLICY "workspace_subscriptions_platform_read"
ON "workspace_subscriptions" FOR SELECT TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.workspace.read')
  OR public.weddingos_has_platform_capability('platform.finance.read')
  OR public.weddingos_has_platform_capability('platform.subscription.manage')
);

CREATE POLICY "workspace_subscriptions_platform_manage"
ON "workspace_subscriptions" FOR INSERT TO weddingos_app
WITH CHECK (public.weddingos_has_platform_capability('platform.subscription.manage'));

CREATE POLICY "workspace_subscriptions_platform_update"
ON "workspace_subscriptions" FOR UPDATE TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.subscription.manage'))
WITH CHECK (public.weddingos_has_platform_capability('platform.subscription.manage'));

CREATE POLICY "workspace_billing_checkouts_platform_read"
ON "workspace_billing_checkouts" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.finance.read'));

CREATE POLICY "workspace_billing_provider_events_platform_read"
ON "workspace_billing_provider_events" FOR SELECT TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.finance.read')
  OR public.weddingos_has_platform_capability('platform.subscription.reconcile')
);

CREATE POLICY "workspace_billing_transactions_platform_read"
ON "workspace_billing_transactions" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.finance.read'));

-- Aggregate funnel access. The API exposes only counts, while RLS still denies
-- ordinary accounts and administrators without dashboard capability.
CREATE POLICY "invitation_sites_platform_aggregate"
ON "invitation_sites" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.dashboard.read'));

CREATE POLICY "rsvp_submissions_platform_aggregate"
ON "rsvp_submissions" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.dashboard.read'));

CREATE TABLE "platform_labels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(500),
  "color" VARCHAR(24) NOT NULL DEFAULT 'plum',
  "environment" VARCHAR(24) NOT NULL,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_label_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label_id" UUID NOT NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" VARCHAR(160) NOT NULL,
  "assigned_by" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_label_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_label_assignments_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "platform_labels"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "platform_labels_environment_name_key" ON "platform_labels"("environment", "name");
CREATE INDEX "platform_labels_environment_created_at_idx" ON "platform_labels"("environment", "created_at");
CREATE UNIQUE INDEX "platform_label_assignments_label_id_target_type_target_id_key" ON "platform_label_assignments"("label_id", "target_type", "target_id");
CREATE INDEX "platform_label_assignments_target_type_target_id_created_at_idx" ON "platform_label_assignments"("target_type", "target_id", "created_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_labels", "platform_label_assignments" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_labels", "platform_label_assignments" TO weddingos_worker;
ALTER TABLE "platform_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_labels" FORCE ROW LEVEL SECURITY;
ALTER TABLE "platform_label_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_label_assignments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "platform_labels_read" ON "platform_labels" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.feature_flag.read'));
CREATE POLICY "platform_labels_write" ON "platform_labels" FOR ALL TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.feature_flag.write'))
WITH CHECK (public.weddingos_has_platform_capability('platform.feature_flag.write'));
CREATE POLICY "platform_label_assignments_read" ON "platform_label_assignments" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.feature_flag.read'));
CREATE POLICY "platform_label_assignments_write" ON "platform_label_assignments" FOR ALL TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.feature_flag.write'))
WITH CHECK (public.weddingos_has_platform_capability('platform.feature_flag.write'));

COMMIT;
