# WeddingOS Slice 9 final handoff

Date: 2026-07-21  
Scope: General Copilot, controlled automations, Risks and Plan B  
Implementation verdict: **READY FOR SLICE 10 WITH CONDITIONS**

Slice 10 was not started.

## Outcome

Slice 9 adds an authorization-aware intelligence layer over the existing canonical WeddingOS domains. Copilot answers from bounded real workspace data, returns persisted sources and creates structured proposals. Mutations require human review and execute only through an allowlisted canonical command registry. Risks, contingency plans, controlled automations and weekly digests are persistent, tenant-scoped and worker-backed.

The existing application layout, typography, colors, spacing, themes and responsive behavior were preserved. New UI work is functional state only: loading, empty, failure, fallback, review, approval and execution states.

## Copilot

- `DeterministicCopilotProvider` is the local availability and safety floor.
- `ConfiguredAiCopilotProvider` is optional, server-configured and bounded by timeout, structured output validation and deterministic fallback.
- Routing considers requested mode, provider availability and sensitive context. A request cannot select an arbitrary provider, model, tool or endpoint.
- Conversations, messages, runs, feedback, source references and usage records are persistent.
- Context is built from the persisted actor/workspace, effective capabilities and query-specific canonical reads. It is bounded to 50 resources and a configurable byte ceiling.
- Guests, bookings, contracts, payments and Wedding Day are exposed only as capability-filtered summaries. Raw contacts, allergies, medical notes, provider identifiers, tokens and secrets are excluded.
- Clean PDF, DOCX and text versions support worker-based extraction and bounded chunks. Document chunks remain tenant-scoped, grant-controlled and explicitly marked as untrusted data.
- PostgreSQL full-text/metadata and deterministic retrieval remain available without embeddings. `pgvector` is not available in the current PostgreSQL image and was not added.
- Source references are persisted with allowlisted internal resource types and safe resource identifiers.
- Structured proposals have immutable versions, ordered allowlisted actions, risk level, preview, explicit approval/rejection and persisted execution results.
- Proposal execution requires `If-Match` and `Idempotency-Key`, reloads the target and rejects stale versions.
- Financial, signature, payout, settlement, destructive document, subscription, moderation and Wedding Day publication actions remain prohibited.
- Usage records persist provider/model/unit/cost metadata only. Hidden reasoning, system prompts, secrets and full provider traces are not stored.

## Risks

- The canonical risk register supports categories, owner membership, probability, impact, server-side score, level, source, mitigation and lifecycle transitions.
- Matrix `risk-matrix.v1` uses probability `1..5 × impact 1..5`: LOW `1..4`, MEDIUM `5..9`, HIGH `10..16`, CRITICAL `17..25`.
- Deterministic detection reads canonical task and milestone state, deduplicates signals and persists assessments with source evidence.
- AI enrichment can suggest an assessment but cannot silently create or change an accepted canonical risk.
- Risk notifications and Activity are semantic outbox projections with stable dedupe.

## Plan B

- Contingency plans contain persistent triggers and ordered actions.
- Approved versions are immutable snapshots; later edits do not overwrite the decision history.
- Simulation is a durable, read-only background job that returns affected actions and warnings without mutating canonical state.
- Approval and activation are separate version-guarded operations.
- Activation requires explicit approval, `If-Match` and `Idempotency-Key`, then executes only allowlisted canonical actions and persists created resources.
- Completion and cancellation remain explicit transitions with history.

## Automations

- The catalog contains at least 12 deterministic templates. Templates are clone sources, not executable rules.
- Triggers and actions use closed enums. Conditions use a bounded field/operator/value DSL; JavaScript, SQL, arbitrary URLs and arbitrary API calls are invalid.
- Rules support create, update, dry-run, activate, pause, approve/reject and execution inspection.
- Source-event identity, rule/source dedupe, step identity, cooldown and maximum recursion depth prevent loops and duplicate effects.
- Only a closed canonical source-event allowlist can invoke the `automation_trigger` consumer.
- Permanent/retryable failures remain explicit. Repeated permanent failures pause the rule and notify the owner.
- Weekly digest uses canonical metrics, workspace timezone/preferences and a stable workspace/period dedupe key. In-app completion is distinct from confirmed e-mail delivery.
- The worker resolves digest recipients through a bounded persisted database function and never trusts a BullMQ workspace payload.

## Database and security

Slice 9 migrations:

1. `20260720200000_slice_9_intelligence_core`
2. `20260720201000_slice_9_rls_capabilities_integrity`
3. `20260720202000_slice_9_worker_context_recovery`
4. `20260720203000_slice_9_completion`
5. `20260720204000_slice_9_scheduled_automation`
6. `20260720205000_slice_9_worker_derived_events`
7. `20260720205500_slice_9_digest_recipient_contract`

The seven Slice 9 migrations and all 82 real migrations are applied in both `weddingos` and `weddingos_e2e`.

- 34 Slice 9 entity/catalog entries cover Copilot, document extraction, risks, contingency, automations and visible-job reuse.
- Tenant-owned entities use forced RLS, tenant indexes, foreign keys, checks, unique dedupe constraints and least-privilege app/worker grants.
- Worker context is reconstructed from persisted outbox/job records. Forged workspace values are rejected.
- Capability families were added for Copilot, Risks, Contingency and Automations and reconciled in the permission matrix.
- Prompt-injection-shaped document text is detected, retained only as untrusted data and cannot grant tool authority.
- The app and worker roles are not database owners.

