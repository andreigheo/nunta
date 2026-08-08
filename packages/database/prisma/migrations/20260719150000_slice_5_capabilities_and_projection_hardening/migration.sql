INSERT INTO "vendor_role_templates" ("id", "key", "name", "description", "capabilities", "system", "created_at", "updated_at", "version")
VALUES
  (gen_random_uuid(), 'vendor_owner', 'Proprietar furnizor', 'Administrează integral organizația furnizorului.',
   '["vendor.organization.read","vendor.organization.write","vendor.members.read","vendor.members.write","vendor.profile.read","vendor.profile.write","vendor.profile.publish","vendor.services.read","vendor.services.write","vendor.availability.read","vendor.availability.write","vendor.rfq.read","vendor.rfq.decline","vendor.offer.read","vendor.offer.write","vendor.offer.submit","vendor.booking.read","vendor.booking.transition","vendor.contract.read","vendor.contract.write","vendor.contract.acknowledge"]'::jsonb, true, now(), now(), 1),
  (gen_random_uuid(), 'vendor_manager', 'Manager furnizor', 'Administrează profilul și operațiunile comerciale.',
   '["vendor.organization.read","vendor.organization.write","vendor.members.read","vendor.members.write","vendor.profile.read","vendor.profile.write","vendor.profile.publish","vendor.services.read","vendor.services.write","vendor.availability.read","vendor.availability.write","vendor.rfq.read","vendor.rfq.decline","vendor.offer.read","vendor.offer.write","vendor.offer.submit","vendor.booking.read","vendor.booking.transition","vendor.contract.read","vendor.contract.write","vendor.contract.acknowledge"]'::jsonb, true, now(), now(), 1),
  (gen_random_uuid(), 'vendor_sales', 'Vânzări', 'Răspunde solicitărilor și negociază ofertele.',
   '["vendor.organization.read","vendor.profile.read","vendor.services.read","vendor.availability.read","vendor.rfq.read","vendor.rfq.decline","vendor.offer.read","vendor.offer.write","vendor.offer.submit","vendor.booking.read","vendor.contract.read"]'::jsonb, true, now(), now(), 1),
  (gen_random_uuid(), 'vendor_operations', 'Operațiuni', 'Gestionează rezervările și disponibilitatea.',
   '["vendor.organization.read","vendor.profile.read","vendor.services.read","vendor.availability.read","vendor.availability.write","vendor.booking.read","vendor.booking.transition","vendor.contract.read"]'::jsonb, true, now(), now(), 1),
  (gen_random_uuid(), 'vendor_viewer', 'Vizualizator furnizor', 'Acces de citire la operațiunile furnizorului.',
   '["vendor.organization.read","vendor.members.read","vendor.profile.read","vendor.services.read","vendor.availability.read","vendor.rfq.read","vendor.offer.read","vendor.booking.read","vendor.contract.read"]'::jsonb, true, now(), now(), 1)
ON CONFLICT ("key") DO UPDATE
SET "name" = EXCLUDED."name", "description" = EXCLUDED."description",
    "capabilities" = EXCLUDED."capabilities", "updated_at" = now(), "version" = "vendor_role_templates"."version" + 1;

