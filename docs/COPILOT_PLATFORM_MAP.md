# Harta platformei pentru Copilot

Acest document este generat din rutele Next.js și controllerele API. Nu edita manual; rulează `pnpm copilot:map`.

## Regula de acoperire

O suprafață nu este considerată controlabilă până când operația are adaptor explicit, schemă validată, verificare de capabilitate, politică de aprobare, idempotency, audit și teste. Clasificările sunt exhaustive: `ACTIVE`, `READ_ONLY`, `GUIDE_ONLY` sau `INTENTIONALLY_UNSUPPORTED`.

## Rezumat

- Pagini: **83**
- Operații API: **690**
- Domenii API: **129**
- Operații executabile prin propunere: **44**
- Operații disponibile pentru citire contextuală: **231**
- Operații explicate, dar neexecutate direct: **357**
- Operații excluse intenționat: **58**
- Operații neclasificate: **0**
- Operații de citire candidate: **247**
- Modificări numai prin propunere/aprobare: **401**
- Operații doar ghidate, fără execuție directă: **42**

## Domenii API

| Domeniu                             | Rute | Citire | Propunere | Doar ghidare | Capabilități declarate                                                                                                                                                                                                         |
| ----------------------------------- | ---: | -----: | --------: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| accommodation-discovery             |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| accommodation-properties            |    8 |      2 |         6 |            0 | accommodation.write                                                                                                                                                                                                            |
| accommodation-recommendations       |    7 |      1 |         6 |            0 | accommodation.publish, accommodation.write                                                                                                                                                                                     |
| accommodation-requests              |    2 |      1 |         1 |            0 | accommodation.write                                                                                                                                                                                                            |
| accommodation-stays                 |    8 |      2 |         6 |            0 | accommodation.assign, accommodation.export, accommodation.publish, accommodation.write                                                                                                                                         |
| activity                            |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| activity-exports                    |    1 |      0 |         1 |            0 | —                                                                                                                                                                                                                              |
| allergy-issues                      |    2 |      1 |         1 |            0 | menu.read_allergies, menu.resolve_allergies                                                                                                                                                                                    |
| auth                                |   13 |      2 |         8 |            3 | —                                                                                                                                                                                                                              |
| automation-executions               |    3 |      2 |         1 |            0 | automation.approve, automation.view_executions                                                                                                                                                                                 |
| automation-rules                    |    6 |      3 |         3 |            0 | automation.execute, automation.read, automation.write                                                                                                                                                                          |
| automation-templates                |    1 |      1 |         0 |            0 | automation.read                                                                                                                                                                                                                |
| automations                         |    8 |      2 |         6 |            0 | automation.activate, automation.execute, automation.pause, automation.read, automation.write                                                                                                                                   |
| beta                                |    8 |      3 |         5 |            0 | —                                                                                                                                                                                                                              |
| billing                             |    3 |      1 |         2 |            0 | workspace.billing.manage, workspace.billing.read                                                                                                                                                                               |
| bookings                            |    4 |      2 |         2 |            0 | booking.read, booking.transition, booking.write                                                                                                                                                                                |
| bootstrap                           |    1 |      1 |         0 |            0 | workspace.read                                                                                                                                                                                                                 |
| budget                              |   11 |      4 |         7 |            0 | budget.read, budget.write                                                                                                                                                                                                      |
| calendar-events                     |    5 |      2 |         3 |            0 | calendar.read, calendar.write                                                                                                                                                                                                  |
| calendar.ics                        |    1 |      1 |         0 |            0 | calendar.read                                                                                                                                                                                                                  |
| campaigns                           |    9 |      5 |         4 |            0 | campaign.read, campaign.send, campaign.view_delivery, campaign.write                                                                                                                                                           |
| catering-exports                    |    1 |      0 |         1 |            0 | menu.export                                                                                                                                                                                                                    |
| check-in                            |   18 |      3 |         4 |           11 | check_in.manage_devices, check_in.manage_sessions, check_in.offline_sync, check_in.read, check_in.write                                                                                                                        |
| commercial-exports                  |    1 |      0 |         1 |            0 | budget.export                                                                                                                                                                                                                  |
| contingency-plans                   |   10 |      2 |         8 |            0 | contingency.activate, contingency.approve, contingency.complete, contingency.read, contingency.write                                                                                                                           |
| contracts                           |   11 |      4 |         6 |            1 | contract.acknowledge, contract.export, contract.read, contract.review, contract.write, signature.create                                                                                                                        |
| copilot                             |   24 |      8 |        16 |            0 | copilot.create_proposal, copilot.execute_proposals, copilot.read, copilot.review_proposals, copilot.use, workspace.update                                                                                                      |
| creative-state                      |    2 |      1 |         1 |            0 | invitation.read, invitation.write                                                                                                                                                                                              |
| dashboard                           |    1 |      1 |         0 |            0 | planning.read                                                                                                                                                                                                                  |
| data-exports                        |    1 |      0 |         1 |            0 | —                                                                                                                                                                                                                              |
| deletion-requests                   |    1 |      0 |         0 |            1 | —                                                                                                                                                                                                                              |
| document-folders                    |    4 |      1 |         3 |            0 | —                                                                                                                                                                                                                              |
| documents                           |   12 |      4 |         8 |            0 | —                                                                                                                                                                                                                              |
| event-day                           |   36 |      9 |        27 |            0 | announcement.publish, announcement.read, announcement.write, incident.read, incident.resolve, incident.write, wedding_day.go_live, wedding_day.manage_contacts, wedding_day.publish, wedding_day.transition, wedding_day.write |
| event-day-exports                   |    1 |      0 |         1 |            0 | —                                                                                                                                                                                                                              |
| expenses                            |    4 |      1 |         3 |            0 | expense.read, expense.write                                                                                                                                                                                                    |
| galleries                           |    6 |      1 |         5 |            0 | gallery.publish, gallery.read, gallery.write                                                                                                                                                                                   |
| guest                               |   15 |      9 |         6 |            0 | —                                                                                                                                                                                                                              |
| guest-bulk-commands                 |    1 |      0 |         1 |            0 | guest.write                                                                                                                                                                                                                    |
| guest-exports                       |    1 |      0 |         1 |            0 | guest.export                                                                                                                                                                                                                   |
| guest-imports                       |    6 |      2 |         4 |            0 | guest.import                                                                                                                                                                                                                   |
| guest-menu-selections               |    2 |      1 |         1 |            0 | menu.read, menu.write                                                                                                                                                                                                          |
| guest-moments                       |    3 |      2 |         1 |            0 | guest_moment.moderate, guest_moment.read                                                                                                                                                                                       |
| guest-tags                          |    4 |      1 |         3 |            0 | guest.write                                                                                                                                                                                                                    |
| guests                              |    5 |      2 |         3 |            0 | guest.archive, guest.write                                                                                                                                                                                                     |
| health                              |    2 |      2 |         0 |            0 | —                                                                                                                                                                                                                              |
| households                          |    5 |      2 |         3 |            0 | guest.archive, guest.write                                                                                                                                                                                                     |
| internal                            |    2 |      1 |         1 |            0 | signature.read                                                                                                                                                                                                                 |
| invitation-media                    |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| invitation-recipients               |    5 |      2 |         3 |            0 | invitation.manage_recipients                                                                                                                                                                                                   |
| invitation-site                     |   14 |      5 |         9 |            0 | invitation.publish, invitation.write                                                                                                                                                                                           |
| jobs                                |    2 |      2 |         0 |            0 | —                                                                                                                                                                                                                              |
| marketplace                         |    5 |      5 |         0 |            0 | —                                                                                                                                                                                                                              |
| me                                  |   25 |      9 |         8 |            8 | —                                                                                                                                                                                                                              |
| members                             |    3 |      1 |         2 |            0 | team.read, team.remove, team.update_role                                                                                                                                                                                       |
| menus                               |    5 |      2 |         3 |            0 | menu.read, menu.write                                                                                                                                                                                                          |
| milestones                          |    3 |      0 |         3 |            0 | timeline.write                                                                                                                                                                                                                 |
| notifications                       |    5 |      2 |         3 |            0 | workspace.read                                                                                                                                                                                                                 |
| offers                              |    5 |      3 |         2 |            0 | offer.read, offer.request_revision, offer.review                                                                                                                                                                               |
| onboarding                          |    3 |      1 |         2 |            0 | —                                                                                                                                                                                                                              |
| online-payment-refunds              |    2 |      2 |         0 |            0 | —                                                                                                                                                                                                                              |
| online-payment-transactions         |    3 |      2 |         1 |            0 | online_payment.request_refund                                                                                                                                                                                                  |
| payment-checkouts                   |    5 |      2 |         3 |            0 | online_payment.create_checkout, online_payment.expire_checkout                                                                                                                                                                 |
| payment-schedules                   |    4 |      1 |         3 |            0 | payment.read, payment.write                                                                                                                                                                                                    |
| payments                            |    5 |      2 |         3 |            0 | payment.confirm, payment.read, payment.write                                                                                                                                                                                   |
| plan-generations                    |    1 |      0 |         1 |            0 | planning.generate                                                                                                                                                                                                              |
| plan-proposals                      |    5 |      2 |         3 |            0 | planning.apply, planning.write                                                                                                                                                                                                 |
| planning-exports                    |    1 |      0 |         1 |            0 | planning.read                                                                                                                                                                                                                  |
| platform                            |   76 |     35 |        37 |            4 | —                                                                                                                                                                                                                              |
| provider-webhooks                   |    2 |      0 |         2 |            0 | —                                                                                                                                                                                                                              |
| public                              |    2 |      2 |         0 |            0 | —                                                                                                                                                                                                                              |
| public-aggregate-consent            |    2 |      1 |         1 |            0 | workspace.manage_public_aggregation                                                                                                                                                                                            |
| review-eligibilities                |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| reviews                             |    7 |      1 |         6 |            0 | review.publish, review.report, review.withdraw, review.write                                                                                                                                                                   |
| rfqs                                |   10 |      5 |         5 |            0 | offer.read, rfq.read, rfq.send, rfq.write                                                                                                                                                                                      |
| risk-detections                     |    1 |      0 |         1 |            0 | risk.detect                                                                                                                                                                                                                    |
| risks                               |    8 |      2 |         6 |            0 | risk.assess, risk.read, risk.write                                                                                                                                                                                             |
| rsvp-dashboard                      |    1 |      1 |         0 |            0 | rsvp.read                                                                                                                                                                                                                      |
| rsvp-form                           |    3 |      1 |         2 |            0 | rsvp.configure, rsvp.read                                                                                                                                                                                                      |
| rsvp-submissions                    |    1 |      0 |         1 |            0 | rsvp.override                                                                                                                                                                                                                  |
| search                              |    1 |      1 |         0 |            0 | planning.read                                                                                                                                                                                                                  |
| seating-plans                       |   26 |      5 |        21 |            0 | seating.assign, seating.export, seating.generate_suggestion, seating.publish, seating.write                                                                                                                                    |
| signature-envelopes                 |    9 |      4 |         0 |            5 | signature.cancel, signature.create, signature.download_evidence, signature.send, signature.sign                                                                                                                                |
| signature-signing-sessions          |    2 |      0 |         0 |            2 | —                                                                                                                                                                                                                              |
| status                              |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| tasks                               |   15 |      3 |        12 |            0 | task.delete, task.read, task.write                                                                                                                                                                                             |
| team-invitations                    |    6 |      1 |         5 |            0 | team.invite                                                                                                                                                                                                                    |
| timeline                            |    1 |      1 |         0 |            0 | timeline.read                                                                                                                                                                                                                  |
| timeline-recalculations             |    1 |      0 |         1 |            0 | timeline.recalculate                                                                                                                                                                                                           |
| transport-plans                     |   14 |      2 |        12 |            0 | transport.assign, transport.export, transport.publish, transport.write                                                                                                                                                         |
| transport-requests                  |    2 |      1 |         1 |            0 | transport.write                                                                                                                                                                                                                |
| transport-stops                     |    4 |      1 |         3 |            0 | transport.write                                                                                                                                                                                                                |
| uploads                             |    4 |      1 |         3 |            0 | —                                                                                                                                                                                                                              |
| vendor-availability                 |    4 |      1 |         3 |            0 | —                                                                                                                                                                                                                              |
| vendor-balance                      |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-bookings                     |    3 |      2 |         1 |            0 | —                                                                                                                                                                                                                              |
| vendor-contracts                    |    7 |      3 |         4 |            0 | signature.read                                                                                                                                                                                                                 |
| vendor-data-exports                 |    1 |      0 |         1 |            0 | —                                                                                                                                                                                                                              |
| vendor-deletion-requests            |    1 |      0 |         0 |            1 | —                                                                                                                                                                                                                              |
| vendor-entitlements                 |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-favorites                    |    3 |      1 |         2 |            0 | marketplace.favorite                                                                                                                                                                                                           |
| vendor-invitations                  |    6 |      0 |         6 |            0 | —                                                                                                                                                                                                                              |
| vendor-members                      |    3 |      1 |         2 |            0 | —                                                                                                                                                                                                                              |
| vendor-offers                       |    6 |      2 |         4 |            0 | —                                                                                                                                                                                                                              |
| vendor-organizations                |    5 |      2 |         3 |            0 | —                                                                                                                                                                                                                              |
| vendor-packages                     |    2 |      0 |         2 |            0 | —                                                                                                                                                                                                                              |
| vendor-payout-account               |    2 |      1 |         0 |            1 | —                                                                                                                                                                                                                              |
| vendor-payout-onboarding-links      |    1 |      0 |         0 |            1 | —                                                                                                                                                                                                                              |
| vendor-payouts                      |    2 |      2 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-portfolio-assets             |    2 |      1 |         1 |            0 | —                                                                                                                                                                                                                              |
| vendor-profile                      |    4 |      1 |         3 |            0 | —                                                                                                                                                                                                                              |
| vendor-review-disputes              |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-reviews                      |    5 |      2 |         3 |            0 | —                                                                                                                                                                                                                              |
| vendor-rfqs                         |    5 |      2 |         3 |            0 | —                                                                                                                                                                                                                              |
| vendor-search                       |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-services                     |    5 |      1 |         4 |            0 | —                                                                                                                                                                                                                              |
| vendor-settlements                  |    3 |      2 |         0 |            1 | —                                                                                                                                                                                                                              |
| vendor-shortlists                   |    6 |      1 |         5 |            0 | marketplace.shortlist                                                                                                                                                                                                          |
| vendor-signature-envelopes          |    2 |      1 |         0 |            1 | online_payment.read                                                                                                                                                                                                            |
| vendor-subscription                 |    3 |      1 |         2 |            0 | —                                                                                                                                                                                                                              |
| vendor-subscription-checkouts       |    1 |      0 |         1 |            0 | —                                                                                                                                                                                                                              |
| vendor-subscription-plans           |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-subscription-portal-sessions |    1 |      0 |         0 |            1 | —                                                                                                                                                                                                                              |
| vendor-trust-monetization-overview  |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| vendor-usage                        |    1 |      1 |         0 |            0 | —                                                                                                                                                                                                                              |
| venue-spaces                        |    5 |      2 |         3 |            0 | seating.write                                                                                                                                                                                                                  |
| webhooks                            |    6 |      0 |         5 |            1 | —                                                                                                                                                                                                                              |
| weekly-digests                      |    2 |      1 |         1 |            0 | copilot.read, copilot.use                                                                                                                                                                                                      |
| workspaces                          |    3 |      1 |         2 |            0 | workspace.update                                                                                                                                                                                                               |

