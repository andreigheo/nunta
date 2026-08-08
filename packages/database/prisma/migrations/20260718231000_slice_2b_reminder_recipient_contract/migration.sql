CREATE FUNCTION public.weddingos_get_reminder_recipient(
  target_workspace_id uuid,
  target_user_id uuid
)
RETURNS TABLE (
  email text,
  first_name text,
  tasks_email boolean,
  quiet_hours_start text,
  quiet_hours_end text,
  timezone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.weddingos_worker_execution_context_matches(
    NULL, NULL, NULL, target_workspace_id, target_user_id
  ) THEN
    RAISE EXCEPTION 'persisted reminder recipient context required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    u.email::text,
    COALESCE(up.first_name, '')::text,
    COALESCE(np.tasks_email, true),
    np.quiet_hours_start::text,
    np.quiet_hours_end::text,
    COALESCE(pref.timezone, w.timezone)::text
  FROM public.users u
  JOIN public.workspace_memberships membership
    ON membership.user_id = u.id
   AND membership.workspace_id = target_workspace_id
   AND membership.status = 'ACTIVE'
  JOIN public.workspaces w ON w.id = target_workspace_id
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  LEFT JOIN public.notification_preferences np ON np.user_id = u.id
  LEFT JOIN public.user_preferences pref ON pref.user_id = u.id
  WHERE u.id = target_user_id;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_get_reminder_recipient(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_get_reminder_recipient(uuid, uuid) TO weddingos_worker;
