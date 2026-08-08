# Sarbato production cutover — 2026-07-31

## Outcome

Sarbato is publicly served from `https://sarbato.space` by release
`20260731T054644Z`. The production runtime is fail-closed: demo and beta routes
return `404`, unsupported providers are disabled, and the marketing surface
labels paid plans as coming soon instead of opening a fake checkout.

## Runtime

- Nginx terminates TLS and proxies the public app to loopback.
- Next.js web: `127.0.0.1:43221`
- NestJS API: `127.0.0.1:43222`
- MinIO: `127.0.0.1:43223`
- Resend inbound relay: `127.0.0.1:43211`
- PostgreSQL, Redis TLS, ClamAV and the domain-event worker remain private in
  the Docker network.
- `/api/v1/webhooks/resend` remains owned by the inbound relay.
- Signed object URLs use
  `https://sarbato.space/sarbato-production-private/<object>`; Nginx preserves
  the signed path when proxying it to MinIO.

## Verification evidence

- Lint: passed.
- TypeScript: passed.
- API unit tests: `203/203`.
- Full unit suite before cutover: `257/257`.
- Production build: passed, `74` Next.js pages generated.
- Public route smoke: `65/65` passed.
- Public API status: `200 OPERATIONAL`.
- Public landing and sign-in: `200`.
- `/beta`: `404`.
- Resend relay `/health`: `200`.
- Unsigned Resend webhook request: rejected with `400`.
- Signed production storage: PUT, GET and DELETE passed through the public
  domain.
- Authentication validation: malformed registration `400`; invalid login
  `401`, without creating a user or sending email.
- Production database after smoke: `0` users, `0` workspaces.
- Security headers include CSP without development loopback origins, HSTS,
  frame denial and strict referrer policy.

## Backup state

An encrypted database plus MinIO snapshot was created and verified:

- run: `20260731T064518Z`
- database archive checksum verified;
- object archive included and verified;
- daily systemd timer enabled.

The current destination is a separate directory on the same VPS and is
explicitly recorded as `offHost: false`. This protects against an application
or logical data incident, but not total VPS/disk loss. An external destination
is still required before disaster recovery can be called complete.

## Intentionally unavailable

- Paddle workspace billing. Free is available; Plus `7 EUR/month` and Pro
  `17 EUR/month` remain labelled as coming soon.
- Couple-to-vendor payments and payouts.
- Vendor subscriptions.
- Electronic signatures.

These integrations fail closed and do not emit simulated success.

## Remaining live acceptance

One real registration/login/email-verification journey must be run with an
approved recipient. It will send a real transactional email through Resend, so
the exact recipient and action require explicit confirmation before execution.

Paddle production credentials, price IDs and webhook verification are required
before the paid plans can be enabled.
