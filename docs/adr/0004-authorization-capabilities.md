# ADR 0004: Capability-based authorization

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 1 memberships and team administration

## Context

Broad role checks cannot represent WeddingOS collaboration safely. A planner may need operational access without finance, contracts, complete guest PII, or member administration. Owners also require invariant protection.

## Decision

Authorization is deny-by-default and based on atomic capability keys shared by frontend and backend. `RoleTemplate` provides a versioned default set; `MembershipCapabilityOverride` adds an explicit allow or deny for a membership. Effective capabilities are calculated as:

```text
(role template capabilities + explicit allows) - explicit denies
```

The initial templates are `couple_owner`, `couple_partner`, `wedding_planner`, `family_collaborator`, and `viewer`. The shared contract defines:

```text
workspace.read
workspace.update
workspace.archive
workspace.delete
workspace.manage_members
workspace.transfer_ownership
team.read
team.invite
team.update_role
team.remove
settings.read
settings.update
guest.read_pii
guest.write
finance.read
finance.write
contract.read
contract.write
campaign.send
admin.none
```

Capabilities for future domains are identifiers only in Slice 1; no future module endpoints or tables are added.

Nest guards perform authentication, active-membership lookup, workspace-state checks, and capability enforcement. Controllers declare the required capability. Frontend capability checks improve the experience but are never an authorization boundary.

Owner invariants are service-layer transactional checks:

- the final active owner cannot be removed or downgraded;
- an owner cannot remove themselves without an ownership transfer;
- no member may mutate another workspace by changing a URL;
- invitation acceptance is bound to the authenticated normalized email;
- revoked, declined, expired, or consumed invitations cannot be accepted;
- membership removal is effective on the next request.

Role changes, overrides, invitations, revocations, membership removal, and protected invariant failures are audited without raw invitation tokens.

## Consequences

- Backend policy remains stable as the UI grows.
- Role labels are presentation; role-template keys and capability keys are protocol values.
- Effective capabilities are computed from current database state in Slice 1. A cache may be added later only with explicit invalidation on every membership/role/override mutation.
