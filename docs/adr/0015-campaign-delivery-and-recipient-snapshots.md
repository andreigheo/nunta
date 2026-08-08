# ADR 0015: Campaign delivery and recipient snapshots

- Status: Accepted
- Date: 2026-07-18
- Slice: 3

## Context

Invitation creation, provider acceptance, provider delivery, invitation open and RSVP are independent facts. A campaign must survive retries and partial failures without sending successful recipients twice.

## Decision

`Campaign` is an organizer-authored aggregate. Only `EMAIL` is active in Slice 3; WhatsApp, SMS and push remain disabled/planned. On `SEND_NOW` or `SCHEDULE`, the API validates state and contacts, persists an immutable audience snapshot as `CampaignRecipient` rows, creates a user-visible `BackgroundJob`, and commits a durable `campaign.send_requested.v1` outbox intent.

The closed consumer allowlist adds `campaign_fanout`, `campaign_delivery` and `campaign_summary`. Fan-out creates one durable recipient delivery event per campaign recipient using dedupe `campaignId:invitationRecipientId:EMAIL`. Recipient deliveries retry independently. The email consumer records `DeliveryAttempt`; campaign progress is derived from recipient rows. A worker payload never supplies tenant authority: worker context is derived from persisted outbox, execution, campaign and recipient records and cross-checked before work.

`SENT` means the provider accepted the message. `DELIVERED` is written only from an authenticated provider event. Opening the scoped guest link writes `OPENED`. RSVP writes its own states. A signed webhook adapter resolves tenant and recipient from persisted `providerMessageId`, records a deduplicated `ProviderWebhookEvent`, maps supported statuses, and ignores replay. It never trusts workspace data from the webhook payload.

Campaign transitions are state-machine operations with `If-Match` and `Idempotency-Key`. Pause/cancel prevents new delivery claims but does not pretend to retract provider-accepted mail. `RETRY_FAILED` creates intents only for failed recipients. Summary produces one aggregated notification/activity result, not one user-visible notification per recipient.

Delivery remains at-least-once with idempotent effects where supported. We do not claim universal exactly-once provider delivery.

## Consequences

- Provider acceptance, delivery, open and RSVP remain independently queryable.
- Crash recovery covers fan-out, partial completion and provider success before internal acknowledgement.
- Mailpit verifies accepted e-mail only and never fabricates a delivered event.
- Campaign recipient snapshots preserve historic addressing/personalization after guest edits.
