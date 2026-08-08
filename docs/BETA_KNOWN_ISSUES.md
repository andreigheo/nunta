# Controlled Beta known issues

| ID       | State                    | Impact                                                                                            | Mitigation / owner condition                                                          |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| BETA-001 | Blocker                  | No configured external beta domain or TLS proof                                                   | Do not send invitations; configure a real domain and verify public/private routes     |
| BETA-002 | Blocker                  | No authorized Git repository, commit or signed release tag                                        | Keep `SOURCE_SNAPSHOT_ONLY`; obtain explicit authorization before initialization/push |
| BETA-003 | Blocker                  | External PostgreSQL, Redis, object storage, email, alert and backup providers are not provisioned | Use dedicated beta credentials and complete the runbook evidence                      |
| BETA-004 | Blocker                  | Beta terms and privacy notice are DRAFT                                                           | Professional legal/privacy review before external acceptance                          |
| BETA-005 | Open                     | External capacity for authentication, SSE, uploads, worker and outbox is not measured             | Run the seeded bounded capacity suite in the isolated beta environment                |
| BETA-006 | Accepted beta limitation | Commerce and signature providers must be sandbox-only                                             | Label sandbox in UI; never enter real payment/payout data                             |
| BETA-007 | Open dependency risk     | One moderate transitive `uuid@8.3.2` advisory remains through ExcelJS                             | Track upstream remediation; no critical/high advisory is accepted                     |
| BETA-008 | Local-only evidence      | The latest verified backup/restore, staging-like, rollback and tracing evidence is local          | Repeat all checks externally; do not reuse local proof as external proof              |

Participant-facing limitations are also visible at `/beta/known-issues`. This table is the operator source and must be updated with every patch release.
