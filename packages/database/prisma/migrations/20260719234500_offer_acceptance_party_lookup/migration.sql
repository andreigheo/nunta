CREATE OR REPLACE FUNCTION public.weddingos_offer_acceptance_party_context(
  target_workspace_id uuid,
  target_offer_id uuid,
  target_vendor_organization_id uuid
)
RETURNS TABLE (
  organization_status text,
  legal_name text,
  display_name text,
  country text,
  profile_publication_status text,
  public_profile jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT organization.status::text,
         organization.legal_name::text,
         organization.display_name::text,
         organization.country::text,
         profile.publication_status::text,
         jsonb_build_object(
           'vendorOrganizationId', profile.vendor_organization_id,
           'slug', profile.slug,
           'headline', profile.headline,
           'shortDescription', profile.short_description,
           'categories', profile.categories,
           'logoUrl', profile.logo_url,
           'coverImageUrl', profile.cover_image_url,
           'startingPriceMinor', profile.starting_price_minor,
           'currency', profile.currency,
           'pricingVisibility', profile.pricing_visibility,
           'verificationStatus', profile.verification_status,
           'responseTimeLabel', profile.response_time_label
         )
  FROM public.vendor_offers AS offer
  JOIN public.vendor_organizations AS organization
    ON organization.id = offer.vendor_organization_id
  JOIN public.vendor_profiles AS profile
    ON profile.vendor_organization_id = organization.id
  WHERE offer.id = target_offer_id
    AND offer.workspace_id = target_workspace_id
    AND offer.vendor_organization_id = target_vendor_organization_id
    AND public.weddingos_has_workspace_access(target_workspace_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.weddingos_offer_acceptance_party_context(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_offer_acceptance_party_context(uuid, uuid, uuid) TO weddingos_app;
