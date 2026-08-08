-- Commercial document contents stay append-only. Lifecycle timestamps are the
-- only fields that may change after insertion so an agreed version can become
-- effective and an older agreed version can be marked superseded.
CREATE OR REPLACE FUNCTION public.weddingos_reject_immutable_commercial_version_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial versions are immutable' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['effective_at', 'superseded_at'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['effective_at', 'superseded_at']) THEN
    RAISE EXCEPTION 'commercial version contents are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

-- Applying an effective contract touches wedding-private budget rows. A vendor
-- acknowledgement must not gain general workspace/budget visibility, so the
-- exact projection is performed by this persisted-context verifier instead of
-- weakening RLS on the underlying tables.
CREATE OR REPLACE FUNCTION public.weddingos_apply_effective_contract_projection(
  target_contract_id uuid,
  target_contract_version_id uuid,
  target_actor_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_id uuid := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  contract_record public.vendor_contracts%ROWTYPE;
  contract_version_record public.vendor_contract_versions%ROWTYPE;
  booking_record public.vendor_bookings%ROWTYPE;
  budget_item_record public.budget_items%ROWTYPE;
  workspace_currency char(3);
  schedule_value jsonb;
  schedule_record record;
  contract_total_minor bigint;
BEGIN
  IF actor_id IS NULL OR actor_id <> target_actor_user_id THEN
    RAISE EXCEPTION 'contract projection actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT contract.* INTO contract_record
  FROM public.vendor_contracts contract
  WHERE contract.id = target_contract_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships membership
      WHERE membership.workspace_id = contract_record.workspace_id
        AND membership.user_id = actor_id
        AND membership.status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM public.vendor_organization_memberships membership
      WHERE membership.vendor_organization_id = contract_record.vendor_organization_id
        AND membership.user_id = actor_id
        AND membership.status = 'ACTIVE'
    )
  ) THEN
    RAISE EXCEPTION 'contract projection tenant mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT version.* INTO contract_version_record
  FROM public.vendor_contract_versions version
  WHERE version.id = target_contract_version_id
    AND version.contract_id = target_contract_id;
  IF NOT FOUND
     OR contract_record.status <> 'ACKNOWLEDGED'
     OR contract_record.agreed_version_id IS DISTINCT FROM target_contract_version_id
     OR NOT EXISTS (
       SELECT 1 FROM public.contract_party_acknowledgements acknowledgement
       WHERE acknowledgement.contract_version_id = target_contract_version_id
         AND acknowledgement.party_type = 'WEDDING'
         AND acknowledgement.content_hash = contract_version_record.content_hash
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.contract_party_acknowledgements acknowledgement
       WHERE acknowledgement.contract_version_id = target_contract_version_id
         AND acknowledgement.party_type = 'VENDOR'
         AND acknowledgement.content_hash = contract_version_record.content_hash
     ) THEN
    RAISE EXCEPTION 'contract projection preconditions failed' USING ERRCODE = '23514';
  END IF;

  SELECT booking.* INTO booking_record
  FROM public.vendor_bookings booking
  WHERE booking.id = contract_record.booking_id
    AND booking.workspace_id = contract_record.workspace_id
    AND booking.vendor_organization_id = contract_record.vendor_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract booking not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT workspace.currency INTO workspace_currency
  FROM public.workspaces workspace
  WHERE workspace.id = contract_record.workspace_id;
  IF workspace_currency IS DISTINCT FROM booking_record.currency THEN
    RAISE EXCEPTION 'contract currency mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT item.* INTO budget_item_record
  FROM public.budget_items item
  WHERE item.workspace_id = contract_record.workspace_id
    AND item.source_chain_key = 'offer:' || booking_record.offer_id::text
    AND item.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract budget chain not found' USING ERRCODE = 'P0002';
  END IF;

  contract_total_minor := COALESCE(
    NULLIF(contract_version_record.payment_terms ->> 'totalMinor', '')::bigint,
    NULLIF(contract_version_record.document -> 'total' ->> 'amountMinor', '')::bigint,
    booking_record.total_minor
  );
  UPDATE public.budget_items
  SET source_type = 'CONTRACT',
      source_id = contract_record.id,
      committed_minor = COALESCE(manual_override_minor, contract_total_minor),
      status = CASE WHEN paid_minor > 0 THEN 'PARTIALLY_PAID'::"BudgetItemStatus"
                    ELSE 'COMMITTED'::"BudgetItemStatus" END,
      version = version + 1,
      updated_at = now()
  WHERE id = budget_item_record.id;

  UPDATE public.payment_schedule_entries
  SET status = 'CANCELLED', deleted_at = now(), version = version + 1, updated_at = now()
  WHERE contract_id = contract_record.id
    AND source_contract_version_id IS DISTINCT FROM target_contract_version_id
    AND paid_minor = 0
    AND due_at > now()
    AND deleted_at IS NULL;

  schedule_value := COALESCE(
    contract_version_record.payment_terms -> 'paymentSchedule',
    contract_version_record.document -> 'paymentSchedule',
    '[]'::jsonb
  );
  IF jsonb_typeof(schedule_value) = 'array' THEN
    FOR schedule_record IN
      SELECT entry.value, entry.ordinality::integer AS sequence
      FROM jsonb_array_elements(schedule_value) WITH ORDINALITY AS entry(value, ordinality)
    LOOP
      INSERT INTO public.payment_schedule_entries (
        id, workspace_id, budget_item_id, booking_id, contract_id,
        source_contract_version_id, vendor_organization_id, name, amount_minor,
        currency, paid_minor, due_at, sequence, status, created_by,
        created_at, updated_at, version
      ) VALUES (
        gen_random_uuid(), contract_record.workspace_id, budget_item_record.id,
        booking_record.id, contract_record.id, target_contract_version_id,
        contract_record.vendor_organization_id,
        COALESCE(NULLIF(schedule_record.value ->> 'name', ''), 'Tranșa ' || schedule_record.sequence),
        (schedule_record.value ->> 'amountMinor')::bigint,
        workspace_currency, 0, (schedule_record.value ->> 'dueAt')::timestamptz,
        schedule_record.sequence, 'UPCOMING', actor_id, now(), now(), 1
      )
      ON CONFLICT (source_contract_version_id, sequence) DO UPDATE
      SET name = EXCLUDED.name,
          amount_minor = EXCLUDED.amount_minor,
          currency = EXCLUDED.currency,
          due_at = EXCLUDED.due_at,
          status = 'UPCOMING',
          deleted_at = NULL,
          version = payment_schedule_entries.version + 1,
          updated_at = now();
    END LOOP;
  END IF;

  UPDATE public.vendor_contract_versions
  SET effective_at = COALESCE(effective_at, now())
  WHERE id = target_contract_version_id;
  IF contract_version_record.base_version_id IS NOT NULL THEN
    UPDATE public.vendor_contract_versions
    SET superseded_at = COALESCE(superseded_at, now())
    WHERE id = contract_version_record.base_version_id;
  END IF;

  UPDATE public.vendor_bookings
  SET status = 'CONFIRMED', confirmed_at = COALESCE(confirmed_at, now()),
      version = version + 1, updated_at = now()
  WHERE id = booking_record.id;

  IF booking_record.service_start_at IS NOT NULL AND booking_record.service_end_at IS NOT NULL THEN
    INSERT INTO public.vendor_availability_blocks (
      id, vendor_organization_id, booking_id, start_at, end_at, status,
      source, created_by, created_at, updated_at, version
    ) VALUES (
      booking_record.id, booking_record.vendor_organization_id, booking_record.id,
      booking_record.service_start_at,
      CASE WHEN booking_record.service_end_at > booking_record.service_start_at
           THEN booking_record.service_end_at
           ELSE booking_record.service_start_at + interval '1 hour' END,
      'BOOKED', 'BOOKING', actor_id, now(), now(), 1
    )
    ON CONFLICT (booking_id) DO UPDATE
    SET status = 'BOOKED', deleted_at = NULL,
        version = vendor_availability_blocks.version + 1, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_apply_effective_contract_projection(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_apply_effective_contract_projection(uuid, uuid, uuid) TO weddingos_app;
