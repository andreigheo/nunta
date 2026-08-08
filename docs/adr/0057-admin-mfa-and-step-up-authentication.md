# ADR 0057: Admin MFA and purpose-bound step-up

Status: accepted

Critical platform roles require a confirmed TOTP authenticator. Secrets are encrypted, never logged, and recovery codes are stored only as one-way hashes. Critical mutations require recent password reauthentication plus TOTP or a one-time recovery code. The resulting step-up record is bound to the user, current session, authenticator and an explicit purpose, expires after ten minutes and is revocable. A platform grant alone never satisfies this control.
