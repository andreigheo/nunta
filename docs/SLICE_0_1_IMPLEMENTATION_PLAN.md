# Slice 0 + Slice 1 implementation plan

Date: 2026-07-18

## Baseline evidence

- Repository: one Next.js 16.2.10 application in the root; no backend, database, Docker, CI, or API tests.
- Frontend: 96 source files and 50 `page.tsx` routes.
- Baseline validation: ESLint passed, TypeScript passed, production build passed, and all 50 routes returned HTTP 200 from the isolated production server on `127.0.0.1:43218`.
- Data boundary: six files in `src/lib/data`; 30 source files import demo data directly.
- Service boundary: `src/lib/services/index.ts` exposes five mock service implementations for tasks, guests, budget, vendors, and operations.
- Slice 1 mock surfaces: all ten auth routes, the app shell, workspace switcher, Team, Settings profile/notifications/security, and onboarding currently contain hard-coded state, timers, or static seed data.

## Scope boundary

Only repository/backend foundation and authentication, sessions, workspaces, memberships, team invitations, capabilities, preferences, audit, and their existing frontend surfaces are implemented. Planning, guests, vendors, finance, contracts, invitations editor, AI, billing, and all other future modules retain their current demo data and are not given backend persistence in this slice.

## Repository change

### Files moved

None. Keeping the web app at the root is the lowest-risk path and is recorded in ADR 0001.

### Main files and directories created

```text
apps/api/**
packages/contracts/**
packages/database/**
packages/config/**
tests/e2e/**
docs/adr/0001-backend-architecture.md
docs/adr/0002-auth-session-model.md
docs/adr/0003-workspace-tenancy.md
docs/adr/0004-authorization-capabilities.md
pnpm-workspace.yaml
docker-compose.yml
.env.example
.github/workflows/ci.yml
```

The existing auth pages, app layout, sidebar workspace switcher, Team page, Settings page, onboarding completion, API operation registry, README, root package metadata, and relevant TypeScript/tooling files are updated in place without changing the design system.

## Slice 0/1 data model

- `User`: normalized email, verification/account state, terms/marketing metadata.
- `UserProfile`: first name, last name, avatar metadata.
- `Identity`: provider identity and Argon2id password hash.
- `Session`: hashed opaque token, remember policy, expiry, revocation, device/IP metadata.
- `AuthOneTimeToken`: hashed verification/reset/magic/MFA tokens, purpose, expiry, one-time state.
- `Workspace`: title, locale, timezone, currency, status.
- `WeddingProfile`: partner names, date, location/image placeholders.
- `WorkspaceMembership`: user, workspace, role template, active state.
- `RoleTemplate`: stable role key and default capabilities.
- `MembershipCapabilityOverride`: per-membership capability allow/deny.
- `TeamInvitation`: target email, role, overrides, hashed token, expiry/status/actor.
- `UserPreference`: locale, timezone, theme, last active workspace.
- `NotificationPreference`: security/product/marketing channels.
- `AuditEvent`: actor, workspace, action, target, redacted metadata, request/correlation IDs.
- `IdempotencyRecord`: actor/workspace operation key, request hash, stored response.

## API contract inventory

Infrastructure:

- `GET /health`
- `GET /ready`
- `GET /docs`, `GET /docs-json`

Authentication and current user:

- `POST /api/v1/auth/registrations`
- `POST /api/v1/auth/email-verification-requests`
- `POST /api/v1/auth/email-verifications`
- `POST /api/v1/auth/sessions`
- `DELETE /api/v1/auth/session`
- `POST /api/v1/auth/password-reset-requests`
- `POST /api/v1/auth/password-resets`
- `POST /api/v1/auth/magic-link-requests`
- `POST /api/v1/auth/magic-link-exchanges`
- `GET /api/v1/me`
- `PATCH /api/v1/me`
- `GET /api/v1/me/sessions`
- `DELETE /api/v1/me/sessions/:sessionId`
- `GET /api/v1/me/preferences`
- `PATCH /api/v1/me/preferences`
- `GET /api/v1/me/notification-preferences`
- `PATCH /api/v1/me/notification-preferences`
- `POST /api/v1/me/mfa-challenges`
- `POST /api/v1/me/mfa-verifications`

