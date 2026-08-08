BEGIN;

-- Historical reconciliation: the revocation safety-gate DDL was consolidated
-- into 20260720213000_public_product_proof_hardening before this migration was
-- committed, leaving this directory without a migration.sql. Keep the history
-- traversable and fail closed if the earlier migration no longer provides the
-- exact database contract this migration was intended to protect.
DO $$
DECLARE
  table_oid oid := to_regclass('public.public_marketing_snapshot_invalidations');
BEGIN
  IF table_oid IS NULL THEN
    RAISE EXCEPTION
      'public_marketing_snapshot_invalidations is missing; apply 20260720213000 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = table_oid
      AND relrowsecurity
      AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION
      'public_marketing_snapshot_invalidations must have enabled and forced RLS';
  END IF;

  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'public_marketing_snapshot_invalidations'
      AND (
        (column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO')
        OR (column_name = 'invalidated_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO')
        OR (column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO')
      )
  ) <> 3 THEN
    RAISE EXCEPTION
      'public_marketing_snapshot_invalidations has an unexpected column contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'public_marketing_snapshot_invalidations'
      AND indexname = 'public_marketing_snapshot_invalidations_invalidated_idx'
  ) THEN
    RAISE EXCEPTION
      'public_marketing_snapshot_invalidations_invalidated_idx is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_marketing_snapshot_invalidations'
      AND policyname = 'public_marketing_snapshot_invalidation_app_read'
      AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_marketing_snapshot_invalidations'
      AND policyname = 'public_marketing_snapshot_invalidation_app_insert'
      AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION
      'public marketing snapshot invalidation policies are missing';
  END IF;

  IF NOT has_table_privilege(
    'weddingos_app',
    'public.public_marketing_snapshot_invalidations',
    'SELECT'
  ) OR NOT has_table_privilege(
    'weddingos_app',
    'public.public_marketing_snapshot_invalidations',
    'INSERT'
  ) THEN
    RAISE EXCEPTION
      'weddingos_app must have SELECT and INSERT on public marketing invalidations';
  END IF;
END
$$;

COMMIT;
