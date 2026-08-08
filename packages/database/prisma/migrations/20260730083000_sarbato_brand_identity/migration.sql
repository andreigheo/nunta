-- Keep persisted, user-visible catalog and consent labels aligned with the
-- Sarbato public identity. Historical technical identifiers remain unchanged.
UPDATE "subscription_products"
SET
  "name" = 'Sarbato Furnizori',
  "description" = 'Acces comercial configurabil pentru furnizorii Sarbato',
  "version" = "version" + 1,
  "updated_at" = now()
WHERE "key" = 'vendor-marketplace'
  AND (
    "name" <> 'Sarbato Furnizori'
    OR "description" <> 'Acces comercial configurabil pentru furnizorii Sarbato'
  );

UPDATE "consent_purposes"
SET
  "description" = 'Procesare necesară furnizării și securizării Sarbato.',
  "version" = "version" + 1,
  "updated_at" = now()
WHERE "key" = 'essential-service'
  AND "description" <> 'Procesare necesară furnizării și securizării Sarbato.';