## Suprafețe UI

| Rută                            | Persona    | Stare adaptor contextual  |
| ------------------------------- | ---------- | ------------------------- |
| /                               | public     | INTENTIONALLY_UNSUPPORTED |
| /access-denied                  | organizer  | GUIDE_ONLY                |
| /accommodation                  | organizer  | GUIDE_ONLY                |
| /activity                       | organizer  | GUIDE_ONLY                |
| /admin                          | platform   | GUIDE_ONLY                |
| /admin/:section                 | platform   | GUIDE_ONLY                |
| /admin/beta                     | platform   | GUIDE_ONLY                |
| /admin/trust                    | platform   | GUIDE_ONLY                |
| /archive                        | organizer  | GUIDE_ONLY                |
| /automations                    | organizer  | GUIDE_ONLY                |
| /beta                           | organizer  | GUIDE_ONLY                |
| /beta-invitation                | organizer  | GUIDE_ONLY                |
| /beta/feedback/:id              | organizer  | GUIDE_ONLY                |
| /beta/known-issues              | organizer  | GUIDE_ONLY                |
| /bookings                       | organizer  | GUIDE_ONLY                |
| /budget                         | organizer  | GUIDE_ONLY                |
| /calendar                       | organizer  | GUIDE_ONLY                |
| /checkout                       | organizer  | GUIDE_ONLY                |
| /confidentialitate              | organizer  | GUIDE_ONLY                |
| /contingency-plans              | organizer  | GUIDE_ONLY                |
| /contingency-plans/:id          | organizer  | GUIDE_ONLY                |
| /contracts                      | organizer  | GUIDE_ONLY                |
| /cookies                        | organizer  | GUIDE_ONLY                |
| /create-account                 | organizer  | GUIDE_ONLY                |
| /design-studio                  | organizer  | GUIDE_ONLY                |
| /documents                      | organizer  | GUIDE_ONLY                |
| /event-day                      | organizer  | GUIDE_ONLY                |
| /expired-link                   | organizer  | GUIDE_ONLY                |
| /favorites                      | organizer  | GUIDE_ONLY                |
| /forgot-password                | public     | INTENTIONALLY_UNSUPPORTED |
| /guest                          | guest      | READ_ONLY                 |
| /guests                         | organizer  | GUIDE_ONLY                |
| /invitation                     | organizer  | GUIDE_ONLY                |
| /invitations                    | organizer  | GUIDE_ONLY                |
| /invitations/editor             | organizer  | GUIDE_ONLY                |
| /magic-link                     | organizer  | GUIDE_ONLY                |
| /marketplace                    | organizer  | GUIDE_ONLY                |
| /marketplace/:id                | organizer  | GUIDE_ONLY                |
| /menus                          | organizer  | GUIDE_ONLY                |
| /moments                        | organizer  | GUIDE_ONLY                |
| /moodboards                     | organizer  | GUIDE_ONLY                |
| /offers                         | organizer  | GUIDE_ONLY                |
| /onboarding                     | onboarding | GUIDE_ONLY                |
| /overview                       | organizer  | GUIDE_ONLY                |
| /payments                       | organizer  | GUIDE_ONLY                |
| /plan                           | organizer  | GUIDE_ONLY                |
| /post-event                     | organizer  | GUIDE_ONLY                |
| /post-wedding                   | organizer  | GUIDE_ONLY                |
| /privacy                        | organizer  | GUIDE_ONLY                |
| /provider/checkout/:checkoutId  | organizer  | GUIDE_ONLY                |
| /provider/signature/:envelopeId | organizer  | GUIDE_ONLY                |
| /rambursari                     | organizer  | GUIDE_ONLY                |
| /requests                       | organizer  | GUIDE_ONLY                |
| /reset-password                 | public     | INTENTIONALLY_UNSUPPORTED |
| /reviews                        | organizer  | GUIDE_ONLY                |
| /risks                          | organizer  | GUIDE_ONLY                |
| /risks/:id                      | organizer  | GUIDE_ONLY                |
| /rsvp                           | organizer  | GUIDE_ONLY                |
| /seating                        | organizer  | GUIDE_ONLY                |
| /session-expired                | organizer  | GUIDE_ONLY                |
| /settings                       | organizer  | GUIDE_ONLY                |
| /shortlists                     | organizer  | GUIDE_ONLY                |
| /sign-in                        | public     | INTENTIONALLY_UNSUPPORTED |
| /start                          | organizer  | GUIDE_ONLY                |
| /team                           | organizer  | GUIDE_ONLY                |
| /termeni                        | organizer  | GUIDE_ONLY                |
| /terms                          | organizer  | GUIDE_ONLY                |
| /timeline                       | organizer  | GUIDE_ONLY                |
| /tools                          | organizer  | GUIDE_ONLY                |
| /transport                      | organizer  | GUIDE_ONLY                |
| /vendor                         | vendor     | GUIDE_ONLY                |
| /vendor-invitation              | vendor     | GUIDE_ONLY                |
| /vendor/billing                 | vendor     | GUIDE_ONLY                |
| /vendor/bookings                | vendor     | GUIDE_ONLY                |
| /vendor/contracts               | vendor     | GUIDE_ONLY                |
| /vendor/offers                  | vendor     | GUIDE_ONLY                |
| /vendor/payouts                 | vendor     | GUIDE_ONLY                |
| /vendor/profile                 | vendor     | GUIDE_ONLY                |
| /vendor/requests                | vendor     | GUIDE_ONLY                |
| /vendor/reviews                 | vendor     | GUIDE_ONLY                |
| /vendor/services                | vendor     | GUIDE_ONLY                |
| /verify-email                   | public     | INTENTIONALLY_UNSUPPORTED |
| /wedding-day                    | organizer  | GUIDE_ONLY                |
