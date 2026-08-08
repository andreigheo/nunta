-- Prisma emits ON CONFLICT against these schema-declared unique selectors.
-- PostgreSQL cannot infer a partial unique index for that statement, while a
-- regular unique index still permits multiple NULL values and preserves the
-- intended optional-key semantics.

DROP INDEX IF EXISTS "requests_for_quote_awarded_offer_key";
CREATE UNIQUE INDEX "requests_for_quote_awarded_offer_key"
  ON "requests_for_quote" ("awarded_offer_id");

DROP INDEX IF EXISTS "vendor_availability_booking_key";
CREATE UNIQUE INDEX "vendor_availability_booking_key"
  ON "vendor_availability_blocks" ("booking_id");

DROP INDEX IF EXISTS "budget_items_chain_key";
CREATE UNIQUE INDEX "budget_items_chain_key"
  ON "budget_items" ("workspace_id", "source_chain_key");

DROP INDEX IF EXISTS "payment_schedule_contract_version_sequence_key";
CREATE UNIQUE INDEX "payment_schedule_contract_version_sequence_key"
  ON "payment_schedule_entries" ("source_contract_version_id", "sequence");
