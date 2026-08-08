ALTER TABLE public.notification_preferences
  ADD COLUMN quiet_hours_start varchar(5),
  ADD COLUMN quiet_hours_end varchar(5),
  ADD CONSTRAINT notification_preferences_quiet_hours_pair_check
    CHECK (
      (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
      OR (
        quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
    );
