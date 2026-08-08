# ADR 0003: Workspace tenancy and isolation

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 1 workspaces and tenant-scoped access

## Context

Users may belong to multiple wedding workspaces. URL identifiers are untrusted input. The acceptance criteria require both application-level scoping and a database-level isolation mechanism, plus proof that membership revocation takes effect immediately.

## Decision

`Workspace` is the tenant root. `WeddingProfile`, `WorkspaceMembership`, `MembershipCapabilityOverride`, `TeamInvitation`, tenant audit events, and tenant-scoped idempotency records carry `workspaceId`. Mutable records carry UUID identifiers, timestamps, and a version; relevant records carry actor and soft-deletion fields.

Every tenant request follows this sequence:

1. Authenticate the global session.
2. Load an active membership for `(userId, workspaceId)`.
3. Resolve capabilities from the role template plus membership overrides.
4. Execute the tenant query with an explicit `workspaceId` predicate.
5. For RLS-covered operations, run inside a transaction that calls `set_config('app.current_workspace_id', workspaceId, true)` before the query.

PostgreSQL migrations create a non-superuser `weddingos_app` role without `BYPASSRLS`, enable and force RLS on tenant tables, and define policies against `current_setting('app.current_workspace_id', true)`. Local Compose creates both the migration owner and restricted application role. Prisma migration administration uses the owner URL; application requests use the restricted URL.

Connection-pool safety is achieved by transaction-local `set_config(..., true)`. Tenant context is never set at session scope. Background/admin operations require explicit code paths and database policies rather than bypassing RLS.

Workspace creation is one database transaction containing:

- workspace;
- wedding profile;
- active owner membership with the `couple_owner` template;
- missing default user and notification preferences;
- audit event;
- idempotency result.

`Idempotency-Key` is required for workspace creation and is unique per authenticated actor, operation, and key. A reused key with a different request fingerprint is rejected.

## Consequences

- Application bugs have a second containment layer in PostgreSQL.
- Test setup must run migrations with the owner and exercise the API with the restricted database role.
- Tenant work must be transaction-scoped; repository helpers make this the default path.
- Cross-workspace reporting is intentionally outside Slice 1.

## Required isolation proof

Integration/security tests create two users and two workspaces, then prove list/read/write/invite isolation, invitation email binding, immediate membership-revocation enforcement, and RLS rejection when the database tenant context is missing or wrong.
