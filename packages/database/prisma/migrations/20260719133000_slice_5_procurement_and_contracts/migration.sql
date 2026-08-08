-- Slice 5 procurement integrity. Tenant authorization is added in the dedicated
-- dual-tenant migration after every canonical relation exists.
ALTER TABLE "vendor_organization_memberships"
  ADD CONSTRAINT "vendor_membership_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_membership_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_membership_role_fk" FOREIGN KEY ("role_template_id") REFERENCES "vendor_role_templates"("id");

ALTER TABLE "vendor_membership_capability_overrides"
  ADD CONSTRAINT "vendor_override_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_override_membership_fk" FOREIGN KEY ("membership_id") REFERENCES "vendor_organization_memberships"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_organization_invitations"
  ADD CONSTRAINT "vendor_invitation_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_invitation_role_fk" FOREIGN KEY ("role_template_id") REFERENCES "vendor_role_templates"("id");

ALTER TABLE "vendor_profiles"
  ADD CONSTRAINT "vendor_profile_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_profile_starting_price_nonnegative" CHECK ("starting_price_minor" IS NULL OR "starting_price_minor" >= 0);

ALTER TABLE "vendor_services"
  ADD CONSTRAINT "vendor_service_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_service_starting_price_nonnegative" CHECK ("starting_price_minor" IS NULL OR "starting_price_minor" >= 0);

ALTER TABLE "vendor_packages"
  ADD CONSTRAINT "vendor_package_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_package_service_fk" FOREIGN KEY ("service_id") REFERENCES "vendor_services"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_package_price_nonnegative" CHECK ("base_price_minor" IS NULL OR "base_price_minor" >= 0);

ALTER TABLE "vendor_service_regions"
  ADD CONSTRAINT "vendor_region_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_availability_blocks"
  ADD CONSTRAINT "vendor_availability_organization_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_availability_valid_range" CHECK ("end_at" > "start_at");

ALTER TABLE "vendor_favorites"
  ADD CONSTRAINT "vendor_favorite_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_favorite_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_shortlists"
  ADD CONSTRAINT "vendor_shortlist_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_shortlist_items"
  ADD CONSTRAINT "vendor_shortlist_item_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_shortlist_item_shortlist_fk" FOREIGN KEY ("shortlist_id") REFERENCES "vendor_shortlists"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_shortlist_item_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE;

ALTER TABLE "requests_for_quote"
  ADD CONSTRAINT "rfq_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "rfq_budget_range_valid" CHECK ("budget_range_min_minor" IS NULL OR "budget_range_max_minor" IS NULL OR "budget_range_max_minor" >= "budget_range_min_minor");

ALTER TABLE "rfq_requirements"
  ADD CONSTRAINT "rfq_requirement_rfq_fk" FOREIGN KEY ("rfq_id") REFERENCES "requests_for_quote"("id") ON DELETE CASCADE;
ALTER TABLE "rfq_questions"
  ADD CONSTRAINT "rfq_question_rfq_fk" FOREIGN KEY ("rfq_id") REFERENCES "requests_for_quote"("id") ON DELETE CASCADE;
ALTER TABLE "rfq_recipients"
  ADD CONSTRAINT "rfq_recipient_rfq_fk" FOREIGN KEY ("rfq_id") REFERENCES "requests_for_quote"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "rfq_recipient_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE;
ALTER TABLE "rfq_recipient_snapshots"
  ADD CONSTRAINT "rfq_snapshot_recipient_fk" FOREIGN KEY ("rfq_recipient_id") REFERENCES "rfq_recipients"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_offers"
  ADD CONSTRAINT "vendor_offer_rfq_fk" FOREIGN KEY ("rfq_id") REFERENCES "requests_for_quote"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_offer_recipient_fk" FOREIGN KEY ("rfq_recipient_id") REFERENCES "rfq_recipients"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_offer_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_offer_money_nonnegative" CHECK ("subtotal_minor" >= 0 AND "discount_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0 AND ("deposit_minor" IS NULL OR "deposit_minor" >= 0));

ALTER TABLE "vendor_offer_versions"
  ADD CONSTRAINT "vendor_offer_version_offer_fk" FOREIGN KEY ("offer_id") REFERENCES "vendor_offers"("id") ON DELETE CASCADE;
ALTER TABLE "vendor_offer_line_items"
  ADD CONSTRAINT "vendor_offer_line_version_fk" FOREIGN KEY ("offer_version_id") REFERENCES "vendor_offer_versions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_offer_line_money_nonnegative" CHECK ("quantity" > 0 AND "unit_price_minor" >= 0 AND "line_total_minor" >= 0);
ALTER TABLE "vendor_offer_answers"
  ADD CONSTRAINT "vendor_offer_answer_version_fk" FOREIGN KEY ("offer_version_id") REFERENCES "vendor_offer_versions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vendor_offer_answer_question_fk" FOREIGN KEY ("question_id") REFERENCES "rfq_questions"("id") ON DELETE CASCADE;

ALTER TABLE "negotiation_threads"
  ADD CONSTRAINT "negotiation_thread_offer_fk" FOREIGN KEY ("offer_id") REFERENCES "vendor_offers"("id") ON DELETE CASCADE;
ALTER TABLE "negotiation_messages"
  ADD CONSTRAINT "negotiation_message_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "negotiation_threads"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_bookings"
  ADD CONSTRAINT "vendor_booking_offer_fk" FOREIGN KEY ("offer_id") REFERENCES "vendor_offers"("id"),
  ADD CONSTRAINT "vendor_booking_rfq_fk" FOREIGN KEY ("rfq_id") REFERENCES "requests_for_quote"("id"),
  ADD CONSTRAINT "vendor_booking_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id"),
  ADD CONSTRAINT "vendor_booking_money_nonnegative" CHECK ("total_minor" >= 0 AND ("deposit_minor" IS NULL OR "deposit_minor" >= 0));
ALTER TABLE "booking_service_items"
  ADD CONSTRAINT "booking_service_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE CASCADE;
ALTER TABLE "booking_milestones"
  ADD CONSTRAINT "booking_milestone_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_contracts"
  ADD CONSTRAINT "vendor_contract_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id"),
  ADD CONSTRAINT "vendor_contract_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id");
ALTER TABLE "vendor_contract_versions"
  ADD CONSTRAINT "vendor_contract_version_contract_fk" FOREIGN KEY ("contract_id") REFERENCES "vendor_contracts"("id") ON DELETE CASCADE;
ALTER TABLE "contract_party_acknowledgements"
  ADD CONSTRAINT "contract_ack_contract_fk" FOREIGN KEY ("contract_id") REFERENCES "vendor_contracts"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "contract_ack_version_fk" FOREIGN KEY ("contract_version_id") REFERENCES "vendor_contract_versions"("id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.weddingos_reject_immutable_commercial_version_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commercial versions are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "offer_versions_immutable" BEFORE UPDATE OR DELETE ON "vendor_offer_versions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_immutable_commercial_version_update();
CREATE TRIGGER "contract_versions_immutable" BEFORE UPDATE OR DELETE ON "vendor_contract_versions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_immutable_commercial_version_update();

