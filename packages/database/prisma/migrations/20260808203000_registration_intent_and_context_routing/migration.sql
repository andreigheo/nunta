BEGIN;

CREATE TYPE "RegistrationIntent" AS ENUM (
  'EVENT_ORGANIZER',
  'SERVICE_PROVIDER',
  'INVITED_MEMBER'
);

ALTER TABLE "user_preferences"
  ADD COLUMN "registration_intent" "RegistrationIntent" NOT NULL DEFAULT 'EVENT_ORGANIZER';

UPDATE "role_templates"
SET
  "name" = CASE "key"
    WHEN 'couple_owner' THEN 'Organizator principal'
    WHEN 'couple_partner' THEN 'Co-organizator'
    WHEN 'wedding_planner' THEN 'Planner de eveniment'
    WHEN 'family_collaborator' THEN 'Colaborator'
    WHEN 'viewer' THEN 'Invitat cu acces'
    ELSE "name"
  END,
  "description" = CASE "key"
    WHEN 'couple_owner' THEN 'Administrează integral evenimentul, echipa și abonamentul.'
    WHEN 'couple_partner' THEN 'Organizează evenimentul împreună cu proprietarul spațiului.'
    WHEN 'wedding_planner' THEN 'Coordonează operațional evenimentul, fără administrarea contului.'
    WHEN 'family_collaborator' THEN 'Colaborează în modulele permise prin invitație.'
    WHEN 'viewer' THEN 'Consultă informațiile permise, fără acțiuni de modificare.'
    ELSE "description"
  END
WHERE "key" IN (
  'couple_owner',
  'couple_partner',
  'wedding_planner',
  'family_collaborator',
  'viewer'
);

COMMIT;
