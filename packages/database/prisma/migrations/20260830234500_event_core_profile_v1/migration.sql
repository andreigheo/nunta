BEGIN;

ALTER TABLE "wedding_profiles"
  ADD COLUMN "event_type" VARCHAR(40) NOT NULL DEFAULT 'wedding',
  ADD COLUMN "organizer_name" VARCHAR(160);

ALTER TABLE "wedding_profiles"
  ADD CONSTRAINT "wedding_profiles_event_type_check"
  CHECK ("event_type" IN (
    'wedding',
    'baptism',
    'birthday',
    'corporate',
    'conference',
    'anniversary',
    'private_party',
    'festival',
    'fundraiser',
    'other'
  ));

COMMENT ON COLUMN "wedding_profiles"."event_type" IS
  'Generic Event Core discriminator; table and wedding_* fields remain compatibility storage.';
COMMENT ON COLUMN "wedding_profiles"."wedding_date" IS
  'Legacy storage name exposed as eventDate in Event Core APIs.';

COMMIT;
