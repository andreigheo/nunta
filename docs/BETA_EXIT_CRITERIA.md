# Controlled Beta exit criteria

Exit is evaluated from persisted API metrics, not manual claims. The administrative endpoint is `GET /api/v1/platform/beta/exit-criteria`.

## Start criteria

- [x] Slice 10C baseline preserved in a separate working copy
- [x] invitation, consent, participant, access-grant and removal paths implemented
- [x] feedback, status history, participant messages and support escalation implemented
- [x] product-event allowlist and analytics consent enforcement implemented
- [x] RLS, platform capabilities, idempotency and optimistic concurrency implemented
- [x] provider-neutral deployment plan and fail-closed configuration implemented
- [ ] authorized Git repository and immutable release tag exist
- [ ] configured beta domain and valid TLS are proven
- [ ] dedicated external PostgreSQL, Redis and private object storage are proven
- [ ] external email, malware scan, monitoring/tracing and alert route are proven
- [ ] automated off-host backup and isolated external restore are proven
- [ ] legal review approves beta terms and privacy notice
- [ ] test accounts are removed from the external environment
- [ ] bounded external capacity baseline is complete

## Exit from controlled beta

- at least five active participants across the intended cohort mix;
- no unresolved critical feedback or open incidents;
- P0 count zero and P1 trend accepted by the accountable operator;
- activation and core-value metrics calculated from consented, allowlisted events;
- support response and resolution times reviewed;
- verified backup/restore and rollback for the release under evaluation;
- external providers and capacity remain inside agreed limits;
- known issues and participant communications are current.

## Public launch

Controlled-beta exit does not authorize public launch. `publicLaunchReady` is intentionally always false in this phase. The current factual verdict is `CONTROLLED BETA BLOCKED` because the external domain, providers, credentials, Git provenance, legal approval and external capacity proof do not exist in scope.
