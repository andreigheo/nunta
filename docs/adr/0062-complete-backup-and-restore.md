# ADR 0062: Complete backup and isolated restore

Status: accepted

A complete backup contains a PostgreSQL custom dump, object inventory and objects, migration/reference/legal/retention/release manifests and checksums in an encrypted versioned envelope. The local proof writes to a separate MinIO destination with separate credentials and volume; this simulates but does not claim real off-host storage. Restore requires `restore-target` database identity and isolated object credentials, then validates migrations, RLS, reference data, representative records and object checksums before approval.
