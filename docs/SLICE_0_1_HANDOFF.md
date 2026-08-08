# WeddingOS Slice 0/1 — final handoff and Slice 2 readiness

**Audit date:** 2026-07-18  
**Repository path:** `/mnt/c/home/andrei/test kimi/weddingos`  
**Scope:** implemented Slice 0/1 foundation only. No Slice 2 product module was implemented during this handoff.  
**Verdict:** **READY WITH CONDITIONS**

## 1. Executive conclusion

The Slice 0/1 authentication, tenancy, workspace, team, preference, audit, and local-runtime foundation is functional. A clean `pnpm verify` passed, five browser E2E scenarios passed against real PostgreSQL and Mailpit, all seven Prisma migrations are applied, and the application role is demonstrably subject to forced row-level security.

The foundation is suitable for beginning Slice 2A infrastructure work, but it is not an unconditional handoff. The following conditions must be addressed in or before Slice 2A:

1. **Restore valid Git provenance.** This directory is not a valid Git worktree. Branch, commit, tracked changes, and untracked changes cannot be established factually.
2. **Add the transactional outbox before relying on e-mail or background side effects.** Several current writes commit before SMTP; an SMTP failure can therefore return an error after state has already changed.
3. **Add an explicit worker/application database-context contract and a dedicated pooled-connection reuse test.** Current request transactions are RLS-safe, but future worker/admin access has no separate role or tested context lifecycle.
4. **Generate real OpenAPI request/response schemas.** Runtime paths are accurate, but controllers accept `unknown` bodies and the generated document has zero component schemas.
5. **Harden frontend error and demo boundaries.** Central handling exists for `401`, but not for `403`/`409`; demo mode follows UI conventions rather than a central API deny rule.
6. **Remove global false actions before product Slice 2 UI is considered real.** Quick Create, notifications, Copilot, navigation counters, non-persisted onboarding fields, and two Settings actions still simulate success.

## 2. Final verification

### 2.1 Clean verification result

The two persistent systemd application services were stopped before running `pnpm verify`; database and SMTP dependencies remained the real Docker services required by integration tests. The command exited with code `0`.

| Category          |  Passed | Failed | Skipped | Evidence/result                                                           |
| ----------------- | ------: | -----: | ------: | ------------------------------------------------------------------------- |
| Format            | 1 stage |      0 |       0 | Prettier check completed successfully                                     |
| Lint              | 1 stage |      0 |       0 | frontend, API, and packages lint completed successfully                   |
| Typecheck         | 1 stage |      0 |       0 | root, API, and packages typecheck completed successfully                  |
| Unit tests        |      11 |      0 |       0 | `apps/api/test/foundation.spec.ts`                                        |
| Integration tests |      11 |      0 |       0 | real PostgreSQL and Mailpit; `apps/api/test/slice-1.integration-spec.ts`  |
| E2E tests         |       5 |      0 |       0 | Chromium; real PostgreSQL and Mailpit; `tests/e2e/slice-1.spec.ts`        |
| Production build  | 1 stage |      0 |       0 | Nest build plus Next.js production build; 52 application routes generated |
| Route smoke       |      50 |      0 |       0 | production server at `http://127.0.0.1:43191`                             |

E2E scenarios covered:

1. owner registration, delivered verification e-mail, sign-in, workspace creation, and protected shell;
2. team invitation delivery and partner acceptance;
3. removed partner retains the user account but immediately loses workspace access;
4. URL and write manipulation are rejected across two users and two workspaces;
5. two sessions can be listed and one owned session can be revoked with immediate denial.

After the five passing tests, the disposable Next.js **development** web server logged one `ChunkLoadError` while Playwright was shutting it down. It did not fail a test and is not used by the persistent production service. The production build and final production route/browser checks passed separately.

### 2.2 Test gaps

- No dedicated test pins one physical pooled PostgreSQL connection, runs two different tenant contexts sequentially on it, and asserts that transaction-local settings do not leak.
- Magic-link request/exchange is unit covered only at helper/operation level, not in the real integration or browser suites.
- Profile, user-preference, and notification-preference endpoints are not directly asserted by the integration suite; preference behavior is exercised indirectly by browser flows.
- `403` and optimistic-lock `409` UI routing are not covered as central frontend behaviors.
- SMTP failure semantics and retry/outbox behavior are not automated because no outbox exists yet.

## 3. Repository and Git state

| Item                              | Result                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| Branch                            | **Unavailable** — no valid Git repository                            |
| Commit                            | **Unavailable** — no valid Git repository                            |
| `git status`                      | `fatal: not a git repository (or any parent up to mount point /mnt)` |
| Committed/uncommitted distinction | Cannot be determined without Git metadata                            |
| Tracked/untracked distinction     | Cannot be determined without Git metadata                            |
| Push/commit performed             | No                                                                   |

The parent path `/mnt/c/home/andrei/test kimi/.git` exists as an empty directory and is not a usable repository. This audit did **not** initialize Git, create a commit, or push anything.

Files intentionally created or reconciled by this handoff are:

- `docs/SLICE_0_1_HANDOFF.md`;
- `docs/API_OPERATION_REGISTRY.json`;
- `docs/FRONTEND_INVENTORY.json`;
- `docs/BACKEND_ENTITY_CATALOG.json`;
- `docs/PERMISSION_MATRIX.csv`;
- `scripts/reconcile-api-registry.mjs`;
- `scripts/reconcile-handoff-registries.mjs`.

Repository hygiene observations:

