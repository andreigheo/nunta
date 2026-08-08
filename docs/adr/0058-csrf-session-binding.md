# ADR 0058: Explicit session-bound CSRF

Status: accepted

Cookie-authenticated unsafe requests require `X-CSRF-Token`. The API issues a random, expiring token signed with the session secret and bound to the current session token hash. Login/renewal changes the binding; logout or revocation makes the token unusable. The browser client keeps the token in memory and retries once after an explicit CSRF rotation error. Signed provider webhooks and guest opaque-token flows use their own authentication and are not treated as cookie sessions.
