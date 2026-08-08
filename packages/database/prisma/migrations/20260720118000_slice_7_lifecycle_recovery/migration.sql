-- Payout attempts, rather than the settlement payout row, own retry identity.
ALTER TABLE "vendor_payout_attempts"
  ADD COLUMN "idempotency_key" VARCHAR(200);

UPDATE "vendor_payout_attempts" attempt
SET "idempotency_key" = payout."idempotency_key"
FROM "vendor_payouts" payout
WHERE payout.id = attempt."payout_id";

ALTER TABLE "vendor_payout_attempts"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX "vendor_payout_attempts_payout_id_idempotency_key_key"
  ON "vendor_payout_attempts"("payout_id", "idempotency_key");

-- Paid payout facts are immutable, but a provider-confirmed return is a valid
-- forward transition and must create a compensating ledger entry.
DROP TRIGGER IF EXISTS "vendor_payouts_paid_immutable" ON "vendor_payouts";

CREATE OR REPLACE FUNCTION public.weddingos_guard_terminal_payout()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'terminal payout cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.vendor_organization_id IS DISTINCT FROM OLD.vendor_organization_id
     OR NEW.settlement_id IS DISTINCT FROM OLD.settlement_id
     OR NEW.payout_account_id IS DISTINCT FROM OLD.payout_account_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_payout_id IS DISTINCT FROM OLD.provider_payout_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR (OLD.status = 'RETURNED' AND NEW.status IS DISTINCT FROM OLD.status)
     OR (OLD.status = 'PAID' AND NEW.status NOT IN ('PAID', 'RETURNED')) THEN
    RAISE EXCEPTION 'terminal payout facts are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vendor_payouts_terminal_immutable"
BEFORE UPDATE OR DELETE ON "vendor_payouts"
FOR EACH ROW WHEN (OLD."status" IN ('PAID','RETURNED'))
EXECUTE FUNCTION public.weddingos_guard_terminal_payout();