- `.env`, `.env.local`, `.env.*.local`, `node_modules`, `.next`, `dist`, `coverage`, logs, Playwright output, test results, and generated Prisma client output are ignored.
- Only `.env.example` is present; no repository `.env` or `.env.local` was found.
- PostgreSQL data is in the named Docker volume `weddingos_weddingos-postgres`, not in the repository.
- No committed-status claim can be made for any file until Git metadata is restored.
- `package-lock.json` coexists with the authoritative `pnpm-lock.yaml`; remove the npm lock only after Git is restored and provenance is reviewed.
- `tsconfig.tsbuildinfo` exists and is not currently covered by `.gitignore`; add `*.tsbuildinfo` before the first trustworthy commit.
- `test-results/` exists but is ignored. It is disposable test output.

## 4. Real project structure

| Path                 | Responsibility                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api`           | NestJS HTTP API, auth, user, workspace, team, audit, e-mail, RLS context, health, and tests  |
| `packages/contracts` | Shared Zod schemas, request/response types, capabilities, enums, and semantic event names    |
| `packages/database`  | Prisma schema/client, migrations, and seed data                                              |
| `packages/config`    | Typed and validated API environment configuration                                            |
| `tests/e2e`          | Real browser acceptance tests through frontend, API, PostgreSQL, and Mailpit                 |
| `ops`                | Persistent user-systemd service definitions and local runtime operations                     |
| `docs`               | Architecture records, implementation plan, audit registries, and this handoff                |
| `src`                | Root Next.js frontend, application shell, pages, API client, demo data, and future-module UI |

The frontend remains in the repository root. This is a deliberate low-risk structure: the pnpm workspace already isolates the API and shared packages, so Slice 2 can proceed without an immediate move to `apps/web`. A frontend relocation should occur only if an independent deployment boundary later justifies its cost.

## 5. Implemented NestJS inventory

Only modules present in `apps/api/src/app.module.ts` are classified as implemented.

| Module                                                      | Purpose and implementation                                                                                                                     | DB/entities                                                                                                              | Routes/capabilities                                                                                    | Events and test coverage                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `EnvironmentModule`                                         | Loads and validates `ApiEnvironment`; global provider, no controller/service route                                                             | none                                                                                                                     | none                                                                                                   | production-config and feature-flag unit tests                                           |
| `DatabaseModule`                                            | Global `DatabaseService`; Prisma connect/disconnect and transaction-local RLS context                                                          | all implemented models                                                                                                   | internal only                                                                                          | exercised by every integration/E2E DB flow                                              |
| `AuditModule`                                               | `AuditService`; append-only semantic audit writes through direct or contextual Prisma transaction                                              | `AuditEvent`                                                                                                             | internal only                                                                                          | invitation, membership, workspace, session, and auth events in integration paths        |
| `EmailModule`                                               | SMTP/console provider and five active templates                                                                                                | no direct entity; receives committed token/invitation/user data                                                          | internal only                                                                                          | real Mailpit integration/E2E delivery paths                                             |
| `HealthModule`                                              | liveness and database readiness                                                                                                                | Prisma connectivity                                                                                                      | `GET /health`, `GET /ready`; public                                                                    | production/manual health checks                                                         |
| `AuthModule`                                                | registration, verification, password session, logout, reset, magic link; `AuthController`, `AuthService`, `SessionService`, `SessionAuthGuard` | `User`, `UserProfile`, `Identity`, `Session`, `AuthOneTimeToken`, preferences, `AuditEvent`                              | public auth operations plus authenticated logout                                                       | auth/session semantic events; unit, integration, and E2E as detailed in endpoint table  |
| `UsersModule`                                               | current profile, user preferences, notification preferences, session inventory/revocation; `UsersController`, `UsersService`                   | `User`, `UserProfile`, `Session`, `UserPreference`, `NotificationPreference`, `AuditEvent`                               | authenticated user-owned routes                                                                        | profile/preference/session events; session integration/E2E, preference browser coverage |
| `WorkspacesModule`                                          | workspace list/create/update/bootstrap, capability guard and membership resolution; `WorkspacesController`, `WorkspacesService`                | `Workspace`, `WeddingProfile`, `WorkspaceMembership`, `RoleTemplate`, overrides, `IdempotencyRecord`, preferences, audit | `workspace.read`, `workspace.update`, or authenticated create/list                                     | `workspace.created.v1`, `workspace.updated.v1`; integration and E2E                     |
| `TeamModule`                                                | membership list and full invitation/member lifecycle; `TeamController`, `TeamService`                                                          | workspace, profile, membership, roles, overrides, invitation, user, audit                                                | `team.read`, `team.invite`, `team.update_role`, `team.remove`; target-email binding for accept/decline | invitation/membership events; unit, integration, and E2E                                |
| `ThrottlerModule` plus common middleware/filter/interceptor | global 120/min guard, origin check, request/correlation IDs, structured logs, RFC-style problems                                               | none                                                                                                                     | cross-cutting                                                                                          | rate-limit integration test and all HTTP suites                                         |

There is no implemented planning, task, calendar, timeline, budget, guest, RSVP, marketplace, AI planner, worker, Redis, BullMQ, outbox, notification inbox, activity projection, or dashboard read-model backend module.

## 6. Endpoint inventory

Runtime prefix is `/api/v1`. Health endpoints are operational infrastructure and are listed separately from the 30 Slice 0/1 operations.

### 6.1 ACTIVE — 30

| Operation ID                      | Method and route                                                             | Authentication / capability              | Request DTO                                                           | Response DTO                                    | Tests                  |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- | ---------------------- |
| `AUTH.REGISTER`                   | `POST /api/v1/auth/registrations`                                            | public                                   | first/last name, e-mail, password, accepted terms, optional marketing | `RegisterResponse`                              | U/I/E2E                |
| `AUTH.SESSION_CREATE`             | `POST /api/v1/auth/sessions`                                                 | public                                   | e-mail, password, remember                                            | `SessionCreated`; token only in HttpOnly cookie | I/E2E                  |
| `AUTH.SESSION_DELETE`             | `DELETE /api/v1/auth/session`                                                | authenticated                            | none                                                                  | `204 NoContent`                                 | I                      |
| `AUTH.ME_GET`                     | `GET /api/v1/me`                                                             | authenticated                            | none                                                                  | `CurrentUserResponse`                           | I/E2E                  |
| `AUTH.MAGIC_LINK_REQUEST`         | `POST /api/v1/auth/magic-link-requests`                                      | public                                   | e-mail                                                                | neutral accepted response                       | implementation only    |
| `AUTH.MAGIC_LINK_EXCHANGE`        | `POST /api/v1/auth/magic-link-exchanges`                                     | public                                   | token                                                                 | `SessionCreated`; cookie                        | U                      |
| `AUTH.EMAIL_VERIFICATION_REQUEST` | `POST /api/v1/auth/email-verification-requests`                              | public                                   | e-mail                                                                | neutral accepted response                       | implementation only    |
| `AUTH.EMAIL_VERIFY`               | `POST /api/v1/auth/email-verifications`                                      | public                                   | token, or e-mail + six-digit code                                     | verification result                             | U/I/E2E                |
| `AUTH.PASSWORD_RESET_REQUEST`     | `POST /api/v1/auth/password-reset-requests`                                  | public                                   | e-mail                                                                | neutral accepted response                       | I                      |
| `AUTH.PASSWORD_RESET`             | `POST /api/v1/auth/password-resets`                                          | public                                   | token, new password                                                   | reset result                                    | U/I                    |
| `AUTH.SESSION_LIST`               | `GET /api/v1/me/sessions`                                                    | authenticated                            | none                                                                  | `SessionSummary[]`                              | I/E2E                  |
| `AUTH.SESSION_REVOKE`             | `DELETE /api/v1/me/sessions/:sessionId`                                      | authenticated, owns session              | path UUID                                                             | `204 NoContent`                                 | I/E2E                  |
| `AUTH.ME_UPDATE`                  | `PATCH /api/v1/me`                                                           | authenticated                            | first name, last name                                                 | user-profile response                           | implementation/browser |
| `AUTH.PREFERENCES_GET`            | `GET /api/v1/me/preferences`                                                 | authenticated                            | none                                                                  | user preference                                 | implementation/browser |
| `AUTH.PREFERENCES_UPDATE`         | `PATCH /api/v1/me/preferences`                                               | authenticated                            | locale/timezone/theme/last workspace, partial                         | user preference                                 | implementation/browser |
| `WORKSPACE.LIST`                  | `GET /api/v1/workspaces`                                                     | authenticated                            | none                                                                  | `WorkspaceSummary[]`                            | I/E2E                  |
| `WORKSPACE.CREATE`                | `POST /api/v1/workspaces`                                                    | authenticated; `Idempotency-Key`         | title, partners, date, location, locale/timezone/currency             | workspace summary                               | I/E2E                  |
| `WORKSPACE.UPDATE`                | `PATCH /api/v1/workspaces/:workspaceId`                                      | `workspace.update`                       | partial fields + version                                              | workspace update response                       | I/E2E                  |
| `TEAM.MEMBER_LIST`                | `GET /api/v1/workspaces/:workspaceId/members`                                | `team.read`                              | path UUID                                                             | team list                                       | I/E2E                  |
| `TEAM.INVITATION_CREATE`          | `POST /api/v1/workspaces/:workspaceId/team-invitations`                      | `team.invite`                            | e-mail, role template, overrides                                      | team invitation                                 | U/I/E2E                |
| `TEAM.INVITATION_GET`             | `GET /api/v1/team-invitations/:token`                                        | public token                             | token path                                                            | public invitation                               | U/I/E2E                |
| `TEAM.INVITATION_ACCEPT`          | `POST /api/v1/team-invitations/:token/accept`                                | authenticated; session e-mail must match | token path                                                            | workspace/membership IDs                        | U/I/E2E                |
| `TEAM.INVITATION_DECLINE`         | `POST /api/v1/team-invitations/:token/decline`                               | authenticated; session e-mail must match | token path                                                            | decline result                                  | U/I                    |
| `TEAM.INVITATION_RESEND`          | `POST /api/v1/workspaces/:workspaceId/team-invitations/:invitationId/resend` | `team.invite`                            | path UUIDs                                                            | rotated invitation                              | U/I                    |
| `TEAM.INVITATION_REVOKE`          | `DELETE /api/v1/workspaces/:workspaceId/team-invitations/:invitationId`      | `team.invite`                            | path UUIDs                                                            | `204 NoContent`                                 | U/I                    |
| `TEAM.MEMBER_UPDATE`              | `PATCH /api/v1/workspaces/:workspaceId/members/:memberId`                    | `team.update_role`                       | role/overrides + version                                              | team member                                     | U/I                    |
| `TEAM.MEMBER_REMOVE`              | `DELETE /api/v1/workspaces/:workspaceId/members/:memberId`                   | `team.remove`                            | path UUIDs                                                            | `204 NoContent`                                 | U/I/E2E                |
| `SHELL.BOOTSTRAP_GET`             | `GET /api/v1/workspaces/:workspaceId/bootstrap`                              | `workspace.read`                         | path UUID                                                             | workspace bootstrap                             | I/E2E                  |
| `NOTIFICATION.PREFERENCES_GET`    | `GET /api/v1/me/notification-preferences`                                    | authenticated                            | none                                                                  | notification preference                         | implementation/browser |
| `NOTIFICATION.PREFERENCES_UPDATE` | `PATCH /api/v1/me/notification-preferences`                                  | authenticated                            | category booleans, partial                                            | notification preference                         | implementation/browser |

`U` = unit, `I` = real integration, `E2E` = real browser acceptance. `implementation/browser` means the UI calls the real endpoint, but no focused assertion currently protects the operation.

Infrastructure routes: `GET /health` and `GET /ready`.

### 6.2 FEATURE_FLAGGED — 2

| Operation ID                | Method and route                    | Runtime behavior                                            | Tests                                        |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `AUTH.MFA_CHALLENGE_CREATE` | `POST /api/v1/me/mfa-challenges`    | `FEATURE_MFA_ENABLED=false`; returns `501 FEATURE_DISABLED` | feature-flag parsing unit test, no flow test |
| `AUTH.MFA_VERIFY`           | `POST /api/v1/me/mfa-verifications` | `FEATURE_MFA_ENABLED=false`; returns `501 FEATURE_DISABLED` | feature-flag parsing unit test, no flow test |

### 6.3 PLANNED — 21, not implemented

| Group               | Planned operation IDs and routes                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Workspace lifecycle | `WORKSPACE.GET`, `WORKSPACE.ARCHIVE`, `WORKSPACE.RESTORE`, `WORKSPACE.DELETION_REQUEST` under `/api/v1/workspaces/:workspaceId` |
| Onboarding/jobs     | `ONBOARDING.GET`, `ONBOARDING.UPDATE`, `ONBOARDING.COMPLETE`, `JOB.GET`                                                         |
| Billing             | `BILLING.SUBSCRIPTION_GET`, `BILLING.PORTAL_SESSION_CREATE`, `BILLING.INVOICE_LIST`, `BILLING.INVOICE_ACCESS`                   |
| Shell/search        | `SHELL.DASHBOARD_GET`, `SEARCH.QUERY`                                                                                           |
| Notifications       | `NOTIFICATION.LIST`, `NOTIFICATION.UNREAD_COUNT`, `NOTIFICATION.UPDATE`, `NOTIFICATION.MARK_ALL_READ`, `NOTIFICATION.DELETE`    |
| Activity            | `ACTIVITY.LIST`, `ACTIVITY.EXPORT`                                                                                              |

### 6.4 OpenAPI reconciliation

Live `GET /docs-json` contains 29 paths and 34 HTTP operations:

- 2 infrastructure operations;
- all 30 active Slice 0/1 operations;
- the 2 explicitly feature-flagged MFA operations;
- no future planned workspace/onboarding/billing/dashboard/search/notification/activity operation.

Therefore route exposure matches runtime implementation status. However, the document has `0` component schemas and no concrete request-body schema references because controllers currently parse `unknown` bodies with shared Zod schemas rather than decorated OpenAPI DTO classes. Treat OpenAPI schema generation as a Slice 2A contract-quality condition.

## 7. Database inventory

All 15 models were introduced by `20260717224538_slice_0_1_foundation`; later migrations modify fields or policies as noted below.

| Prisma model / table                                               | Purpose and scope                                           | Relations / important indexes                                                       | Delete lifecycle                                                               | RLS        |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| `User` / `users`                                                   | global account                                              | unique e-mail; owns profile, identities, sessions, tokens, memberships, preferences | status lifecycle; children cascade if hard-deleted                             | no         |
| `UserProfile` / `user_profiles`                                    | global personal profile                                     | unique `user_id`, 1:1 user                                                          | hard cascade with user                                                         | no         |
| `Identity` / `identities`                                          | global password/external identity                           | unique user+provider and provider+subject; lookup index                             | hard cascade with user                                                         | no         |
| `Session` / `sessions`                                             | global authenticated sessions; only token hash stored       | unique token hash; `(user_id, revoked_at, expires_at)`                              | soft revoke/expiry; hard cascade with user                                     | no         |
| `AuthOneTimeToken` / `auth_one_time_tokens`                        | global verification/reset/magic tokens                      | unique token hash; user+purpose+state and code+purpose                              | consumed/revoked/expired lifecycle; hard cascade                               | no         |
| `Workspace` / `workspaces`                                         | tenant root                                                 | creator index; 1:1 wedding profile; memberships/invitations/audit/idempotency       | `status` + `deleted_at` soft lifecycle; cascade children on hard delete        | **forced** |
| `WeddingProfile` / `wedding_profiles`                              | tenant wedding foundation                                   | unique workspace; cascade from workspace                                            | hard cascade                                                                   | **forced** |
| `RoleTemplate` / `role_templates`                                  | global role/capability templates                            | unique key; referenced by membership/invitation                                     | hard delete restricted by references                                           | no         |
| `WorkspaceMembership` / `workspace_memberships`                    | tenant user authorization                                   | unique workspace+user; user/status and workspace/status indexes                     | `status` + `removed_at`; cascade with user/workspace                           | **forced** |
| `MembershipCapabilityOverride` / `membership_capability_overrides` | tenant allow/deny overrides                                 | unique membership+capability; workspace index                                       | hard cascade with membership                                                   | **forced** |
| `TeamInvitation` / `team_invitations`                              | tenant invitation state/token                               | unique token hash; workspace/status and e-mail/status indexes                       | accepted/declined/revoked/expired lifecycle; cascade with workspace            | **forced** |
| `UserPreference` / `user_preferences`                              | global locale/theme/last workspace                          | unique user                                                                         | hard cascade with user                                                         | no         |
| `NotificationPreference` / `notification_preferences`              | global per-category delivery choices                        | unique user                                                                         | hard cascade with user                                                         | no         |
| `AuditEvent` / `audit_events`                                      | optional-tenant append-only audit fact                      | workspace/time and actor/time indexes                                               | application role cannot update/delete/truncate; workspace hard delete cascades | **forced** |
| `IdempotencyRecord` / `idempotency_records`                        | actor/operation idempotent replay, optionally tenant scoped | unique actor+operation+key; expiry index                                            | TTL cleanup/hard cascade with workspace                                        | **forced** |

### 7.1 Migration order

1. `20260717224538_slice_0_1_foundation` — 15 models, roles/grants, initial forced RLS/policies.
2. `20260718023000_notification_categories` — expands notification preference categories.
3. `20260718030000_strengthen_rls` — helper functions and least-privilege tenant policies.
4. `20260718033000_fix_workspace_bootstrap_rls` — safe initial-owner/bootstrap and invitation membership paths.
5. `20260718034000_audit_append_only` — revokes update/delete/truncate for application audit writes.
6. `20260718035000_public_invitation_workspace_rls` — token-scoped public invitation workspace/profile reads.
7. `20260718036000_invitation_decline_audit_rls` — permits the correctly scoped decline audit write.

With both `DATABASE_URL` and `DATABASE_OWNER_URL` supplied, `prisma migrate status` reported: **7 migrations found; database schema is up to date**.

## 8. RLS verification

`DatabaseService.withContext()` in `apps/api/src/common/database.service.ts` opens a Prisma interactive `$transaction`. As the first transaction statement it calls PostgreSQL `set_config` for:

- `app.current_user_id`;
- `app.current_workspace_id`;
- `app.current_bootstrap_workspace_id`;
- `app.current_invitation_token_hash`.

The third argument is `true`, which makes each value transaction-local—the SQL equivalent of `SET LOCAL`. All scoped repository calls run through the callback's transaction client. Commit/rollback ends the transaction and clears the settings before the pooled connection can be reused.

Runtime database identities were queried directly:

| Role            | Purpose                                               | Superuser | BYPASSRLS |
| --------------- | ----------------------------------------------------- | --------: | --------: |
| `weddingos_app` | persistent API query role from `DATABASE_URL`         |        no |        no |
| `weddingos`     | owner/direct migration role from `DATABASE_OWNER_URL` |       yes |       yes |

Forced RLS is enabled on exactly seven tenant-sensitive tables: `workspaces`, `wedding_profiles`, `workspace_memberships`, `membership_capability_overrides`, `team_invitations`, `audit_events`, and `idempotency_records`. Seventeen current policies target only `weddingos_app`.

Relevant evidence:

- context lifecycle: `apps/api/src/common/database.service.ts`;
- role creation/grants and forced RLS: foundation migration and `docker/postgres/init-app-role.sql`;
- final policies: migrations 3–7;
- cross-tenant URL and write rejection: integration test “enforces application and PostgreSQL isolation across two workspaces” and browser E2E 4;
- invitation/bootstrap exceptions: integration invitation lifecycle and browser E2E 1–3.

**Future worker/admin status: PARTIALLY READY.** No dedicated worker DB role, admin elevation role, or worker context wrapper exists. A future worker must never use the owner URL for normal jobs. It should use an RLS-bound application/worker role and explicitly set user/workspace/system context inside each transaction. Administrative operations need narrow, separately audited stored procedures or a purpose-specific role, not the migration owner.

**Pool reuse gap:** current integration requests execute sequentially through Prisma's pool and prove cross-tenant denial, but they do not pin and reuse the same physical connection. Add a dedicated regression test before introducing workers or raw pooled clients.

## 9. Authentication and session behavior

| Concern               | Implemented behavior                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal session        | 1 day                                                                                                                                      |
| Remember-me session   | 30 days                                                                                                                                    |
| Token storage         | 32 random bytes encoded base64url; only SHA-256 hash stored                                                                                |
| Rotation              | token is created once per session; no rolling token rotation during an active session                                                      |
| Activity              | `lastSeenAt` update at most every 5 minutes                                                                                                |
| Revocation            | `revokedAt` is set; current-cookie logout and owned-session revoke are immediate                                                           |
| After password change | token consumed, password hash replaced, **all** unrevoked sessions revoked atomically; security e-mail sent afterward                      |
| Development cookie    | HttpOnly, `Secure=false`, `SameSite=Lax`, `Path=/`, explicit expiry; optional configured domain                                            |
| Production cookie     | HttpOnly, `Secure=true`, `SameSite=Lax`, `Path=/`, explicit expiry; optional configured domain                                             |
| CORS                  | exact configured `WEB_URL`, credentials enabled                                                                                            |
| CSRF                  | SameSite=Lax plus origin rejection on unsafe methods when an `Origin` header is present; no synchronizer token; missing Origin is accepted |
| Verification token    | 30 minutes                                                                                                                                 |
| Password reset token  | 30 minutes                                                                                                                                 |
| Magic link token      | 15 minutes                                                                                                                                 |
| Team invitation       | 7 days                                                                                                                                     |
| Password policy       | 8–128 characters; at least one lowercase, uppercase, and digit                                                                             |
| Argon2                | Argon2id; memory 19,456 KiB, time cost 2, parallelism 1, output 32 bytes                                                                   |

Rate limits per 60 seconds:

- global: 120;
- registration: 20;
- verification request: 3; verification consume: 30;
- session creation: 20;
- password-reset request: 3; reset consume: 5;
- magic-link request: 3; exchange: 8;
- invitation resend: 5.

Verification, reset, and magic-link issuance also have a 60-second per-user cooldown. Invitation resend has the route throttle but no separate per-invitation cooldown.

Public registration, password-reset request, and magic-link request avoid account enumeration. Duplicate registration returns a neutral-looking random registration ID; unknown reset/magic e-mails return the same accepted shape.

## 10. E-mail inventory and failure semantics

Active templates in `apps/api/src/email/email.service.ts`:

1. e-mail verification with link and six-digit code;
2. password reset;
3. magic link;
4. team invitation;
5. security notification for password change or new login.

SMTP is used when `EMAIL_PROVIDER=smtp`; local delivery goes to Mailpit. Console mode records `email.skipped` and returns success without delivery.

| Flow                      | What is already committed if SMTP fails                | Client-visible result                | Retry / partial-state risk                                                           |
| ------------------------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Registration              | user, identity, preferences, verification token        | API error                            | user remains; retry verification after cooldown; partial state exists                |
| Verification resend       | rotated verification token                             | API error                            | retry after 60 seconds; newest token remains authoritative                           |
| Password-reset request    | reset token                                            | API error despite neutral API intent | retry after 60 seconds rotates token; partial state exists                           |
| Magic-link request        | magic token                                            | API error                            | retry after 60 seconds rotates token; partial state exists                           |
| Team invite/create/resend | invitation state/token and audit event                 | API error                            | pending invitation remains; owner can resend; partial state exists                   |
| Password change           | token consumed, password changed, all sessions revoked | API error                            | security e-mail can be retried only operationally; security state is already changed |

Slice 2A must introduce a transactional outbox row written in the same DB transaction as each state change. A persistent worker should deliver, retry with backoff, record attempts, dead-letter exhausted messages, and make delivery idempotent. Until then, SMTP is not transactionally coupled to state.

## 11. Frontend coverage

Production account/workspace/team flows no longer fall back to mock data. All calls use the typed `src/lib/api/client.ts`, include cookies, correlation IDs, no-store caching, and one retry for safe GET/HEAD failures.

| Page/surface               | Real API and state coverage                                                                              | 401 / 403 / 409                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Sign-in                    | session create; loading, inline error, redirect success; magic-link request                              | auth errors inline; no special 403/409                                                            |
| Create account             | registration; submitting, field/general error, verification redirect                                     | public; no special 403/409                                                                        |
| Verify e-mail              | verification and resend; automatic token/code handling, loading/error/success                            | public; no special 403/409                                                                        |
| Forgot password            | neutral reset request; submitting/error/sent state                                                       | public                                                                                            |
| Reset password             | token reset; validation/loading/error then sign-in redirect                                              | public; expired/invalid API error shown                                                           |
| Magic link                 | request on sign-in and token exchange page; loading/error/success redirect                               | public                                                                                            |
| Invitation                 | public invitation read, authenticated accept/decline, last workspace preference update                   | 401 follows auth flow; 403/409 shown as generic error                                             |
| Onboarding foundation      | real idempotent workspace create before generation animation; error stops progress, success enters shell | 401 via protected context; 403/409 generic; guest count/budget/style/priorities are not persisted |
| Protected shell            | parallel `me`, workspace list, preference, then bootstrap; skeleton/loading and session-expired route    | **401 centrally redirects**; 403/409 are not centrally routed                                     |
| Workspace switcher         | persists last workspace and fetches real bootstrap                                                       | 401 central on refresh only; 403/409 may surface as an unhandled/generic error                    |
| Team                       | real list, invite, resend, revoke, role/overrides, remove; spinners, empty/error/success toasts          | 401 central context; 403/409 use generic API message/toast                                        |
| Settings profile/workspace | real profile and optimistic workspace update, refresh, success/error toasts                              | 401 central; 403/409 generic; no conflict-resolution UX                                           |
| Settings preferences       | real user and notification preferences; loading/error/success                                            | 401 central; 403/409 generic                                                                      |
| Session management         | real session list, reset request, owned revoke; loading/error/success                                    | 401 central; no special 403/409                                                                   |

The production branches have no auth, session, workspace, team, membership, connected profile, or connected preference mocks. Demo-specific branches remain intentionally separate.

## 12. Remaining mock inventory

### 12.1 ACCEPTABLE FOR FUTURE MODULES

These sources model Slice 2+ product domains and may remain until their owning slice begins. They must not be described as backend-complete.

| Source file                           | Simulated data / local actions                                                                                       | Main consumers                                                                  | Removal slice                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/lib/data/tasks.ts`               | task records/categories/statuses; local CRUD/filter state                                                            | Plan, Calendar, Overview, task modal/drawer, Quick Create                       | planning/tasks Slice 2                                |
| `src/lib/data/guests.ts`              | guests, households, aggregate RSVP stats; local edit/filter                                                          | Guests, Seating, RSVP, Menus, Overview, Budget, Invitations                     | Guest CRM/RSVP/seating slice                          |
| `src/lib/data/budget.ts`              | categories, expenses, payments, scenarios; local mutations                                                           | Budget, Payments, Calendar, Overview, navigation                                | finance slice                                         |
| `src/lib/data/vendors.ts`             | vendors, offers, bookings, contracts; local selection/mutations                                                      | Marketplace, Offers, Bookings, Contracts, Favorites, Shortlists, Overview       | marketplace/vendor slice                              |
| `src/lib/data/operations.ts`          | risks, notifications, activity; local read/delete/filter                                                             | Risks, Activity, Notifications drawer, Overview, navigation                     | notification/activity/risk slice                      |
| `src/lib/data/wedding.ts`             | demo wedding/workspaces/team, milestones/events                                                                      | Demo context, Team demo, Timeline, Calendar, Overview, Invitations, RSVP, Tools | onboarding/plan/calendar plus demo retention decision |
| `src/lib/services/index.ts`           | six interfaces backed by 120 ms fake latency and in-memory arrays                                                    | future task/guest/budget/vendor/operations abstractions                         | replace per owning slice                              |
| `src/components/plan/task-drawer.tsx` | demo comments, attachments, activity; local mutations and upload toast                                               | Plan task details                                                               | tasks/documents/activity slice                        |
| Page-local seed state                 | contracts, bookings, offers, risks, payments, documents, requests, wedding-day, design-studio and other future pages | respective future module pages                                                  | respective owning slice                               |

