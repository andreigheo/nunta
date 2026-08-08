# ADR 0050 — Platform admin and support boundaries

Status: Accepted — 2026-07-21

## Context

Workspace and vendor roles are tenant roles. Existing `PlatformCapabilityGrant` rows from Slice 7 protect a small trust and finance surface, but they do not model platform duties, grant provenance, support work or sensitive-action evidence.

## Decision

- Platform access is independent from workspace and vendor membership.
- `PlatformRole` is a named capability bundle. `PlatformGrant` links a user to one role, has an environment, validity interval, grant/revoke actor and version. No ordinary registration receives a platform grant.
- Roles are `PLATFORM_SUPER_ADMIN`, `PLATFORM_OPERATIONS`, `PLATFORM_SUPPORT`, `PLATFORM_TRUST_SAFETY`, `PLATFORM_FINANCE`, `PLATFORM_SECURITY` and `PLATFORM_READ_ONLY`.
- Authorization evaluates explicit active capabilities. There is no implicit wildcard; the super-admin role stores the complete reviewed capability set.
- Sensitive actions require an active session, a reason, recent authentication, the relevant capability, `If-Match` where state is versioned and `Idempotency-Key` where an effect can be replayed.
- Critical production roles require verified MFA. Until a real MFA enrollment flow is enabled, production refuses those actions; local/test grants may carry an explicit test-only MFA assertion.
- `PlatformAdminAction` is append-only operational evidence containing actor, capability, target, redacted before/after, reason, request/correlation context and outcome.
- Support is case-based. Private notes never appear in user serializers. Support views are read-only, redacted and do not impersonate a user.
- Suspending a user revokes sessions and blocks authentication without deleting data. Suspending a workspace or vendor blocks normal/public access without changing financial ledgers or audit history.

## Consequences

Platform operations fail closed without persisted grants. Existing Slice 7 capability rows remain compatible during migration, then are represented by explicit platform roles and grants.
