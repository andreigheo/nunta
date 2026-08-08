-- Resolve only the signer record owned by the authenticated user. This
-- security-definer function is intentionally narrow so a vendor signer can
-- enter a shared envelope without receiving workspace membership or relying
-- on a caller-supplied tenant identifier.
CREATE OR REPLACE FUNCTION public.weddingos_resolve_signature_signer_context(
  target_envelope_id uuid,
  target_user_id uuid
)
RETURNS TABLE (
  workspace_id uuid,
  vendor_organization_id uuid,
  envelope_id uuid,
  signer_id uuid,
  party_type "ContractPartyType"
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT
    signer.workspace_id,
    signer.vendor_organization_id,
    signer.envelope_id,
    signer.id,
    signer.party_type
  FROM public.electronic_signature_signers signer
  JOIN public.electronic_signature_envelopes envelope
    ON envelope.id = signer.envelope_id
  WHERE signer.envelope_id = target_envelope_id
    AND signer.user_id = target_user_id
    AND envelope.status IN ('SENT', 'VIEWED', 'PARTIALLY_SIGNED')
    AND (envelope.expires_at IS NULL OR envelope.expires_at > now())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.weddingos_resolve_signature_signer_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_signature_signer_context(uuid, uuid) TO weddingos_app;
