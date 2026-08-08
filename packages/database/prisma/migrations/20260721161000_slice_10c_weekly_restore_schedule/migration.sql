INSERT INTO backup_schedules (
  environment,
  key,
  backup_type,
  cron_expression,
  timezone,
  retention_days,
  minimum_verified,
  enabled,
  next_run_at,
  version,
  created_at,
  updated_at
)
SELECT
  environment,
  'weekly-restore-verification',
  'RESTORE_VERIFICATION',
  '0 5 * * 0',
  'Europe/Chisinau',
  35,
  2,
  true,
  now(),
  1,
  now(),
  now()
FROM (VALUES ('development'), ('test'), ('staging'), ('production')) environments(environment)
ON CONFLICT (environment, key) DO NOTHING;
