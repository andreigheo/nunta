-- Parsing retries replace the preview rows atomically. DELETE remains scoped
-- by the persisted worker execution RLS policy installed in the Slice 3
-- security migration.
GRANT DELETE ON TABLE "guest_import_rows" TO weddingos_worker;