## Frontend

- The global Copilot shell now uses persistent conversations, messages, run/job states, source references, proposals and approval results.
- `/risks` and `/risks/[id]` use real APIs for register, assessment, mitigation and transitions.
- `/contingency-plans` and `/contingency-plans/[id]` use real APIs for versions, simulation, approval and activation.
- `/automations` uses the real template/rule/dry-run/activation/execution flow.
- Overview, next-best-action, global Search and Quick Create include the active Slice 9 resources.
- Mock success, fake confidence and local-only risk/automation mutations were removed from production mode.
- Arbitrary attachment upload, voice input, web browsing and prohibited autonomous actions remain unavailable.

## Events and consumers

Versioned `copilot.*`, `risk.*`, `contingency.*`, `automation.*` and `digest.*` events use the existing transactional outbox and per-consumer execution model.

Slice 9 consumers include `copilot_run`, `document_text_extraction`, `risk_detection`, `contingency_simulation`, `automation_trigger`, `automation_execution` and `weekly_digest`, plus the existing notification/activity/event-ack projections. Long-running user operations create visible `BackgroundJob` records; internal projections do not.

Delivery remains at-least-once with idempotent effects where supported. External provider delivery is not described as exactly once.

## OpenAPI and registries

- 57 active Slice 9 operations have concrete request/response/problem schemas, cookie auth, capability metadata and required concurrency/idempotency headers.
- Contracts do not expose chain of thought, provider secrets, raw system prompts or unrestricted document text.
- `docs/API_OPERATION_REGISTRY.json`: 374 operations total, 57 Slice 9 operations.
- `docs/FRONTEND_INVENTORY.json`: 54 route records, including the reconciled Slice 9 controls.
- `docs/BACKEND_ENTITY_CATALOG.json`: 241 records, including 34 Slice 9 entries.
- `docs/AUTOMATION_REGISTRY.json`: 78 records.
- `docs/PERMISSION_MATRIX.csv`: 60 valid data rows (61 including the header) across 15 columns.

## Validation

Final exact results:

| Gate                          |          passed |            failed | skipped |
| ----------------------------- | --------------: | ----------------: | ------: |
| Format                        |               1 |                 0 |       0 |
| Lint                          |               1 |                 0 |       0 |
| Typecheck                     |               1 |                 0 |       0 |
| Unit                          |             194 |                 0 |       0 |
| Integration                   |              38 |                 0 |       0 |
| E2E application               |             198 |                 0 |       0 |
| E2E landing fallback          |               5 |                 0 |       0 |
| E2E landing full-stack proof  |               1 |                 0 |       0 |
| API build                     |               1 |                 0 |       0 |
| Worker build                  |               1 |                 0 |       0 |
| Frontend build                |               1 |                 0 |       0 |
| Route smoke                   |              65 |                 0 |       0 |
| OpenAPI validation            |               8 |                 0 |       0 |
| Database migrations           | 82 per database | 0 real migrations |       0 |
| Provider/fallback tests       |               5 |                 0 |       0 |
| Prompt-injection policy tests |               1 |                 0 |       0 |
| Automation recursion tests    |               1 |                 0 |       0 |
| Persistent runtime            |      3 services |                 0 |       0 |
| Restart recovery              |      3 services |                 0 |       0 |

E2E total: **204 passed, 0 failed, 0 skipped, 0 retries**. Slice 9 contributes 30 journeys and the complete application suite retains all Slice 1–8 journeys.

`pnpm verify` passes format, lint, typecheck, 194 unit tests, 38 integration tests and all three production builds. The Next.js production build generated 67 routes.

## Persistent local runtime

- Web: `http://127.0.0.1:43191`
- API readiness: `http://127.0.0.1:4000/ready`
- Mailpit: `http://127.0.0.1:8025`
- Services: `weddingos-api.service`, `weddingos-worker.service`, `weddingos-web.service`
- Runtime: `/home/andrei/weddingos-runtime`
- All services are enabled, loopback-bound and use `Restart=always`.

Manual post-restart checks cover `/sign-in`, `/risks`, `/contingency-plans`, `/automations`, API readiness, worker heartbeat and fresh service logs.

## Limitations

### EXPECTED FOR NEXT SLICE

- External AI remains optional and disabled until an approved provider endpoint/key/model and external-data policy are configured.
- Vector embeddings remain out of scope; deterministic PostgreSQL retrieval is the supported Slice 9 path.
- Web browsing, arbitrary code/SQL/shell, autonomous purchases, payments, refunds, payouts and communications remain intentionally unavailable.

### TECHNICAL DEBT

- The source tree currently contains an unrelated empty concurrent migration directory, `20260720214500_public_marketing_revocation_safety_gate`. Prisma correctly returns `P3015` for that directory even though all 82 real migrations are applied. The directory belongs to concurrent work and was preserved instead of overwritten or deleted.
- The configured external AI adapter is validated through fake/fallback contracts; a real production provider still requires deployment-specific privacy, retention and billing review.

### BLOCKER

- No runtime or Slice 9 functional blocker.
- Before the next migration is generated or deployed, the unrelated empty migration directory must either receive its intended `migration.sql` from its owner or be removed by that owner.

## Final verdict

**READY FOR SLICE 10 WITH CONDITIONS**

The application and Slice 9 gates are green. The only condition is reconciliation of the unrelated empty migration directory before another Prisma migration deployment. Slice 10 has not been started.