Workspaces and team:

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces` with `Idempotency-Key`
- `GET /api/v1/workspaces/:workspaceId/bootstrap`
- `PATCH /api/v1/workspaces/:workspaceId`
- `GET /api/v1/workspaces/:workspaceId/members`
- `POST /api/v1/workspaces/:workspaceId/team-invitations`
- `GET /api/v1/team-invitations/:token`
- `POST /api/v1/team-invitations/:token/accept`
- `POST /api/v1/team-invitations/:token/decline`
- `POST /api/v1/workspaces/:workspaceId/team-invitations/:invitationId/resend`
- `DELETE /api/v1/workspaces/:workspaceId/team-invitations/:invitationId`
- `PATCH /api/v1/workspaces/:workspaceId/members/:memberId`
- `DELETE /api/v1/workspaces/:workspaceId/members/:memberId`

All resource DTOs, problem codes, role keys, and capabilities live in `@weddingos/contracts`. Public operations do not require a tenant. Tenant operations require an authenticated session, active membership, and declared capability.

## Exact implementation order

1. Pin pnpm, create workspace metadata, shared TypeScript/format/test configuration, root scripts, and CI.
2. Add strict shared environment schemas and examples.
3. Build shared Zod contracts, response/problem helpers, capabilities, roles, and common date/money conventions.
4. Add the Prisma schema, real migration, seed role templates, restricted database role, RLS policies, and tenant transaction helper.
5. Bootstrap NestJS with request/correlation IDs, structured redacted logging, validation, problem responses, CORS/origin controls, rate limiting, OpenAPI, health, and readiness.
6. Implement email adapter and local Mailpit templates.
7. Implement registration, verification, sessions, logout, current user, session revocation, reset, magic link flag/flow, and MFA foundation with audit events.
8. Implement atomic/idempotent workspace creation, list, bootstrap, and settings update.
9. Implement capability resolution, guards, membership listing/mutation, invitation lifecycle, and owner invariants.
10. Add unit, API integration, security/RLS, and cross-application E2E tests.
11. Replace only Slice 1 frontend mocks with one typed API client and auth/workspace providers; add server-side shell protection; wire auth, onboarding, switcher, Team, Settings, logout, and sessions while preserving markup and styling.
12. Reconcile only Slice 0/1 entries in the API registry and add semantic event state.
13. Start PostgreSQL and Mailpit, run migrations/seed, start API and web, execute `pnpm verify`, integration/security tests, the five required E2E journeys, production build, and real route/browser smoke.

## Risks and controls

- **Mounted Windows filesystem and package-manager drift:** pin a Node-compatible pnpm version, use Linux Node explicitly, and keep temporary/cache paths in Linux when needed.
- **Large frontend mock surface:** change only Slice 1 consumers; keep future-module demos intact and clearly separated.
- **Cookie/CORS mismatch across local ports:** use an explicit `WEB_URL`, credentials, `SameSite=Lax`, and origin tests.
- **Pooled-connection tenant leakage:** set RLS context transaction-locally and test missing/wrong context.
- **Email-dependent E2E:** read real messages from Mailpit's API and exchange emitted tokens; do not inject raw database tokens into browser flows.
- **Last-owner races:** perform count/check/mutation in a transaction and cover concurrent/invariant behavior.
- **Native password-hash dependencies:** use a maintained Argon2id package with Node 22 support and verify it inside the API container.

## Completion gate

The slice is complete only after the Compose PostgreSQL instance starts, migrations and role seed succeed, API readiness proves database connectivity, auth/team UI no longer simulates success, tenant isolation and revocation tests pass, the five required E2E journeys execute, and format/lint/typecheck/unit/integration/build all pass. Any skipped or failed item is reported explicitly.
