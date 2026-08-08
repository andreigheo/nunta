# Sarbato subscription plans

Status: implemented application policy. Paddle is the billing provider for
Sarbato subscriptions only.

## Ownership and access model

The subscription belongs to a workspace (one organized event), not to an
individual account. Every member of that workspace shares the same plan.

Effective access is calculated as:

`role capabilities ∩ workspace plan entitlements`

A plan never promotes a user to a stronger role. For example, a viewer remains
read-only on Pro, and a planner does not gain billing administration.

## Monthly plans

| Entitlement                                 |                      Free |                      Plus |       Pro |
| ------------------------------------------- | ------------------------: | ------------------------: | --------: |
| Price                                       |                        €0 |                  €7/month | €17/month |
| Active guests                               |                        50 |                       200 |       500 |
| Collaborators outside the owner             |                         2 |                         5 |        15 |
| AI actions per calendar month               |                         5 |                        30 |       150 |
| Active automations                          |                         0 |                         5 |        25 |
| Storage                                     |                    250 MB |                      2 GB |     10 GB |
| Plan, calendar, budget, invitation and RSVP |                       Yes |                       Yes |       Yes |
| Invitation studio                           |                       Yes |                       Yes |       Yes |
| Seating, transport and accommodation        | Read-only after downgrade |                       Yes |       Yes |
| Vendor coordination                         | Read-only after downgrade |                       Yes |       Yes |
| Documents and advanced exports              | Read-only after downgrade |                       Yes |       Yes |
| Risks and contingency plans                 | Read-only after downgrade | Read-only after downgrade |       Yes |
| Event-day operations and check-in           | Read-only after downgrade | Read-only after downgrade |       Yes |
| External electronic signatures              | Read-only after downgrade | Read-only after downgrade |       Yes |
| Organizer-vendor payment mediation          |                        No |                        No |        No |

## Roles

| Role                                 | Product access                                  | Billing access  |
| ------------------------------------ | ----------------------------------------------- | --------------- |
| Owner (`couple_owner`)               | All capabilities included in the workspace plan | View and manage |
| Partner (`couple_partner`)           | Operate modules included in the plan            | View only       |
| Planner (`wedding_planner`)          | Operate delegated modules included in the plan  | None            |
| Collaborator (`family_collaborator`) | Contribute only in delegated areas              | None            |
| Viewer (`viewer`)                    | Read-only in permitted areas                    | None            |

Only the owner can initiate checkout, open the Paddle management portal or
change the subscription.

## Enforcement rules

- The API enforces both role and plan. Hiding a control in the frontend is not
  considered authorization.
- Numeric limits are checked before creating guests, collaborators, AI runs,
  automations and file uploads.
- Paid modules remain visible so existing data is not lost after a downgrade.
  Mutations return `PLAN_UPGRADE_REQUIRED` with HTTP status 402.
- A `FREE` subscription always has Free access.
- `ACTIVE` and `PAST_DUE` retain the recorded paid plan while Paddle performs
  its collection flow.
- `INCOMPLETE`, `PAUSED` and `CANCELED` use Free entitlements.
- No downgrade deletes event data.

## Paddle boundary

Paddle is Merchant of Record only for Sarbato's €7 and €17 recurring
subscriptions. It is not used to collect, hold, route, refund or reconcile
payments between organizers and event vendors.

Paid checkout must remain unavailable in the interface until production Paddle
credentials, price identifiers and webhook verification are configured.
