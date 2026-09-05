# Sarbato production stack

This stack is private by default. Web, API, Resend relay, and object storage
bind only to loopback ports `43221`, `43222`, `43211`, and `43223`. Public traffic is switched in
Nginx only after migrations, health checks, authentication, and smoke tests
pass.

Invitation Studio V2 migration `20260812120000_invitation_studio_v2` is an
application/database rollback boundary. Once applied, do not restart the
previous API against the migrated database: its guest-media path does not set
the object-scoped RLS context introduced by V2. Keep traffic closed until the
new invitation/media/RSVP probes pass. A failed pre-reopen cutover must restore
the exact verified pre-deploy database and object backup before the previous
release is started; after accepting new writes, use a reviewed forward repair.

Required secrets live in `/etc/sarbato-production.env` on the server. Resend's
API key is bootstrapped from `/etc/sarbato-resend-smtp-password`; neither file
belongs in the repository. The inbound relay runs as a read-only Compose
service with a dedicated persistent event-journal volume.

`GUEST_ACCESS_TOKEN_SECRET` is a dedicated random secret used only to derive
retry-stable guest links for one campaign-recipient generation. It must not be
reused as `OUTBOX_ENCRYPTION_KEY`; the bootstrap script adds it to older
environment files without printing it.

Object storage uses separate identities. `STORAGE_ROOT_ACCESS_KEY` and
`STORAGE_ROOT_SECRET_KEY` are used only by MinIO and the one-shot bootstrap
container. The API and worker receive the restricted `STORAGE_ACCESS_KEY` and
`STORAGE_SECRET_KEY` identity, scoped to `sarbato-production-private` by
`storage-app-policy.json`. Running `bootstrap-secrets.sh` once adds missing root
credentials to an older environment file without printing them; deploy the
storage service and `storage-init` together so the former root identity is
re-created as the restricted application user before API and worker start.

The following production features intentionally fail closed until a real
provider is configured:

- couple-to-vendor payments and payouts;
- vendor subscriptions;
- electronic signatures.

Paddle workspace billing is enabled only through the live credentials and
price IDs stored in `/etc/sarbato-production.env`. Couple-to-vendor payments
remain disabled and are not part of this integration.

The free plan and all persistent planning modules can operate without those
providers.

Accommodation discovery is informational and never creates or processes a
booking. The default adapter reads public OpenStreetMap data through Nominatim
and Overpass with server-side throttling, bounded queries, attribution, and a
database cache. Configure `ACCOMMODATION_NOMINATIM_URL` and
`ACCOMMODATION_OVERPASS_URL` to self-hosted or contracted endpoints before the
feature receives sustained production traffic; the public endpoints are shared
community infrastructure, not a hotel inventory or pricing service.

Production cutover details and the current acceptance boundary are recorded in
`docs/SARBATO_PRODUCTION_CUTOVER_2026-08-08.md`.

## Backup, restore and monitoring

`sarbato-backup.timer` creates and verifies an encrypted database and object
backup every day. Set `BACKUP_OFFHOST_REMOTE` in `/etc/sarbato-backup.env` to an
rclone destination and install/configure rclone under root; the uploader uses
immutable copy plus checksum verification. Set `BACKUP_REQUIRE_OFFHOST=true`
only after the remote has been proven. Without those two settings the backup is
truthfully reported as local and remains a disaster-recovery gate.

`sarbato-restore-drill.timer` restores the freshest verified backup every month
into the guarded `weddingos_restore_production_drill` database and a temporary
object directory. Evidence is stored under
`/var/backups/sarbato/restore-evidence` without application data.

`sarbato-monitor.timer` checks internal readiness, public status, container
state, disk pressure and backup freshness every five minutes. Failures are sent
through the configured Resend SMTP account to `FORWARD_TO_EMAIL`. A controlled
delivery test can be run with `SARBATO_MONITOR_FORCE_FAILURE=true`; it exits
non-zero after sending the test alert.
