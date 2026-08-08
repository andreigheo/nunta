# ADR 0053 — Production security baseline

Status: Accepted — 2026-07-21

## Decision

- Local services remain bound to loopback. Production exposes only a TLS reverse proxy; API, worker, PostgreSQL, Redis, object storage and metrics stay private.
- Cookie-authenticated unsafe browser requests use an origin-bound CSRF contract. Production requires an allowed `Origin` or same-origin `Referer`; provider webhooks are excluded and keep signature, timestamp, raw-body and dedupe protection.
- Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production. CORS is an exact allowlist.
- Web and API responses set CSP, frame denial, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`; HSTS is production-only at the reverse proxy.
- Server-side outbound URLs pass a shared SSRF validator: HTTP(S) only, no credentials, DNS/IP validation, private/link-local/loopback/metadata denial, bounded redirects, timeouts and response sizes.
- Production configuration has no usable secret defaults. Environment, public URLs, provider mode, TLS Redis, storage endpoint, metrics token, backup keys and trusted proxies are validated at startup.
- Logs redact credentials, cookies, tokens, email, phone, raw IP/user-agent, provider payloads, payment references and sensitive domain text.
- Rate limits are purpose-scoped and do not turn ordinary authorization failures into security alerts.

## Limitations

MFA enforcement is implemented as a production gate, but public launch remains blocked until a real enrollment and recovery ceremony is configured and tested.
