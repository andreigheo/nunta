# Public launch gaps

Public launch is `NOT READY` and is outside this phase.

- authorized Git repository, protected branch, reviewed commit and signed immutable release tag;
- production domain, DNS, TLS, WAF/rate-limit and security-header proof;
- dedicated production identities and secret rotation independent of beta;
- production PostgreSQL/Redis/object storage sizing, HA, encryption and disaster recovery;
- production email reputation, suppression/bounce/complaint handling and deliverability;
- live commerce/signature provider contracts, reconciliation and financial controls;
- finalized terms, privacy notice, DPA/vendor review, consent and deletion obligations;
- complete load/capacity/soak testing and SLO/error-budget ownership;
- 24/7 monitoring, tracing, routed alerts, on-call and incident communications;
- automated off-host backups and repeated isolated restore with accepted RPO/RTO;
- support staffing, escalation, status page and customer communication process;
- removal of beta/test accounts, sandbox labels and beta-only feature flags;
- closed critical/high security issues and accepted dependency risk;
- controlled beta success metrics and qualitative feedback reviewed by accountable owners.

Passing a local or controlled-beta gate must never rewrite this document to READY.
