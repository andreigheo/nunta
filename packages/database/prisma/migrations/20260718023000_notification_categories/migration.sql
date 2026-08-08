ALTER TABLE "notification_preferences"
  RENAME COLUMN "planning_email" TO "tasks_email";

ALTER TABLE "notification_preferences"
  ADD COLUMN "payments_email" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "rsvp_email" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "vendors_email" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "digest_email" BOOLEAN NOT NULL DEFAULT true;