The complete consumer set with direct central-data imports is: Plan, Calendar, Overview, Budget, Guests, Seating, RSVP, Invitations, Menus, Timeline, Marketplace/list/detail, Offers, Bookings, Contracts, Favorites, Shortlists, Activity, Risks, Payments, Tools, navigation, notifications, Quick Create, task modal, workspace demo, and Team demo.

### 12.2 MUST BE REMOVED OR HARDENED BEFORE SLICE 2 IS CALLED REAL

| File/surface                                    | Current false or global behavior                                                                            | Required action                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/navigation.ts`                         | global badges/counts derived from mock tasks, guests, offers, payments, risks                               | use dashboard/read-model counters or show neutral no-data states           |
| `src/components/shell/notifications-drawer.tsx` | seeded notifications; local mark-read/delete with success toasts                                            | connect notification list/update/delete or disable clearly                 |
| `src/components/shell/quick-create.tsx`         | timeouts and false success for task, RFQ, campaign, contract/upload                                         | connect only implemented commands; disable future commands without success |
| `src/components/shell/ai-copilot.tsx`           | mock responses/proposals, fake apply/edit/delete, attachment affordance                                     | label as demo-only or wait for proposal/command backend                    |
| `src/app/onboarding/page.tsx`                   | only workspace foundation persists; guest count, budget, style, priorities and inspiration are visual/local | add onboarding draft contract before using these fields for generation     |
| `src/app/(app)/settings/page.tsx`               | “Export prepared” and “Access log clean” are false-success/information toasts                               | connect jobs/activity endpoints or disable as planned                      |
| Demo/API boundary                               | demo cookie chooses static context but API client has no hard deny guard; a real session cookie can coexist | central demo transport prohibition or separate origin/runtime              |
| File affordances                                | future modules expose file inputs/toasts but no upload backend exists                                       | disable or keep explicitly demo-only; never imply secure storage           |

Workspace deletion correctly states that it is unavailable, and billing is explicitly deferred; those are not false successes.

## 13. Demo mode

| Requirement                      | Factual state                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment variable             | `NEXT_PUBLIC_DEMO_MODE_ENABLED`                                                                                                             |
| Default if unset                 | `false` because checks require the literal string `"true"`                                                                                  |
| Current production systemd build | unset, therefore demo entry is disabled                                                                                                     |
| Example development value        | `.env.example` sets `true`                                                                                                                  |
| Badge                            | “Demo local — date izolate, fără sincronizare sau documente reale”                                                                          |
| Reset                            | clears `weddingos_demo`, routes to sign-in, refreshes the app                                                                               |
| Demo cookie                      | non-HttpOnly `weddingos_demo=1`, `Path=/`, `SameSite=Lax`, 8-hour max age                                                                   |
| Real session isolation           | separate cookie name and demo context does not read account data, but a real session cookie can coexist                                     |
| API access                       | UI branches avoid calls while demo cookie is active; **not technically guaranteed** by the shared API client                                |
| Uploads/sensitive data           | no upload endpoint or persistence exists; file inputs/toasts are present in future UI, so selection is possible but no server upload occurs |

The accurate conclusion is: demo data is static and does not intentionally write to the real API, but “cannot access the API” and “cannot select a file” are not yet enforceable security properties. Harden this boundary before exposing demo broadly.

## 14. Persistent local services

| Service        | Address                  | Supervisor / policy                                     | Health                       |
| -------------- | ------------------------ | ------------------------------------------------------- | ---------------------------- |
| Frontend       | `http://127.0.0.1:43191` | `weddingos-web.service`, user systemd, `Restart=always` | HTTP route + browser smoke   |
| API            | `http://127.0.0.1:4000`  | `weddingos-api.service`, user systemd, `Restart=always` | `/health`, `/ready`          |
| PostgreSQL     | `127.0.0.1:54339`        | Docker Compose, `restart: unless-stopped`               | `pg_isready` healthcheck     |
| Mailpit SMTP   | `127.0.0.1:1025`         | Docker Compose, `restart: unless-stopped`               | Mailpit `readyz` healthcheck |
| Mailpit UI/API | `http://127.0.0.1:8025`  | same container                                          | HTTP/healthcheck             |

