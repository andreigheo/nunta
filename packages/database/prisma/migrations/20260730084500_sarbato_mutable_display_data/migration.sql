-- Rename mutable, user-visible records created under the previous product
-- identity. Immutable audit/delivery history and compatibility identifiers are
-- intentionally left untouched.
UPDATE "workspaces"
SET
  "title" = replace(
    replace(replace("title", 'WeddingOS', 'Sarbato'), 'Nunta Space', 'Sarbato'),
    'NuntaSpace',
    'Sarbato'
  ),
  "version" = "version" + 1,
  "updated_at" = now()
WHERE "title" ILIKE ANY (
  ARRAY['%WeddingOS%', '%Nunta Space%', '%NuntaSpace%']
);

UPDATE "vendor_organizations"
SET
  "legal_name" = replace(
    replace(
      replace("legal_name", 'WeddingOS', 'Sarbato'),
      'Nunta Space',
      'Sarbato'
    ),
    'NuntaSpace',
    'Sarbato'
  ),
  "display_name" = replace(
    replace(
      replace("display_name", 'WeddingOS', 'Sarbato'),
      'Nunta Space',
      'Sarbato'
    ),
    'NuntaSpace',
    'Sarbato'
  ),
  "version" = "version" + 1,
  "updated_at" = now()
WHERE
  "legal_name" ILIKE ANY (
    ARRAY['%WeddingOS%', '%Nunta Space%', '%NuntaSpace%']
  )
  OR "display_name" ILIKE ANY (
    ARRAY['%WeddingOS%', '%Nunta Space%', '%NuntaSpace%']
  );

UPDATE "notifications"
SET
  "body" = replace(
    replace(replace("body", 'WeddingOS', 'Sarbato'), 'Nunta Space', 'Sarbato'),
    'NuntaSpace',
    'Sarbato'
  ),
  "version" = "version" + 1,
  "updated_at" = now()
WHERE "body" ILIKE ANY (
  ARRAY['%WeddingOS%', '%Nunta Space%', '%NuntaSpace%']
);
