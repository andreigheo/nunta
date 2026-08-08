# WeddingOS Slice 2A — final implementation handoff

Data verificării: 2026-07-18  
Repository verificat: `/mnt/c/home/andrei/test kimi/weddingos`  
Documente normative: `docs/adr/0005-transactional-outbox.md` și `docs/SLICE_2A_IMPLEMENTATION_PLAN.md`

## Verdict executiv

`READY FOR SLICE 2B`

Slice 2A implementează și validează lanțul:

```text
tranzacție autoritativă PostgreSQL
  + OutboxMessage
  + OutboxConsumerExecution per consumer
  + BackgroundJob numai când operația este vizibilă utilizatorului
→ dispatcher
→ BullMQ/Redis
→ worker cu rol și context RLS restricționate
→ efect idempotent, retry sau dead-letter
```

Nu a fost început Slice 2B. Nu există plan generat, task generat sau consumer de plan generation.

## 1. Verificare completă

Matricea finală este bazată pe `pnpm verify`, suita Playwright separată, migrare pe bază disposable, audit OpenAPI live și smoke pe serviciile persistente.

| Categorie                 | Passed | Failed | Skipped | Rezultat factual                                        |
| ------------------------- | -----: | -----: | ------: | ------------------------------------------------------- |
| Format                    |      1 |      0 |       0 | `prettier --check` a trecut                             |
| Lint                      |      1 |      0 |       0 | ESLint frontend, API, worker și packages a trecut       |
| Typecheck                 |      1 |      0 |       0 | TypeScript root/workspaces a trecut                     |
| Unit tests                |     28 |      0 |       0 | web 7, API 13, worker 8                                 |
| Integration tests         |     17 |      0 |       0 | PostgreSQL, Redis, BullMQ, Mailpit, API și worker reale |
| E2E tests                 |      7 |      0 |       0 | Playwright, frontend + API + worker + Mailpit           |
| API build                 |      1 |      0 |       0 | NestJS production build                                 |
| Worker build              |      1 |      0 |       0 | worker TypeScript production build                      |
| Frontend production build |      1 |      0 |       0 | Next.js build, 52 pages generate                        |
| Route smoke               |     50 |      0 |       0 | 50/50 rute user-facing au întors HTML 200               |
| OpenAPI validation        |      2 |      0 |       0 | audit structural + Swagger Parser                       |

`pnpm verify` a trecut integral. Nu există teste `skipped`, `todo` sau `pending` în gate-ul raportat. E2E nu face parte din scriptul root `verify`, de aceea a fost rulat și raportat separat: 7/7.

Fișierele de test relevante sunt:

- `src/**/*.test.ts(x)` pentru frontend și transport;
- `apps/api/test/foundation.spec.ts` și `apps/api/test/openapi.spec.ts` pentru unit/OpenAPI;
- `apps/worker/test/jobs.spec.ts` pentru queue, crypto, retry și consumer selection;
- `apps/api/test/slice-1.integration-spec.ts` pentru cele 17 scenarii reale;
- `tests/e2e/slice-1.spec.ts` pentru cele 7 călătorii browser.

## 2. Structura implementată