The frontend and Docker-published dependency ports are loopback-bound. The Nest API is reached locally through `127.0.0.1:4000`, but `apps/api/src/main.ts` currently listens on `0.0.0.0`; CORS still accepts only the configured frontend origin. If the API must be strictly local-only at the socket boundary, make the listen host configurable and use `127.0.0.1` in the user-systemd unit before exposing the machine to an untrusted LAN.

Start/build operations:

```bash
docker compose up -d postgres mailpit
pnpm build
systemctl --user start weddingos-api.service weddingos-web.service
```

Installed unit sources are in `ops/weddingos-api.service` and `ops/weddingos-web.service`; active copies are under `~/.config/systemd/user/`. Both units are enabled. `loginctl show-user` reports `Linger=yes`, so the user manager can remain available after logout. Docker is enabled at the system level.

PostgreSQL data persists in the named volume `weddingos_weddingos-postgres`. Source bind mounts are not database storage. Application logs are in the user journal:

```bash
journalctl --user -u weddingos-api.service
journalctl --user -u weddingos-web.service
docker compose logs postgres mailpit
```

Final controlled restart proof:

1. both systemd services and both project containers were fully stopped;
2. Docker Compose dependencies were started from stopped state;
3. PostgreSQL and Mailpit returned `healthy`;
4. enabled systemd services were started and reached API `ready` plus frontend HTTP availability;
5. each systemd main process was killed once and replaced automatically by `Restart=always`;
6. the final production route smoke and manual Chromium checks succeeded.

