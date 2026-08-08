ALTER TABLE "online_payment_checkouts"
  ADD COLUMN "hosted_url" varchar(2048);

CREATE UNIQUE INDEX "document_versions_stored_object_id_key"
  ON "document_versions"("stored_object_id");

-- A grantee may read object metadata only through an accessible document
-- version. Mutations remain restricted to the owning tenant.
CREATE POLICY "stored_objects_shared_read" ON "stored_objects"
FOR SELECT TO weddingos_app
USING (
  EXISTS (
    SELECT 1
    FROM "document_versions" version_row
    WHERE version_row.stored_object_id = stored_objects.id
      AND public.weddingos_can_read_document(version_row.document_id)
  )
);
