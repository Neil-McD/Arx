# Community Onboarding Workflow v1

## Irreducible contract

When onboarding is enabled, a real transition from inactive or nonexistent
membership to active membership creates exactly one onboarding session for that
activation. Repeated writes to an already-active membership do not create a
session. A later reactivation supersedes any unfinished active session.

The session snapshots the configured welcome, Concierge guidance, Concierge
display name, and dedicated optional founder-orientation video. Onboarding media
is separate from public funnel media. Existing members are not backfilled, and
later configuration changes do not rewrite an active session.

The deterministic onboarding state machine owns progress. The community-owned
agent's `member_concierge` surface owns orientation. The member's private
personal agent remains separate and is introduced only in the later handoff
phase. Prompts shape behavior inside a phase; they do not choose or advance the
phase.

## Milestones

An `active` session progresses through idempotent timestamps:

`openedAt -> orientationCompletedAt -> firstCommunityPostAt -> firstAgentDockTurnAt`

When the last three outcome timestamps exist, the session atomically becomes
`completed` and receives `completedAt`. The visible phase is derived from those
timestamps rather than stored independently.

The first community-post timestamp is written by the canonical community
composer only after the post or reply exists. The first personal-agent timestamp
is written only after a successful member-agent runtime turn under the same
server-validated community lens and only while that handoff phase is active.

## Concierge orientation

The community host subscribes to the active member-owned onboarding session.
During `orientation`, opening the session creates exactly one deterministic,
private `community_agent` welcome in the existing member-and-community-scoped
Concierge conversation. The welcome uses no inference and is idempotent by
onboarding session, so refresh and cross-device opens cannot duplicate it.

The orientation overlay is owned by the onboarding controller rather than the
member's personal-agent dock. It presents the community name, optional founder
video, Concierge identity, private Concierge transcript, and composer. The
member sees the welcome even when no provider is connected.

When the member replies, the canonical private Concierge send path remains
authoritative. The server resolves the active onboarding session and injects the
activation-snapshotted guidance into the existing retrieval-only
`member_concierge` runtime. The browser cannot provide or elevate the prompt.
Interactive turns use the requester's connected ChatGPT provider and remain in
their private community-Concierge history. Community managers cannot read that
history.

Continue writes `orientationCompletedAt`; skip dismisses the session. Neither a
Concierge response nor a failed provider turn advances onboarding.

## Later phases

During `first_community_post`, the canonical community composer and its outcome
milestone remain authoritative. During `first_agent_dock_turn`, the existing
member-owned personal agent opens under the server-validated community lens. The
personal agent receives onboarding guidance only in this handoff phase, never
during Concierge orientation or first-post coaching.

Composer coaching, personal-agent prompt seeding, and the optional MCP education
step remain separate follow-up slices.

## Manager preview

Owners and admins can open the saved workflow at
`/c/:slug/onboarding/preview`. Preview reads the saved manager-authorized config
and drives the same orientation renderer and Concierge send/runtime path.

Preview progress is local and resets on refresh. The deterministic welcome is
presentational and creates no onboarding session or public community message.
If the builder replies, the turn uses the builder's connected provider and
limits and remains in the builder's private community-Concierge history. The
server independently verifies manager permission before applying preview
onboarding guidance. Preview never advances a real member onboarding session.

Preview is available when onboarding is configured off so a manager can inspect
it before activation. The preview chrome labels that state clearly. Direct route
access fails closed behind the existing community-manager configuration read.

## Status

`active -> completed`

`active -> dismissed`

`active -> superseded`

## Authority

- Owner/admin: read and save onboarding configuration; run their own preview.
- Active member: read, open, advance, or dismiss only their own session.
- Community Concierge: private, retrieval-only orientation replies under the
  member's community access and requester-funded provider connection.
- Canonical community and personal-agent write paths: record later outcome
  milestones.
- Community managers never receive member Concierge or personal-agent transcripts.

## Deliberately absent

No generic workflow graph, arbitrary trigger builder, public welcome,
community-funded orientation inference, admin transcript, composer inference,
backfill, generated prompt suggestions, or third onboarding agent exists in this
slice.
