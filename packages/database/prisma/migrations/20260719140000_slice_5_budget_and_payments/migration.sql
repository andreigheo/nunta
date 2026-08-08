-- Canonical financial records. Money is stored as non-negative minor units;
-- payment reversals/refunds are separate records or explicit lifecycle changes.
ALTER TABLE "budget_plans"
  ADD CONSTRAINT "budget_plan_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "budget_plan_target_nonnegative" CHECK ("target_total_minor" >= 0),
  ADD CONSTRAINT "budget_plan_contingency_range" CHECK ("contingency_percent" BETWEEN 0 AND 100);

ALTER TABLE "budget_categories"
  ADD CONSTRAINT "budget_category_plan_fk" FOREIGN KEY ("budget_plan_id") REFERENCES "budget_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "budget_category_parent_fk" FOREIGN KEY ("parent_category_id") REFERENCES "budget_categories"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "budget_category_allocated_nonnegative" CHECK ("allocated_minor" >= 0);

ALTER TABLE "budget_items"
  ADD CONSTRAINT "budget_item_plan_fk" FOREIGN KEY ("budget_plan_id") REFERENCES "budget_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "budget_item_category_fk" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id"),
  ADD CONSTRAINT "budget_item_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "budget_item_money_nonnegative" CHECK ("estimated_minor" >= 0 AND ("quoted_minor" IS NULL OR "quoted_minor" >= 0) AND ("committed_minor" IS NULL OR "committed_minor" >= 0) AND "paid_minor" >= 0);

ALTER TABLE "expense_records"
  ADD CONSTRAINT "expense_budget_item_fk" FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id"),
  ADD CONSTRAINT "expense_amount_positive" CHECK ("amount_minor" > 0);

ALTER TABLE "payment_schedule_entries"
  ADD CONSTRAINT "payment_schedule_budget_item_fk" FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id"),
  ADD CONSTRAINT "payment_schedule_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_schedule_contract_fk" FOREIGN KEY ("contract_id") REFERENCES "vendor_contracts"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_schedule_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_schedule_amount_positive" CHECK ("amount_minor" > 0 AND "paid_minor" >= 0 AND "paid_minor" <= "amount_minor");

ALTER TABLE "payment_records"
  ADD CONSTRAINT "payment_record_schedule_fk" FOREIGN KEY ("payment_schedule_entry_id") REFERENCES "payment_schedule_entries"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_record_budget_item_fk" FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id"),
  ADD CONSTRAINT "payment_record_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_record_contract_fk" FOREIGN KEY ("contract_id") REFERENCES "vendor_contracts"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_record_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_record_reversal_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "payment_records"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "payment_record_amount_positive" CHECK ("amount_minor" > 0);

CREATE INDEX "payment_schedule_due_active_idx"
  ON "payment_schedule_entries" ("workspace_id", "due_at")
  WHERE "deleted_at" IS NULL AND "status" IN ('UPCOMING', 'DUE', 'OVERDUE', 'PARTIALLY_PAID');

CREATE INDEX "budget_items_active_source_idx"
  ON "budget_items" ("workspace_id", "source_type", "source_id")
  WHERE "deleted_at" IS NULL;

