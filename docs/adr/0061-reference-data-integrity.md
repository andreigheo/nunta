# ADR 0061: Database identity and reference-data integrity

Status: accepted

Every database contains a persisted environment, purpose and instance UUID. Destructive test, purge and restore operations assert this identity before mutation; a database name alone is insufficient. Integration and E2E use separate databases and Redis namespaces. Required reference data has stable keys, a deterministic manifest and explicit verify/repair commands. Repair adds only demonstrated missing system records, is audited, idempotent and never automatic in production. Application/worker roles cannot truncate or delete protected reference tables.
