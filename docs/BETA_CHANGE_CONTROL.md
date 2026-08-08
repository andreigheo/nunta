# Controlled Beta change control

## Classes

| Class  | Use                                                     | Required evidence                                                                                                        |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Hotfix | P0 security, privacy, data-loss or total-access blocker | issue owner, scoped diff, targeted regression, full beta gate where feasible, backup/rollback confirmation, incident log |
| Patch  | compatible bug, copy or operational correction          | linked feedback, test update, full beta gate, known-issues/release note                                                  |
| Minor  | compatible beta capability change                       | explicit scope approval, privacy/security review, migration/rollback plan, full gate and bounded cohort rollout          |

## Required record

Each change records release identifier, source manifest checksum, author/operator, reason, affected cohort, migration name, test artifact, security result, backup evidence, rollback instruction and participant communication impact. Without an authorized Git repository, the source manifest remains `SOURCE_SNAPSHOT_ONLY`; no commit or tag is fabricated.

## Stop conditions

Freeze invitations and participant activation on any P0, unverified backup, failed restore rehearsal, alert-route failure, identity mismatch, credential crossover, unresolved critical feedback, security-gate failure or loss of release provenance. Rollback is favored over forward-fixing when data integrity or access isolation is uncertain.
