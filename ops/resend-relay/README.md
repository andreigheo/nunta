# Sarbato Resend inbound relay

Production-only webhook receiver for `email.received` events. It verifies the
Resend/Svix signature over the raw request body and forwards only the explicit
Sarbato aliases to the configured owner inbox.

Public route:

```text
POST https://sarbato.space/api/v1/webhooks/resend
```

Allowed aliases:

- `billing@sarbato.space`
- `legal@sarbato.space`
- `support@sarbato.space`

Required runtime variables:

```text
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
FORWARD_TO_EMAIL=
```

Optional variables:

```text
BIND_HOST=127.0.0.1
PORT=43211
FORWARD_FROM_EMAIL=Sarbato Mail <forward@sarbato.space>
ALLOWED_RECIPIENTS=billing@sarbato.space,legal@sarbato.space,support@sarbato.space
EVENT_STORE_DIRECTORY=/var/lib/sarbato-resend-relay/events
```

The Resend API call uses an idempotency key derived from the received email ID
and matched aliases. A local event journal provides durable webhook replay
deduplication after a successful forward.