| Zonă                 | Responsabilitate Slice 2A                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`           | Autoritate HTTP NestJS, sesiuni/capabilities, tranzacții autoritative, producători outbox, notification/activity/onboarding/job APIs, readiness și OpenAPI |
| `apps/worker`        | Dispatcher/reconciler, BullMQ processor, e-mail, proiecții, export CSV, cleanup artifact, heartbeat și graceful shutdown                                   |
| `packages/contracts` | Contracte Zod partajate pentru request/response, evenimente și onboarding                                                                                  |
| `packages/database`  | Prisma schema/client, 13 migrații, roluri, grants, forced RLS și funcții worker cu `SECURITY DEFINER`                                                      |
| `packages/config`    | Validarea configurației API/worker: PostgreSQL, Redis, SMTP, crypto, artifact și feature flags                                                             |
| `packages/jobs`      | Catalogul de evenimente/consumatori, contractul queue, ID determinist, state machines, retry classification, redaction și envelope AES-GCM                 |
| `ops`                | Docker Compose, unități systemd, artifact root administrat și active operaționale locale                                                                   |
| `tests`              | E2E Playwright; testele API/worker sunt colocate în `apps/*/test`                                                                                          |
| `docs`               | ADR-uri, plan, registre reconciliate, matricea de permisiuni și acest handoff                                                                              |

Nu au fost implementate accidental: tasks, calendar business logic, timeline, budget, Guest CRM, plan generator, AI Wedding Planner, marketplace, uploads generale, document storage sau alte domenii Slice 2B+. Paginile viitoare existente rămân preview/demo; controalele care ar fi pretins o mutație reală sunt dezactivate sau marcate planned.

## 3. Migrații și modele

### 3.1 Cele 13 migrații, în ordine

Toate rândurile de mai jos au `rulată: da`, atât în baza live, cât și într-o migrare de la zero pe baza disposable `weddingos_slice2a_final_audit`.

|   # | Migrare                                            | Scop și suprafață modificată                                                                                                                                                                                                      | Rezultat |
| --: | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
|   1 | `20260717224538_slice_0_1_foundation`              | Enums și tabelele Slice 0/1 pentru user, identity, session, token, workspace, membership, invitation, preferences, audit și idempotency; indexes, FK-uri, grants și RLS de bază                                                   | applied  |
|   2 | `20260718023000_notification_categories`           | Normalizează preferințele: `planning_email` → `tasks_email`; adaugă payments/RSVP/vendors/digest email                                                                                                                            | applied  |
|   3 | `20260718030000_strengthen_rls`                    | Adaugă helper-ele de workspace access/initial owner și întărește politicile workspace, membership, invitation, audit și idempotency                                                                                               | applied  |
|   4 | `20260718033000_fix_workspace_bootstrap_rls`       | Leagă bootstrap-ul workspace de contextul transaction-local și permite reactivarea membership numai prin invitația exactă                                                                                                         | applied  |
|   5 | `20260718034000_audit_append_only`                 | Revocă `UPDATE`, `DELETE`, `TRUNCATE` pe `audit_events` pentru rolul aplicației                                                                                                                                                   | applied  |
|   6 | `20260718035000_public_invitation_workspace_rls`   | Permite preview public strict pentru workspace/profile țintit de tokenul valid de invitație                                                                                                                                       | applied  |
|   7 | `20260718036000_invitation_decline_audit_rls`      | Permite auditul decline numai în contextul invitației valide                                                                                                                                                                      | applied  |
|   8 | `20260718100106_slice_2a_async_foundation`         | Creează async enums și tabelele inițiale outbox, background jobs, delivery attempts, notifications, activity, onboarding, heartbeat; adaugă worker role, grants și forced RLS                                                     | applied  |
|   9 | `20260718103000_worker_claim_function`             | Introduce claim atomic cu `FOR UPDATE SKIP LOCKED` prin funcție îngustă `SECURITY DEFINER`                                                                                                                                        | applied  |
|  10 | `20260718112000_onboarding_ready_contract`         | Corectează onboarding `COMPLETED` în `READY`; adaugă metadata de recovery, priority/module și visibility                                                                                                                          | applied  |
|  11 | `20260718155000_slice_2a_consumer_hardening`       | Creează `OutboxConsumerExecution` și `GeneratedArtifact`; separă joburile vizibile; mută attempts per consumer; adaugă activity dedupe, artifact lifecycle, worker-context validation, claim/reconciliation/cleanup și forced RLS | applied  |
|  12 | `20260718175000_fix_consumer_reconciliation_uuid`  | Înlocuiește agregarea PostgreSQL invalidă `max(uuid)` cu agregare text castată înapoi la UUID                                                                                                                                     | applied  |
|  13 | `20260718182000_serialize_consumer_reconciliation` | Serializează reconcilierea pe rândul outbox și repară driftul istoric outbox/job produs de finalizarea concurentă a consumerilor                                                                                                  | applied  |

Proba exactă din baza live:

```text
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "weddingos", schema "public" at "127.0.0.1:54339"

13 migrations found in prisma/migrations

Database schema is up to date!
```

Comandă: `pnpm --filter @weddingos/database exec prisma migrate status --schema prisma/schema.prisma` cu URL-ul owner numai pentru introspecția migrațiilor.

### 3.2 Modelele Slice 2A

| Model                     | Status/lifecycle                                                                      | Relații și dedupe                                                                       | Indexuri/RLS/retention                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OutboxMessage`           | `PENDING → PROCESSING/FAILED → PROCESSED sau DEAD_LETTER`; agregă starea consumerilor | 1:N consumer executions, optional 1:1 visible job; `deduplication_key` unic             | status+available, workspace+created, event, lock; forced RLS; commandul se curăță la succes/dead-letter, rândul terminal rămâne evidență operațională |
| `OutboxConsumerExecution` | `PENDING → ENQUEUED → PROCESSING → COMPLETED/FAILED/DEAD_LETTER`                      | FK outbox, optional job; unique `(outbox_message_id, consumer_name)` și dedupe key unic | status+available, outbox+status, job+status, lock; forced RLS; retained cu outbox pentru recovery/audit                                               |
| `BackgroundJob`           | `QUEUED → RUNNING/RETRYING → COMPLETED/FAILED/CANCELLED/DEAD_LETTER`                  | optional outbox, N executions, optional artifact; dedupe key unic                       | actor+created, workspace+status+created, status+available; forced RLS; numai export/onboarding, fără purge automat în 2A                              |
| `DeliveryAttempt`         | `SUCCEEDED`, `RETRYABLE_FAILURE`, `PERMANENT_FAILURE` per provider try                | FK consumer execution, optional job; unique `(consumer_execution_id, attempt_number)`   | execution/job/workspace+created; forced RLS; recipient hash-uit și erori redactate; retained ca dovadă at-least-once                                  |
| `Notification`            | unread ↔ read; dismiss produce lifecycle event și șterge rândul ownerului             | user/workspace + source outbox; `source_event_id` și dedupe key unice                   | user+dismissed/read+created, workspace+created; forced RLS; fără expirare automată în 2A                                                              |
| `ActivityItem`            | proiecție append-only, fără mutation API                                              | workspace/actor + source outbox; `source_event_id` și canonical dedupe key unice        | workspace+occurred și workspace+category+occurred; forced RLS; retention urmează workspace-ul, fără purge automat în 2A                               |
| `OnboardingDraft`         | `DRAFT → READY`; `SUPERSEDED` este rezervat versiunilor înlocuite                     | workspace și user; workspace unic                                                       | user+updated; forced RLS; un document persistent per workspace                                                                                        |
| `GeneratedArtifact`       | `GENERATING → READY → EXPIRED → DELETED`                                              | 1:1 job și 1:1 consumer execution; storage key unic                                     | owner/workspace+status+created, status+expires; forced RLS; retenție implicită 24h și cleanup automat                                                 |
| `WorkerHeartbeat`         | upsert la start și la fiecare 10s; readiness îl consideră stale după prag             | cheia primară este worker ID; metadata conține PID/host/queue/contract                  | last_seen index; forced RLS; rândurile servesc liveness/diagnostic                                                                                    |

În baza live sunt 16 tabele cu RLS enabled+forced și 35 policies. Cele nouă modele sunt mapate și în `docs/BACKEND_ENTITY_CATALOG.json`.

## 4. Transactional outbox

`AsyncService.record(transaction, intent)` primește obligatoriu `Prisma.TransactionClient`. În aceeași tranzacție a operației de domeniu:

1. validează evenimentul și payload-ul prin catalogul shared;
2. creează optional `BackgroundJob` numai dacă `userVisibleJob=true`;
3. creează `OutboxMessage` cu payload redacted și optional command criptat;
4. selectează consumatorii din contractul persistat;
5. creează câte un `OutboxConsumerExecution` pentru fiecare consumer.

Testul `rolls an outbox intent and its consumer ledger back atomically` forțează rollback și confirmă zero outbox, zero executions și zero visible job. Testele onboarding/export confirmă varianta cu visible job; auth/email și proiecțiile interne confirmă varianta fără visible job.

- Event factory/producător: `apps/api/src/async/async.service.ts`.
- Contract și consumer selection: `packages/jobs/src/index.ts`.
- Dedupe: outbox logical key unic, execution key `consumer:<outboxId>:<consumerName>`, projection source keys și visible-job idempotency.
- Locking: claim în batch prin `FOR UPDATE SKIP LOCKED`; `locked_at`, `locked_by`, heartbeat și availability sunt persistente.
- Stale locks: dispatcher și worker claims depășite sunt reclamate; joburile BullMQ terminale pot fi eliminate și recreate din PostgreSQL.
- Terminal: numai toate execuțiile `COMPLETED` dau outbox `PROCESSED`; un dead-letter obligatoriu produce outbox/job `DEAD_LETTER`.
- Partial success: un consumer finalizat nu este reluat; fratele poate retry/dead-letter independent. Reconcilierea este serializată pe outbox pentru a evita aggregate drift.
- Redis indisponibil: mutația API rămâne committed cu intent durabil; enqueue failure nu pierde execuția, ci o lasă retryable în PostgreSQL până revine Redis.

Garanția este **at-least-once**, cu efecte idempotente unde constraint-urile permit; nu se declară exactly-once universal.

## 5. Worker și queue

- Queue: `weddingos-domain-events`.
- Contract: `domain-event.consumer.v1`.
- Payload: `outboxMessageId`, `consumerExecutionId`, `consumerName`, `contract`; nu conține workspace/actor arbitrar.
- BullMQ ID: `<outboxMessageId>--<consumerName>`.
- Closed allowlist: `event_ack`, `email`, `notification_projection`, `activity_projection`, `activity_export`.
- Dispatcher: rulează la 750ms, claims persistente, `Queue.add()` cu ID determinist și retry metadata.
- Reconciler: funcțiile PostgreSQL de claim/begin/fail/reconcile recuperează lock-uri stale și reconstruiesc transportul din ledger.
- Processor: validează Zod queue data, încarcă snapshotul persistent, reface consumer selection și refuză orice consumer care nu corespunde contractului.
- Retry: maximum implicit 5 attempts, backoff exponențial bounded cu jitter; erorile SMTP timeout/refused/5xx sunt retryable, erorile contract/crypto expirate sunt permanente.
- Dead-letter: execution, outbox și visible job devin terminale; `DeliveryAttempt` reține rezultatul redacted.
- Heartbeat: start + 10 secunde în `worker_heartbeats`; API `/ready` verifică freshness.
- Graceful shutdown: SIGTERM/SIGINT opresc timers, așteaptă BullMQ worker, închid queue și Prisma.
- Crash recovery: testele acoperă failure înainte de enqueue ack, stale dispatcher, stale worker, partial sibling success și provider success înainte de ack intern.

Redis este transport, nu sursa de adevăr. Un payload Redis nu poate impune workspace-ul.

## 6. Worker RLS

Rolul runtime `weddingos_worker` are `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`; nu este owner și nu primește acces general la toate tabelele. Are grants limitate pe async/projection tables și `EXECUTE` numai pe funcțiile de claim/begin/fail/reconcile/cleanup validate prin `session_user`.

Contextul worker este încărcat din join-ul persistent execution → outbox → optional job. Abia după validarea IDs/consumerului sunt setate transaction-local:

```text
app.current_user_id
app.current_workspace_id
app.current_worker_id
app.current_consumer_execution_id
app.current_job_id
app.current_correlation_id
```

Policy helper-ul `weddingos_worker_execution_context_matches(...)` verifică relația persistentă pentru fiecare tabel. `SET LOCAL` este în tranzacția Prisma și dispare la commit/rollback.

Rezultatele cerute:

1. pinned physical API connection: passed; workspace A → B → no-context pe aceeași conexiune nu scurge context;
2. pinned physical worker connection: passed cu aceeași ordine;
3. missing context fails closed: passed; worker vede 0 rânduri în executions/artifacts/notifications/activity;
4. forged Redis workspace: passed; contextul B arbitrar nu poate citi/scrie peste snapshotul A;
5. jobs A/B în același proces: passed; zero cross-tenant access.

Dovada principală este scenariul integration `enforces application and PostgreSQL isolation across two workspaces`, împreună cu scenariul stale/forged worker din aceeași suită.

## 7. E-mail delivery

Toate cele șapte fluxuri au fost mutate din SMTP post-commit în transactional outbox:

| Flux                                   | Event                                  | Consumer / command             | Attempts și terminal                  | API/UI semantică                                                               |
| -------------------------------------- | -------------------------------------- | ------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| Registration verification              | `user.registered.v1`                   | `email` / `email-verification` | max 5; retry persisted; dead-letter   | cont + token + intent committed; UI cere verificarea, nu pretinde delivery     |
| Verification resend                    | `user.email_verification_requested.v1` | `email` / `email-verification` | max 5; dead-letter după permanent/max | 202 accepted/neutral; mesajul este queued                                      |
| Password reset                         | `password.reset_requested.v1`          | `email` / `password-reset`     | max 5                                 | 202 enumeration-safe; nu confirmă existența contului sau delivery              |
| Password-changed security notification | `password.changed.v1`                  | `email` / `password-changed`   | max 5                                 | parola/sesiunile sunt authoritative; notificarea e queued                      |
| Magic link                             | `magic_link.requested.v1`              | `email` / `magic-link`         | max 5                                 | 202 accepted/neutral, feature flag verificat                                   |
| Team invitation                        | `membership.invited.v1`                | `email` / `team-invitation`    | max 5                                 | invitația persistă; UI spune procesată/trimisă în coadă, nu provider-delivered |
| Invitation resend                      | `membership.invitation_resent.v1`      | `email` / `team-invitation`    | max 5                                 | tokenul este rotit atomic; noul mail este queued                               |

Fiecare încercare produce `DeliveryAttempt` cu attempt number, outcome, provider message ID când există, recipient SHA-256 și eroare redacted.

Scenariul real validat:

```text
SMTP indisponibil
→ mutația de domeniu este committed
→ outbox + email consumer rămân durabile
→ retry și DeliveryAttempt sunt persistate
→ SMTP revine
→ execuția și livrarea reușesc
```

Testul separat `records the at-least-once window when provider success precedes acknowledgement` validează:

```text
provider accepted
→ worker crash înainte de ack PostgreSQL
→ recovery poate retrimite
→ două attempts SUCCEEDED sunt observabile
```

SMTP este explicit **at-least-once**; exact-once nu este revendicat.

## 8. Encryption envelope

Commandul sensibil folosește envelope v2:

- algoritm: `AES-256-GCM`;
- `version: 2`;
- `keyId`: cheia activă din `OUTBOX_ENCRYPTION_KEY_ID`;
- decrypt keyring: cheia activă plus `OUTBOX_DECRYPTION_KEYS`;
- nonce random de 12 bytes, base64url;
- authentication tag GCM, base64url;
- `issuedAt` și `expiresAt` ISO-8601;
- ciphertext base64url.

Rotația activează mai întâi noul key ID, păstrează vechile chei în decrypt keyring până când toate envelope-urile care le folosesc sunt terminale și le-a trecut expiry window, apoi elimină cheia veche. Cheia necunoscută, envelope-ul expirat sau auth-tag invalid produc permanent failure/dead-letter.

La delivery success sau terminal email dead-letter, `outbox_messages.encrypted_headers` este setat `NULL`. Payload-ul public păstrează numai subject/projection hints redactate. Tokenurile și recipientul raw nu apar în event payload; loggerul Pino redactează recipient/email/token/code/password/encryptedHeaders, iar `DeliveryAttempt.recipient_reference` este SHA-256.

Unit tests validează wrong key, expiry, old-key retention, redaction și permanent classification.

## 9. Notifications

Endpoint-urile canonice reale sunt:

```http
GET    /api/v1/workspaces/:workspaceId/notifications
GET    /api/v1/workspaces/:workspaceId/notifications/unread-count
POST   /api/v1/workspaces/:workspaceId/notifications/mark-all-read
PATCH  /api/v1/workspaces/:workspaceId/notifications/:notificationId
DELETE /api/v1/workspaces/:workspaceId/notifications/:notificationId
```

- pagination: cursor, default 20, maximum 50, ordering `createdAt DESC, id DESC`;
- filters: `module`, `read`; dismissed rows sunt excluse;
- read: optimistic version prin `If-Match`, toggle read/unread;
- dismiss: owner/workspace-only delete plus `notification.dismissed.v1` atomic;
- mark-all: update scoped și lifecycle event numai când există schimbări;
- dedupe: unique `source_event_id` + `notification:<eventId>`;
- isolation: session/capability + user ownership + workspace path + forced RLS;
- deep links: numai path local care începe cu un singur `/`, validate Zod;
- recursion prevention: `notification.read.v1` și `.dismissed.v1` selectează numai `event_ack`, nu projection consumers.

`src/components/shell/notifications-drawer.tsx` consumă API-ul real pentru list/count/read/delete/mark-all. În cont real nu importă date seed; în demo afișează numai starea demo și transportul API este blocat central.

## 10. Activity projection

Sursa canonică a feedului este evenimentul semantic versionat din outbox. `AuditEvent` rămâne evidență append-only de securitate/domeniu și nu este proiectat încă o dată ca al doilea `ActivityItem`. Proiecția păstrează `sourceEventId`, `correlationId` și dedupe `activity:<outboxMessageId>`; unique constraints opresc replays.

- redaction: e-mailurile devin `[email]`, token/password/secret devin `[redacted]`, summary este limitat la 1000 chars;
- visibility: `workspace`, cu forced RLS și membership activ;
- pagination: cursor, maximum 100;
- filters: category/from/to;
- ordering: `occurredAt DESC, id DESC`;
- identity snapshots: actor name/type și entity type/id sunt snapshots redacted, nu join-uri fragile.

Testele onboarding/activity confirmă că aceeași acțiune semantică nu produce două rânduri din `DomainEvent + AuditEvent`.

## 11. Activity export și GeneratedArtifact

`POST /api/v1/workspaces/:workspaceId/activity-exports` cere `Idempotency-Key`, creează atomic un `BackgroundJob` vizibil, outbox și execution `activity_export`. Workerul citește Activity prin RLS, aplică filtrele și generează un CSV bounded.

- storage root: `ops/artifacts/activity-exports`;
- storage key: UUID validat; fișier final `<uuid>.csv`;
- write: `.tmp` în același managed root, mode 0600, apoi atomic rename;
- maximum rows: 10.000 implicit;
- maximum size: 5 MiB implicit;
- checksum: SHA-256;
- expiry: 24 ore implicit;
- cleanup: worker claimuiește expired artifacts, șterge fișierul și marchează `DELETED`;
- authorization: numai `ownerUserId` al jobului, artifact `READY`, neexpirat și storage key sigur; ceilalți primesc 404;
- CSV safety: UTF-8, quoting și protecție spreadsheet-formula injection.

Endpoint-urile reale sunt:

```http
POST /api/v1/workspaces/:workspaceId/activity-exports
GET  /api/v1/jobs/:jobId
GET  /api/v1/jobs/:jobId/artifact
```

CSV bytes nu sunt stocați în job JSON, outbox payload sau unmanaged temp. Job result conține numai metadata și URL-ul securizat de download. Testul `creates an owner-only bounded CSV artifact and deletes it after expiry` acoperă owner, non-owner 404, limite, checksum, expiry și cleanup.

## 12. Onboarding persistent

Cele opt secțiuni persistate sunt:

1. `couple`;
2. `dateEvents`;
3. `location`;
4. `guests`;
5. `budget`;
6. `style`;
7. `existingProgress`;
8. `planningPreferences`.

`GET` face create/read idempotent al draftului; `PATCH` salvează incremental numai câmpurile furnizate și întoarce răspuns normalizat cu `version`. `If-Match` este obligatoriu pentru update și completion. Versiunea stale produce 412, lipsa precondiției produce 428, fără silent overwrite; frontendul afișează reload/manual-retry.

Completion cere simultan `If-Match` și `Idempotency-Key`, validează toate cele opt secțiuni, marchează draftul `READY` și creează exact un `onboarding.ready_for_plan_generation.v1` plus un visible job. Replay cu aceeași sau altă idempotency key găsește evenimentul existent și întoarce același job.

Consumatorii readiness sunt numai `event_ack`, `notification_projection`, `activity_projection`. Frontend și API spun: „Date salvate. Generarea planului urmează în etapa următoare.” și `planGeneration: not_started`.

```text
zero generated plans
zero generated tasks
zero plan-generation consumers
```

## 13. OpenAPI

Audit live final:

- 39 paths;
- 46 HTTP operations;
- 52 component schemas;
- 20 request schemas folosite efectiv;
- 29 success response schemas folosite efectiv;
- 1 problem schema canonic: `ProblemDetails`;
- cookie security scheme: `apiKey`, `in: cookie`, name `weddingos_session`;
- `emptySchemas: []`;
- `missingContracts: []`;
- Swagger Parser: valid.

Toate operațiile cu body au request schema; toate răspunsurile non-204 au response schema; fiecare operație are cel puțin un error response tipizat. `components.schemas` nu este gol.

`Idempotency-Key` este documentat pe create workspace, activity export și onboarding completion. `If-Match` este documentat pe notification update, onboarding update și onboarding completion. MFA challenge/verification sunt singurele două operații feature-flagged planned; plan generation, tasks, calendar, budget, Guest CRM, AI și uploads APIs sunt absente.

Delta Slice 2A față de baseline este 10 paths și 12 operații:

```text
/api/v1/jobs/{jobId}
/api/v1/jobs/{jobId}/artifact
/api/v1/workspaces/{workspaceId}/activity
/api/v1/workspaces/{workspaceId}/activity-exports
/api/v1/workspaces/{workspaceId}/notifications
/api/v1/workspaces/{workspaceId}/notifications/mark-all-read
/api/v1/workspaces/{workspaceId}/notifications/unread-count
/api/v1/workspaces/{workspaceId}/notifications/{notificationId}
/api/v1/workspaces/{workspaceId}/onboarding
/api/v1/workspaces/{workspaceId}/onboarding/complete
```

## 14. Frontend hardening

- central 401: emite session invalidation și redirecționează la `/session-expired` cu `returnTo`;
- central 403: redirecționează la `/access-denied`, păstrând capability când este prezent;
- central 409/412: toast de conflict + reload; niciun overwrite automat;
- onboarding conflict UI: păstrează schimbările pentru retry manual și afișează eroarea API;
- notification API: drawer real list/count/read/delete/mark-all;
- activity API: list/filter și export real;
- job polling: activity export polluiește `GET /jobs/:jobId` până la terminal și descarcă artifactul;
- same-origin rewrite: browserul folosește numai `/api/v1`; Next server folosește `API_INTERNAL_URL`;
- demo fail-closed: cookie guard este verificat înainte de `fetch`.

Controale conectate în Slice 2A: activity export; onboarding save/continue/complete; notification read/delete/mark-all/count; invitation control existent. Controale dezactivate/planned: Quick Create submit, Copilot send/apply/edit/attachments/voice, account export, access log și upload inspiration/general.

În production nu mai există false success pentru suprafețele cerute:

- Quick Create poate deschide formularul preview, dar submit este disabled și explică lipsa backendului;
- notifications folosesc API real;
- Copilot este marcat preview, iar send/apply/edit/attachment/voice sunt disabled;
- onboarding finalizează numai colectarea și spune că planul urmează;
- Settings account export/access log sunt disabled;
- navigation nu mai declară badge-uri seed; notification count vine din API;
- upload controls relevante sunt disabled până la storage securizat.

Designul vizual și direcția frontendului nu au fost schimbate.

## 15. Demo zero-network isolation

E2E 7 setează `weddingos_demo=1`, deschide `/team?demo=1` și `/activity?demo=1`, interacționează/verifică butoanele și capturează toate requesturile browser cu path `/api/`. Rezultat: listă goală, zero `/api/v1` requests și implicit zero server mutation.

Unit test-ul transport verifică explicit headerul `theme=dark; weddingos_demo=1; session=real`: prezența unei sesiuni reale nu permite demo-ului să folosească API. Cookie-ul demo are precedență fail-closed, deci cele două moduri pot coexista fără contaminarea contului real.

## 16. Servicii persistente

| Serviciu      | Address/port                                   | Supervisor și restart                        | Health                      | Logs                                            |
| ------------- | ---------------------------------------------- | -------------------------------------------- | --------------------------- | ----------------------------------------------- |
| PostgreSQL 17 | `127.0.0.1:54339`                              | Docker Compose, `unless-stopped`             | healthy, migrations current | `docker compose logs postgres`                  |
| Redis 7.4     | `127.0.0.1:56379`                              | Docker Compose, `unless-stopped`             | healthy, `PONG`             | `docker compose logs redis`                     |
| Mailpit       | SMTP `127.0.0.1:1025`, UI/API `127.0.0.1:8025` | Docker Compose, `unless-stopped`             | healthy, API 200            | `docker compose logs mailpit`                   |
| API           | `127.0.0.1:4000`                               | `weddingos-api.service`, `Restart=always`    | `/ready` ready              | `journalctl --user -u weddingos-api.service`    |
| Worker        | BullMQ + DB heartbeat, fără public port        | `weddingos-worker.service`, `Restart=always` | heartbeat fresh             | `journalctl --user -u weddingos-worker.service` |
| Frontend      | `127.0.0.1:43191`                              | `weddingos-web.service`, `Restart=always`    | `/sign-in` 200              | `journalctl --user -u weddingos-web.service`    |

`ops/weddingos-worker.service` există, este instalat, enabled și active. Toate cele trei unități systemd sunt enabled/active și folosesc Linux Node 22.22.3, `TMPDIR=/tmp` și bind loopback.

Testul controlat de restart a acoperit stop/start dependencies și aplicații, readiness, worker kill/restart și reluarea unei execuții pending. Proba individuală anterioară a confirmat și restartul web/API:

```text
controlled full restart:
  dependencies → healthy
  API/worker/web → active
  /ready → ready; /sign-in → 200

pending recovery probe:
  Outbox 160f1e1b-b60f-465d-a85c-f68e37664265
  before worker: PENDING | email:PENDING, event_ack:PENDING, notification_projection:PENDING
  SIGKILL: worker PID 2562485 → systemd PID 2562524
  after restart: PROCESSED | email:COMPLETED, event_ack:COMPLETED, notification_projection:COMPLETED
  DeliveryAttempt: SUCCEEDED, attempt 1
  /ready → worker healthy, outbox dispatching

previous individual restart probes:
web:    PID 2493646 → 2497015, apoi /sign-in 200
API:    PID 2493645 → 2498195, apoi /ready ready
worker: PID 2493644 → 2500295, worker.started + heartbeat nou
```

Readiness final live:

```json
{
  "status": "ready",
  "database": "connected",
  "redis": "connected",
  "worker": "healthy",
  "outbox": "dispatching"
}
```

## 17. Registre

Au fost reconciliate:

- `docs/API_OPERATION_REGISTRY.json`;
- `docs/FRONTEND_INVENTORY.json`;
- `docs/BACKEND_ENTITY_CATALOG.json`;
- `docs/AUTOMATION_REGISTRY.json`;
- `docs/PERMISSION_MATRIX.csv`.

Rezumat factual:

- API registry: 236 operații catalogate; 42 active, 2 feature-flagged planned, 10 explicit planned, restul fără contract backend în acest slice; live OpenAPI are 42 active + 2 MFA flagged + health/ready;
- entity catalog: 147 ținte, 11 entități Slice 0/1 implemented, 9 entități Slice 2A migrated/RLS-tested, 127 proposed-only;
- automation registry: 6 automatizări Slice 2A implementate/testate, 37 absente intenționat;
- frontend inventory: 585 controale; 25 real-API-backed în total, dintre care controalele Slice 2A pentru activity/onboarding/notifications sunt marcate individual; 7 controale false sunt `disabled_planned_control`;
- permission matrix: Async Operations, Onboarding, Notifications și Activity/Audit sunt `IMPLEMENTED`; AI Copilot și Quick Create sunt `PLANNED DISABLED`; domeniile viitoare rămân mock/absent.

Scriptul `scripts/reconcile-slice-2a-registries.mjs` păstrează reconcilierea repetabilă.

## 18. Limitări

### EXPECTED FOR SLICE 2B

- consumerul real pentru `onboarding.ready_for_plan_generation.v1`;
- plan generator și task generation;
- tasks, calendar, timeline, budget, Guest CRM, marketplace și AI Wedding Planner;
- uploads generale/document storage;
- rutele globale viitoare `/api/v1/me/notifications` pentru security inbox.

### TECHNICAL DEBT

- SMTP poate duplica în fereastra provider-success/before-ack; garanția rămâne at-least-once;
- artifact storage este durabil pentru un singur host, nu object storage multi-node;
- nu există API/UI de manual redrive pentru dead-letter intern;
- nu există metrics dashboard sau alerting extern, numai heartbeat/readiness/structured logs;
- outbox/execution/job/delivery/activity rows terminale nu au încă un retention purge automat documentat; numai artifactul are cleanup automat;
- checkout-ul Windows-mounted WSL are startup/build mai lent decât un filesystem Linux nativ;
- Git metadata lipsește; nu s-a inițializat Git și nu s-a făcut commit/push.

### BLOCKER

Niciun blocker Slice 2A identificat după gate-ul final.

## 19. Verdict final

`READY FOR SLICE 2B`

Verdictul este permis deoarece: 13/13 migrații sunt aplicate; Redis/worker funcționează; atomicitatea outbox, partial success, retry/dead-letter și crash recovery trec; worker RLS/forged workspace trec; OpenAPI are 52 schemas; onboarding este persistent; notifications/activity/export sunt reale; demo zero-network trece; toate categoriile au `0 failed` și `0 skipped`.

Slice 2B nu a fost început în această etapă.
