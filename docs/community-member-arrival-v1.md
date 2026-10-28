# Community Member Entry and Arrival v1

## Irreducible contract

A member authenticates, completes the required platform profile, receives an
authorized membership, lands in the community's canonical General channel, and
uses the ordinary product. Member entry does not create a separate onboarding
session or require an orientation, first post, agent turn, acknowledgement, or
MCP handoff.

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

All open, approved, paid, and manual grants continue to converge
through `activateCommunityMembershipCore`. That transition is the only writer
allowed to project `member_joined`.

**Roles across activation (Oct 28).** An already-active membership keeps its
role on any replay (a repeat join, approval or checkout never changes it, so
checkout can't demote an admin). A membership coming back after leaving,
removal or a ban starts as `member`: a role held before is never restored by
rejoining. Only a caller that passes an explicit role sets one.

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

## Deliberately absent

No scheduler, poller, inference, notification, concierge welcome, founder
setting, workflow execution, forced introduction, onboarding preview, or MCP
handoff is part of member entry.

The `communityOnboarding` operations were deleted on October 27, 2026: the
cached-client compatibility period is over. The onboarding tables remain
temporarily only as bounded data-retirement substrate; they are not product
authority.
