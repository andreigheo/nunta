CREATE POLICY "payment_provider_events_app_update"
ON "payment_provider_events"
FOR UPDATE
TO weddingos_app
USING (
  EXISTS (
    SELECT 1
    FROM "online_payment_checkouts" checkout
    WHERE checkout.provider = payment_provider_events.provider
      AND (
        checkout.provider_checkout_id = payment_provider_events.provider_checkout_id
        OR EXISTS (
          SELECT 1
          FROM "online_payment_transactions" transaction_row
          WHERE transaction_row.checkout_id = checkout.id
            AND transaction_row.provider_payment_id = payment_provider_events.provider_payment_id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "online_payment_checkouts" checkout
    WHERE checkout.provider = payment_provider_events.provider
      AND (
        checkout.provider_checkout_id = payment_provider_events.provider_checkout_id
        OR EXISTS (
          SELECT 1
          FROM "online_payment_transactions" transaction_row
          WHERE transaction_row.checkout_id = checkout.id
            AND transaction_row.provider_payment_id = payment_provider_events.provider_payment_id
        )
      )
  )
);
