# ADR 0066: Executable retention and deletion

Status: accepted

Retention and deletion are durable, bounded worker executions, never arbitrary SQL requested by a client. A closed code registry maps allowed entity families to candidate, hold/shared-data, archive/purge/anonymize and tombstone behavior. Dry-run and execute share the same candidate planner; dry-run performs no mutation. Execute requires capability, recent purpose-bound step-up, policy version, reason, confirmation and idempotency. Active legal holds block every destructive handler. User, workspace and vendor deletion use durable plans and the versioned shared-data matrix so contractual, financial and audit evidence is retained only as policy requires and private serializers lose access immediately.
