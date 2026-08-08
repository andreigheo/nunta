# Sarbato production stack

This stack is private by default. Web, API, Resend relay, and object storage
bind only to loopback ports `43221`, `43222`, `43211`, and `43223`. Public traffic is switched in
Nginx only after migrations, health checks, authentication, and smoke tests
pass.

Required secrets live in `/etc/sarbato-production.env` on the server. Resend's
API key is bootstrapped from `/etc/sarbato-resend-smtp-password`; neither file
belongs in the repository. The inbound relay runs as a read-only Compose
service with a dedicated persistent event-journal volume.

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

Production cutover details and the current acceptance boundary are recorded in
`docs/SARBATO_PRODUCTION_CUTOVER_2026-08-08.md`.
