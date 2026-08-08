CREATE OR REPLACE FUNCTION public.weddingos_accept_vendor_invitation(
  target_token_hash char(64), target_user_id uuid
)
RETURNS TABLE (invitation_id uuid, vendor_organization_id uuid, membership_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE invitation_record public.vendor_organization_invitations%ROWTYPE;
DECLARE membership_record public.vendor_organization_memberships%ROWTYPE;
BEGIN
  SELECT invitation.* INTO invitation_record
  FROM public.vendor_organization_invitations AS invitation
  JOIN public.users AS actor ON actor.id = target_user_id
  JOIN public.vendor_organizations AS organization ON organization.id = invitation.vendor_organization_id
  WHERE invitation.token_hash = target_token_hash
    AND lower(invitation.email) = lower(actor.email)
    AND invitation.status = 'PENDING'
    AND invitation.expires_at > now()
    AND organization.status IN ('DRAFT', 'ACTIVE')
  FOR UPDATE OF invitation;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.vendor_organization_memberships AS membership
  SET role_template_id = invitation_record.role_template_id,
      status = 'ACTIVE',
      joined_at = COALESCE(membership.joined_at, now()),
      removed_at = NULL,
      updated_by = target_user_id,
      updated_at = now(),
      version = membership.version + 1
  WHERE membership.vendor_organization_id = invitation_record.vendor_organization_id
    AND membership.user_id = target_user_id
  RETURNING membership.* INTO membership_record;

  IF NOT FOUND THEN
    INSERT INTO public.vendor_organization_memberships (
      id, vendor_organization_id, user_id, role_template_id, status, joined_at,
      created_by, updated_by, created_at, updated_at, version
    ) VALUES (
      gen_random_uuid(), invitation_record.vendor_organization_id, target_user_id,
      invitation_record.role_template_id, 'ACTIVE', now(), invitation_record.created_by,
      target_user_id, now(), now(), 1
    )
    RETURNING * INTO membership_record;
  END IF;

  UPDATE public.vendor_organization_invitations AS invitation
  SET status = 'ACCEPTED', accepted_by = target_user_id, accepted_at = now(),
      token_hash = encode(digest(invitation.token_hash || ':used:' || gen_random_uuid()::text, 'sha256'), 'hex'),
      updated_at = now(), version = invitation.version + 1
  WHERE invitation.id = invitation_record.id;

  RETURN QUERY SELECT invitation_record.id, invitation_record.vendor_organization_id, membership_record.id;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_accept_vendor_invitation(char(64), uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_accept_vendor_invitation(char(64), uuid) TO weddingos_app;
