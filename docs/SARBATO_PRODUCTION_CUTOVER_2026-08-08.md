# Sarbato production cutover — 2026-08-08

## Outcome

Release `20260808T071110Z` is live on `https://sarbato.space` on the fresh VPS.
`https://www.sarbato.space` redirects permanently to the canonical root domain.
The Let's Encrypt certificate covers both names and renews automatically.

## Runtime

- Nginx terminates TLS and exposes only ports 80 and 443.
- Next.js web: `127.0.0.1:43221`.
- NestJS API: `127.0.0.1:43222`.
- Resend inbound relay: `127.0.0.1:43211`.
- MinIO: `127.0.0.1:43223`.
- PostgreSQL, Redis TLS, ClamAV and the worker remain private in Docker.
- The database identity is `production/production` and the API readiness gate
  verifies the database, reference data, Redis and worker heartbeat.

## Providers

- Resend domain `sarbato.space`: verified in `eu-west-1`.
- Inbound webhook: `email.received` at
  `https://sarbato.space/api/v1/webhooks/resend`.
- Paddle workspace billing: live production environment.
- Plus: `7 EUR/month`; Pro: `17 EUR/month`.
- Paddle webhook: `https://sarbato.space/api/v1/webhooks/paddle`.
- Couple-to-vendor payments, payouts, vendor subscriptions and electronic
  signatures remain deliberately disabled.

## Verification

- Production Compose configuration: valid.
- Resend relay tests: `5/5` passed.
- Production image build: passed; `76` Next.js routes generated.
- Public landing, checkout and sign-in: `200`.
- Public API status: `200 OPERATIONAL`.
- API readiness: `ready`, including healthy worker and verified identity.
- `/beta`: `404`.
- Unsigned Paddle webhook: rejected with `401`.
- Unsigned Resend webhook: rejected with `400`.
- Paddle public client configuration: enabled in `production`.
- Security headers and HSTS: present.

## Backups and remaining acceptance

Encrypted backup `20260808T072215Z` was created and verified. The daily timer
is enabled. Its current destination is still on the same VPS (`offHost: false`),
so an off-host destination is required for full disaster recovery.

A real registration/email-verification journey and a real Paddle checkout are
not executed automatically because they send email or create a financial
transaction. They require an explicitly approved recipient or purchase.
