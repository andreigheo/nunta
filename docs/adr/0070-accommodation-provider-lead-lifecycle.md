# ADR 0070: Accommodation provider lead lifecycle

- Status: Accepted
- Date: 2026-09-12
- Extends: ADR 0069

## Context

Sarbato can discover public accommodation data before providers join the
marketplace, but public discovery does not prove availability, price or booking
success. Organizers still need a durable workflow for verifying contact data,
preparing a group inquiry, recording manual outreach and capturing the answer
received from a property.

## Decision

`AccommodationProviderLead` links one saved recommendation to one event-scoped
sourcing workflow. The organizer must record a contact route and a verification
note before marking the lead ready. `AccommodationProviderInquiry` contains only
aggregate group demand: dates, rooms, adults, children, optional budget, subject
and message. It does not include guest names or medical details.

Sarbato prepares inquiries but does not send them automatically in this stage.
After using email, phone, WhatsApp or a contact form outside Sarbato, the
organizer records the outreach as an `AccommodationContactEntry`. A provider
response may record an availability declaration and a quoted total. These fields
are always identified as a declaration captured by the organizer, never as live
inventory or a Sarbato booking confirmation.

Only an explicit organizer action promotes a recommendation into canonical
`AccommodationProperty` and `AccommodationStay` records. Marketplace RFQs remain
separate because an external lead is not silently converted into a registered
vendor organization.

## Consequences

- Lead, inquiry, contact and response history are tenant- and event-scoped.
- Contact logging and provider-response recording are high-risk Copilot actions
  and require explicit approval.
- Guests never receive the internal sourcing history.
- Automated sending, live availability and booking remain disabled until an
  authorized provider integration has credentials, contractual terms,
  attribution rules and provider-specific tests.
