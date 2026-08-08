-- A budget item may retain schedules from multiple immutable contract
-- versions. Only the active manual schedule needs budget-item/sequence
-- uniqueness; contract-derived schedules are keyed by source version.
DROP INDEX IF EXISTS "payment_schedule_entries_budget_item_id_sequence_key";
CREATE INDEX "payment_schedule_entries_budget_item_id_sequence_idx"
  ON "payment_schedule_entries" ("budget_item_id", "sequence");
CREATE UNIQUE INDEX "payment_schedule_entries_manual_sequence_key"
  ON "payment_schedule_entries" ("budget_item_id", "sequence")
  WHERE "source_contract_version_id" IS NULL AND "deleted_at" IS NULL;
