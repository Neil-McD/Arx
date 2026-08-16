# Community Member Entry and Arrival v1

## Irreducible contract

A member authenticates, completes the required platform profile, receives an
authorized membership, lands in the community's canonical General channel, and
uses the ordinary product. Member entry does not create a separate onboarding
session or block on orientation, first post, agent turn, acknowledgement, or MCP
handoff.

Community membership is canonical access truth. A `member_joined` activity row
is an ambient, recoverable projection of one real inactive-to-active membership
transition; it never grants access and future workflow execution must not treat
the activity table as membership authority.

Every real activation projects at most one event with:

- `actorUserId`: the joining member
- `targetType`: `membership`
- `targetId`: the durable membership id
- `dedupeKey`: `member_joined:{membershipId}:{activationSequence}`

An already-active membership replay creates no event. A later reactivation
increments `activationSequence` and may therefore create one new arrival event.
Pending approval, denial, checkout creation, failed payment, blocked access, and
archived-community admission create no event.

## Authority and failure behavior

All open, approved, paid, manual, and platform-home grants continue to converge
through `activateCommunityMembershipCore`. That transition is the only writer
allowed to project `member_joined`.

The projection is best effort: ambient activity failure must never roll back a
valid membership. The membership row and its activation sequence contain enough
durable truth for a bounded repair if one is ever needed.

## General-channel projection

The web client subscribes to the bounded `member_joined` read only while the
signed-in member is actively viewing General. It merges those ambient events
into the canonical interaction timeline without converting them into messages
or interaction roots. Adjacent same-day arrivals within fifteen minutes are
grouped visually at read time; human, agent, or system posts break the group.

The activity failure path stays independent from chat. Arrival rows do not
create unread-message state, replies, reactions, notifications, or agent turns.

## Post-admission concierge

Member entry remains complete as soon as membership activates. Separately, one
bounded, founder-controlled concierge batch may project newly activated members
into the canonical General conversation after a twelve-hour collection window.
That projection is defined by
[`community-member-concierge-welcome-v1.md`](./community-member-concierge-welcome-v1.md).
It cannot grant, revoke, delay, or repair membership.

## Deliberately absent

No poller, inference, email notification, workflow execution, forced
introduction, onboarding preview, or MCP handoff is part of member entry. The
post-admission concierge projection is optional community behavior, not an
entry requirement or onboarding state machine.

The retained `communityOnboarding` operations are authenticated, stateless
compatibility tombstones for cached clients. They never read or write the
retired onboarding tables. The tables remain temporarily only as rollback and
bounded data-retirement substrate; they are not product authority.
