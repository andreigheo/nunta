CREATE OR REPLACE FUNCTION public.weddingos_reference_data_healthy()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM platform_roles WHERE system = true) >= 7
    AND (SELECT count(*) FROM legal_documents) >= 6
    AND (SELECT count(*) FROM legal_document_versions WHERE status = 'PUBLISHED') >= 6
    AND (SELECT count(*) FROM consent_purposes WHERE active = true) >= 4
    AND (SELECT count(*) FROM data_retention_policies WHERE active = true) >= 40
    AND (SELECT count(*) FROM data_retention_rules WHERE active = true) >= 40
    AND (
      SELECT count(*) FROM platform_feature_flags
      WHERE key = 'system.maintenance_mode'
    ) >= 4;
$$;

REVOKE ALL ON FUNCTION public.weddingos_reference_data_healthy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_reference_data_healthy() TO weddingos_app, weddingos_worker;