This is the safe equivalent of a local environment restart without restarting the entire Docker daemon and disrupting unrelated containers.

## 15. Audit registry reconciliation

| Registry                           | Reconciled state                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `docs/API_OPERATION_REGISTRY.json` | schema 2.2; 30 active, 2 feature flagged, 21 planned in Slice 0/1 domains; real test-status vocabulary              |
| `docs/FRONTEND_INVENTORY.json`     | schema 2.1; real workspace structure, connected pages, implemented/plan/no-call status corrections                  |
| `docs/BACKEND_ENTITY_CATALOG.json` | schema 2.1; exactly 15 implemented Slice 0/1 models; broader catalog stays planned                                  |
| `docs/PERMISSION_MATRIX.csv`       | auth/workspace/team implemented; onboarding/shell/preferences/activity accurately partial; future domains untouched |

Both reconciliation scripts were run twice. The second run produced byte-identical registry checksums, and all JSON registries parsed successfully. No implemented Slice 0/1 operation remains classified as `ABSENT_REPOSITORY`.

## 16. Slice 2 readiness matrix

| Capability                 | Status              | Reason / required next step                                                                                             |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Transactional outbox       | **BLOCKED**         | no outbox table, atomic writer, dispatcher state, attempts, or idempotent delivery contract; add first in 2A            |
| Persistent worker          | **PARTIALLY READY** | systemd/Docker patterns and event names exist; worker package, graceful shutdown, DB role/context, job lifecycle absent |
| Redis/BullMQ               | **PARTIALLY READY** | Compose can be extended, but Redis, queue contracts, retry policy, and observability are absent                         |
| Persistent background jobs | **PARTIALLY READY** | idempotency/audit foundations exist; jobs table/state machine, ownership/leases, retries and recovery absent            |
| Notification generation    | **PARTIALLY READY** | user preferences and semantic events exist; notification entity, projection, templates/dispatch routing absent          |
| Activity projections       | **PARTIALLY READY** | append-only audit source exists; activity read model/cursor/API/export job absent                                       |
| Onboarding draft           | **PARTIALLY READY** | atomic workspace foundation exists; draft schema/versioning/save/complete APIs absent                                   |
| Plan generation            | **BLOCKED**         | requires persisted onboarding draft plus jobs/outbox/worker and idempotent plan write model                             |
| Tasks                      | **PARTIALLY READY** | tenancy/capabilities/idempotency patterns exist; task model/API/events/permissions tests absent                         |
| Calendar                   | **PARTIALLY READY** | tenant foundation exists; event model, recurrence/timezone rules and projection/API absent                              |
| Timeline                   | **PARTIALLY READY** | workspace/wedding date exists; milestone model/generation/versioning/API absent                                         |
| Dashboard read model       | **PARTIALLY READY** | bootstrap shell contract exists; counters are zero/mock and no product projection/read endpoint exists                  |

