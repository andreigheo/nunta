-- WeddingEvent becomes the operational source after onboarding completion.
-- Existing READY drafts are materialized once; source_key prevents duplicates.
INSERT INTO public.wedding_events (
  id, workspace_id, type, title, start_at, timezone, location_name,
  location_address, guest_visible, rsvp_enabled, position, status, source,
  source_key, updated_at
)
SELECT
  gen_random_uuid(), draft.workspace_id, definition.type::public."WeddingEventType",
  definition.title,
  CASE
    WHEN (draft.date_events->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN ((draft.date_events->>'date')::date + definition.day_offset + definition.start_time)::timestamp
    ELSE NULL
  END,
  workspace.timezone,
  NULLIF(draft.location->>'venue', ''),
  NULLIF(draft.location->>'venueAddress', ''),
  true, true, definition.position,
  CASE WHEN (draft.date_events->>'date') ~ '^\d{4}-\d{2}-\d{2}$' THEN 'CONFIRMED'::public."WeddingEventStatus" ELSE 'DRAFT'::public."WeddingEventStatus" END,
  'onboarding', 'onboarding:' || definition.source_key, now()
FROM public.onboarding_drafts draft
JOIN public.workspaces workspace ON workspace.id = draft.workspace_id
CROSS JOIN LATERAL (VALUES
  ('CIVIL_CEREMONY', 'Cununia civilă', 'civil', -1, time '12:00', 0, COALESCE((draft.date_events->>'civil')::boolean, true)),
  ('RELIGIOUS_CEREMONY', 'Cununia religioasă', 'religious', 0, time '14:30', 1, COALESCE((draft.date_events->>'religious')::boolean, true)),
  ('RECEPTION', 'Recepția', 'reception', 0, time '17:00', 2, COALESCE((draft.date_events->>'reception')::boolean, true)),
  ('WELCOME_DINNER', 'Welcome dinner', 'welcome-dinner', -1, time '19:00', 3, COALESCE((draft.date_events->>'welcomeDinner')::boolean, false)),
  ('BRUNCH', 'Brunch', 'brunch', 1, time '11:00', 4, COALESCE((draft.date_events->>'brunch')::boolean, false))
) AS definition(type, title, source_key, day_offset, start_time, position, enabled)
WHERE draft.status = 'READY' AND definition.enabled
ON CONFLICT (workspace_id, source_key) DO NOTHING;