UPDATE "role_templates" template
SET "capabilities" = (
  SELECT jsonb_agg(value ORDER BY value)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(
      template."capabilities" ||
      CASE template."key"
        WHEN 'couple_owner' THEN '["marketplace.read","marketplace.favorite","marketplace.shortlist","rfq.read","rfq.write","rfq.send","rfq.close","offer.read","offer.review","offer.request_revision","offer.accept","offer.reject","booking.read","booking.write","booking.transition","contract.read","contract.write","contract.review","contract.acknowledge","contract.cancel","contract.export","budget.read","budget.write","budget.export","expense.read","expense.write","payment.read","payment.write","payment.confirm","payment.reverse","payment.export"]'::jsonb
        WHEN 'couple_partner' THEN '["marketplace.read","marketplace.favorite","marketplace.shortlist","rfq.read","rfq.write","rfq.send","rfq.close","offer.read","offer.review","offer.request_revision","offer.accept","offer.reject","booking.read","booking.write","booking.transition","contract.read","contract.write","contract.review","contract.acknowledge","contract.cancel","contract.export","budget.read","budget.write","budget.export","expense.read","expense.write","payment.read","payment.write","payment.confirm","payment.reverse","payment.export"]'::jsonb
        WHEN 'wedding_planner' THEN '["marketplace.read","marketplace.favorite","marketplace.shortlist","rfq.read","rfq.write","rfq.send","rfq.close","offer.read","offer.review","offer.request_revision","offer.accept","offer.reject","booking.read","booking.write","booking.transition","contract.read","contract.write","contract.review","contract.cancel","contract.export","budget.read","budget.write","budget.export","expense.read","expense.write","payment.read","payment.write","payment.export"]'::jsonb
        WHEN 'family_collaborator' THEN '["marketplace.read","rfq.read","offer.read","booking.read","contract.read","budget.read","expense.read","payment.read"]'::jsonb
        WHEN 'viewer' THEN '["marketplace.read","rfq.read","offer.read","booking.read","contract.read","budget.read","expense.read","payment.read"]'::jsonb
        ELSE '[]'::jsonb
      END
    ) AS value
  ) merged
)
WHERE template."key" IN ('couple_owner','couple_partner','wedding_planner','family_collaborator','viewer');

ALTER TABLE "outbox_messages"
  ADD CONSTRAINT "outbox_vendor_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE SET NULL;
ALTER TABLE "background_jobs"
  ADD CONSTRAINT "background_jobs_vendor_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE SET NULL;
ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_vendor_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE SET NULL;
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_vendor_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.weddingos_protect_vendor_verification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF session_user = 'weddingos_app' AND (
    (TG_OP = 'INSERT' AND NEW.verification_status <> 'UNVERIFIED')
    OR (TG_OP = 'UPDATE' AND NEW.verification_status IS DISTINCT FROM OLD.verification_status)
  ) THEN
    RAISE EXCEPTION 'vendor verification is an administrative operation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "vendor_verification_protected"
  BEFORE INSERT OR UPDATE OF "verification_status" ON "vendor_profiles"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_protect_vendor_verification();

CREATE OR REPLACE FUNCTION public.weddingos_validate_vendor_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
BEGIN
  IF NEW.publication_status = 'PUBLISHED' AND OLD.publication_status IS DISTINCT FROM 'PUBLISHED' THEN
    IF NEW.headline = '' OR NEW.description = '' OR cardinality(NEW.categories) = 0
       OR NOT EXISTS (SELECT 1 FROM public.vendor_services s WHERE s.vendor_organization_id = NEW.vendor_organization_id AND s.active AND s.deleted_at IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.vendor_service_regions r WHERE r.vendor_organization_id = NEW.vendor_organization_id)
       OR NOT EXISTS (SELECT 1 FROM public.vendor_organizations o WHERE o.id = NEW.vendor_organization_id AND o.status = 'ACTIVE') THEN
      RAISE EXCEPTION 'vendor profile is incomplete for publication' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "vendor_publication_completeness"
  BEFORE UPDATE OF "publication_status" ON "vendor_profiles"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_validate_vendor_publication();

-- RLS stays mandatory even when future migrations add partitions/indexes.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_organizations','vendor_organization_memberships','vendor_membership_capability_overrides',
    'vendor_organization_invitations','vendor_profiles','vendor_services','vendor_packages',
    'vendor_service_regions','vendor_availability_blocks','vendor_portfolio_references',
    'vendor_notifications','vendor_favorites','vendor_shortlists','vendor_shortlist_items',
    'requests_for_quote','rfq_requirements','rfq_questions','rfq_recipients',
    'rfq_recipient_snapshots','vendor_offers','vendor_offer_versions','vendor_offer_line_items',
    'vendor_offer_answers','negotiation_threads','negotiation_messages','vendor_bookings',
    'booking_service_items','booking_milestones','vendor_contracts','vendor_contract_versions',
    'contract_party_acknowledgements','budget_plans','budget_categories','budget_items',
    'expense_records','payment_schedule_entries','payment_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