### 16.1 Recommended Slice 2A start order

1. restore/validate Git metadata and take a trustworthy baseline;
2. add `*.tsbuildinfo` ignore and resolve the second lockfile with provenance;
3. define outbox and job state contracts/migrations;
4. create an RLS-safe worker role/context and the pinned-pool leakage regression test;
5. add Redis/BullMQ plus supervised worker with retries, idempotency, health, and logs;
6. move e-mail side effects behind the transactional outbox;
7. build notification and activity projections;
8. persist onboarding drafts, then enable plan generation;
9. replace or disable global false UI actions before connecting the first product module;
10. add central `401`/`403`/`409` frontend policy and hard demo/API separation.

## 17. Evidence index

- Composition: `apps/api/src/app.module.ts`, root `package.json`, `pnpm-workspace.yaml`.
- Contracts: `packages/contracts/src/index.ts`.
- DB: `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/*`.
- RLS context: `apps/api/src/common/database.service.ts`.
- Auth/session: `apps/api/src/auth/*`, `apps/api/src/common/origin.middleware.ts`.
- E-mail: `apps/api/src/email/*`.
- Workspace/team: `apps/api/src/workspaces/*`, `apps/api/src/team/*`.
- Frontend transport/context: `src/lib/api/client.ts`, `src/lib/api/workspace-context.tsx`, `src/proxy.ts`.
- Tests: `apps/api/test/foundation.spec.ts`, `apps/api/test/slice-1.integration-spec.ts`, `tests/e2e/slice-1.spec.ts`.
- Runtime: `docker-compose.yml`, `ops/weddingos-api.service`, `ops/weddingos-web.service`.
- Registries: the four files in section 15 plus reconciliation scripts.

## Final handoff decision

**READY WITH CONDITIONS.** The current Slice 0/1 foundation is real, tested, tenant-isolated, and persistently runnable. Begin Slice 2 with infrastructure hardening (Git baseline, outbox, worker/RLS context, pool-leak test, frontend/demo error boundaries), not with direct implementation of product pages against the remaining mocks.
