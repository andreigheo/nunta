# ADR 0002: Authentication and session model

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 1 authentication

## Context

The frontend contains complete-looking authentication screens, but they currently use timers, hard-coded identities, and demo branches. Slice 1 requires real registration, email verification, password reset, magic links, revocable sessions, and a safe foundation for MFA.

## Decision

### Credentials and identities

`User` owns account state and normalized email. `Identity` stores provider-specific authentication data. Password identities use Argon2id hashes; the API never logs or returns credential hashes. The schema supports additional providers without changing `User`.

### Sessions

Successful password or magic-link authentication creates an opaque, cryptographically random session token. Only its SHA-256 hash is stored in `Session`. The raw token is sent once in the `weddingos_session` cookie with:

- `HttpOnly`;
- `Secure` in production;
- `SameSite=Lax`;
- `Path=/`;
- a short idle/absolute lifetime by default and a longer absolute lifetime when `remember=true`.

The token is rotated on authentication. Logout and per-device revocation set `revokedAt`. Every protected request checks expiry, revocation, user state, and current membership. Revoking a workspace membership does not end the global session, but immediately removes access to that workspace.

State-changing cookie-authenticated requests are protected through trusted origin validation. CORS is an explicit allow-list and credentials are enabled only for `WEB_URL`. Requests from non-browser clients can use the same cookie but must provide an allowed origin when an Origin header exists.

### One-time tokens

Verification, password-reset, magic-link, invitation, and MFA challenge secrets are high-entropy values stored only as SHA-256 hashes. The records include purpose, expiry, consumed/revoked timestamps, and attempt metadata. Exchanges are transactional and one-time. Resend rotates the previous active token.

Email verification also supports a six-digit human code. The code is generated randomly, is stored hashed with the token purpose and user binding, expires quickly, and has an attempt limit. Public request endpoints return neutral responses to prevent account enumeration.

Password reset consumes the reset token, changes the Argon2id credential, revokes all existing sessions, writes an audit event, and sends a security notification.

Magic links are implemented behind `FEATURE_MAGIC_LINK_ENABLED`. When disabled, the API returns a stable feature-disabled problem; the UI does not show false success.

### MFA foundation

The data and contract model supports challenges and verification, but MFA is disabled by default for Slice 1. No UI claims enrollment is active. Full admin MFA is outside this slice.

### Audit and redaction

Registration, verification, sign-in success/failure, sign-out, session revocation, reset, magic-link exchange, and MFA challenge activity produce security audit events. Logs and audit metadata exclude passwords, raw tokens, cookies, secrets, and complete sensitive payloads.

## Consequences

- Stolen database rows are not immediately usable as sessions or one-time links.
- Session lookups require one indexed hash lookup per protected request.
- Cookie-based auth keeps credentials out of browser storage and requires explicit origin/CORS controls.
- Password reset invalidates all devices, which favors safety over convenience.
