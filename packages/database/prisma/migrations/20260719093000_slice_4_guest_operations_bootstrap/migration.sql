CREATE OR REPLACE FUNCTION public.weddingos_guest_operations_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_grant public.guest_access_grants%ROWTYPE;
BEGIN
  SELECT * INTO v_grant
  FROM public.guest_access_grants
  WHERE id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND token_hash = NULLIF(current_setting('app.current_guest_token_hash', true), '')
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest operations grant is invalid' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'seating', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'guestId', g.id,
        'guestName', COALESCE(g.display_name, concat_ws(' ', g.first_name, g.last_name)),
        'eventId', a.wedding_event_id,
        'eventTitle', e.title,
        'planId', p.id,
        'planName', p.name,
        'tableLabel', t.label,
        'tableName', t.name,
        'seatLabel', s.label,
        'status', lower(a.status::text)
      ) ORDER BY e.start_at, t.position, g.first_name)
      FROM public.guest_seating_assignments a
      JOIN public.guests g ON g.id = a.guest_id
      JOIN public.seating_plans p ON p.id = a.seating_plan_id
      JOIN public.seating_tables t ON t.id = a.seating_table_id
      LEFT JOIN public.seating_seats s ON s.id = a.seating_seat_id
      JOIN public.wedding_events e ON e.id = a.wedding_event_id
      WHERE a.workspace_id = v_grant.workspace_id
        AND g.household_id = v_grant.household_id
        AND a.status = 'ACTIVE'
        AND p.status = 'PUBLISHED'
        AND p.deleted_at IS NULL
        AND t.deleted_at IS NULL
    ), '[]'::jsonb),
    'transport', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'guestId', g.id,
        'guestName', COALESCE(g.display_name, concat_ws(' ', g.first_name, g.last_name)),
        'planId', p.id,
        'planName', p.name,
        'routeId', r.id,
        'routeName', r.name,
        'direction', lower(r.direction::text),
        'departureAt', r.departure_at,
        'arrivalAt', r.arrival_at,
        'originName', r.origin_name,
        'destinationName', r.destination_name,
        'vehicleName', v.name,
        'pickupStop', pickup.name,
        'dropoffStop', dropoff.name,
        'status', lower(a.status::text)
      ) ORDER BY r.departure_at, r.name, g.first_name)
      FROM public.guest_transport_assignments a
      JOIN public.guests g ON g.id = a.guest_id
      JOIN public.transport_routes r ON r.id = a.route_id
      JOIN public.transport_plans p ON p.id = r.transport_plan_id
      LEFT JOIN public.transport_vehicles v ON v.id = r.vehicle_id
      LEFT JOIN public.transport_stops pickup ON pickup.id = a.pickup_stop_id
      LEFT JOIN public.transport_stops dropoff ON dropoff.id = a.dropoff_stop_id
      WHERE a.workspace_id = v_grant.workspace_id
        AND g.household_id = v_grant.household_id
        AND a.status = 'ASSIGNED'
        AND p.status = 'PUBLISHED'
        AND p.deleted_at IS NULL
        AND r.deleted_at IS NULL
    ), '[]'::jsonb),
    'accommodation', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'guestId', g.id,
        'guestName', COALESCE(g.display_name, concat_ws(' ', g.first_name, g.last_name)),
        'stayId', stay.id,
        'stayName', stay.name,
        'propertyName', property.name,
        'propertyAddress', property.address,
        'propertyCity', property.city,
        'roomName', room.name,
        'checkInDate', a.check_in_date,
        'checkOutDate', a.check_out_date,
        'checkInTime', property.check_in_time,
        'checkOutTime', property.check_out_time,
        'instructions', property.instructions,
        'status', lower(a.status::text)
      ) ORDER BY a.check_in_date, room.name, g.first_name)
      FROM public.accommodation_allocations a
      JOIN public.guests g ON g.id = a.guest_id
      JOIN public.accommodation_stays stay ON stay.id = a.stay_id
      JOIN public.accommodation_rooms room ON room.id = a.room_id
      JOIN public.accommodation_properties property ON property.id = stay.property_id
      WHERE a.workspace_id = v_grant.workspace_id
        AND g.household_id = v_grant.household_id
        AND a.status = 'ASSIGNED'
        AND stay.status = 'PUBLISHED'
        AND stay.deleted_at IS NULL
        AND room.deleted_at IS NULL
        AND property.deleted_at IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_guest_operations_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_operations_bootstrap() TO weddingos_app;
