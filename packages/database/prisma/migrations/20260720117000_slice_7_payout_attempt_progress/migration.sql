-- A payout provider call is completed outside the reservation transaction.
-- Permit the owning vendor (or a platform payout operator) to persist the
-- durable attempt outcome when the provider responds.
CREATE POLICY "payout_attempts_update" ON "vendor_payout_attempts"
FOR UPDATE TO weddingos_app
USING (
  EXISTS (
    SELECT 1
    FROM "vendor_payouts" payout
    WHERE payout.id = payout_id
      AND (
        public.weddingos_has_vendor_access(payout.vendor_organization_id)
        OR public.weddingos_has_platform_capability('platform.payout.reconcile')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "vendor_payouts" payout
    WHERE payout.id = payout_id
      AND (
        public.weddingos_has_vendor_access(payout.vendor_organization_id)
        OR public.weddingos_has_platform_capability('platform.payout.reconcile')
      )
  )
);
