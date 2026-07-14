# Community Onboarding Workflow v1

## Irreducible contract

When onboarding is enabled, a real transition from inactive or nonexistent
membership to active membership creates exactly one onboarding session for that
activation. Repeated writes to an already-active membership do not create a
session. A later reactivation supersedes any unfinished active session.

The session snapshots the configured orientation copy, personal-agent guidance,
and a dedicated optional founder-orientation video. Onboarding media is separate
from public funnel media. Existing members are not backfilled, and later
configuration changes do not rewrite a session.

Onboarding is a member-owned state machine, not a community-agent delivery job.
It does not create a community Concierge transcript, schedule a welcome, or run
community-funded inference.

## Milestones

An `active` session progresses through idempotent timestamps:

`openedAt -> orientationCompletedAt -> firstCommunityPostAt -> firstAgentDockTurnAt`

When the last three outcome timestamps exist, the session atomically becomes
`completed` and receives `completedAt`. The visible phase is derived from those
timestamps rather than stored independently.

The first community-post timestamp is written by the canonical community
composer mutation only after the post or reply exists. The first agent-dock
timestamp is written only after a successful member-agent runtime turn under the
same server-validated community lens and only while that milestone is the active
phase. Orientation questions cannot satisfy the later dock milestone. The member's provider, limits, private
conversation, and existing global personal-agent channel remain authoritative.

## Member presentation

The community host subscribes to the active member-owned session. During the
`orientation` phase it presents one accessible agent-led overlay with the
community name, optional founder video, and the member's existing private
personal-agent conversation. Opening creates exactly one deterministic assistant
seed in the active personal-agent episode, switches that episode to the
server-validated community lens, and stores the seed sequence on the session.
The seed uses no inference. Member replies use their normal provider and quota.
Continue writes `orientationCompletedAt`; skip dismisses the session. Refresh,
cross-device behavior, and seed idempotency remain server owned.

After orientation, the host selects Community Chat and focuses the canonical
composer. During `first_community_post`, a compact guide beside that composer
offers a deterministic community-specific prompt and a persistent skip action.
It never prefills or intercepts the draft. Only the canonical successful post or
reply mutation advances the session to `first_agent_dock_turn`; failed and local
drafts do not.

During `first_agent_dock_turn`, the existing member-owned agent dock opens once
for the session and focuses its canonical composer after the private channel is
ready. A compact final-step guide explains that the agent has the current
community lens and offers the same persistent skip action. The guide never
prefills a draft, starts a new episode, or creates proactive inference.

For every active onboarding phase, runtime resolution loads the phase, a bounded
phase objective, and the activation-snapshotted personal-agent guidance by
authenticated member and server-validated community.
It is injected as bounded community-owned context below platform policy and the
member's agent identity. The browser cannot supply or elevate it, and it grants
no data, tools, permissions, or transcript access. A successful private agent
turn records `firstAgentDockTurnAt` and completes the session; a failed turn
leaves the phase active for retry.

## Manager preview

Owners and admins can open the saved workflow at
`/c/:slug/onboarding/preview`. Preview is an authenticated community route, not
a public funnel route and not a membership activation. It reads the saved
manager-authorized onboarding configuration including the dedicated video, then
constructs an ephemeral browser session that drives the same orientation,
first-post, and personal-agent presentation components.

Preview progress is deliberately local and resets on refresh. The orientation
overlay renders a local deterministic seed and a disabled composer. The live session
subscription and milestone mutations are bypassed. Community composers, new
personal-agent conversations, agent turns, and inference are disabled; existing
private agent messages are not projected into the preview. Preview creates no
membership, onboarding session, message, thread, analytics event, or inference
usage. Exit and preview skip return directly to the Workflows settings pane.

Preview is available even when onboarding is configured off so a manager can
inspect it before activation. The preview chrome must label that state clearly.
Direct route access still fails closed behind the existing community-manager
configuration read.

## Status

`active -> completed`

`active -> dismissed`

`active -> superseded`

There is no queued delivery state or repair cron because there is no asynchronous
welcome artifact to deliver.

## Authority

- Owner/admin: read and save onboarding configuration.
- Active member: read, open, advance, or dismiss only their own active session.
- Canonical community and runtime write paths: record outcome milestones.
- Community managers never receive the member's private personal-agent transcript.

## Deliberately absent

No generic workflow graph, arbitrary triggers, public welcome, admin transcript,
community-funded onboarding inference, onboarding-specific member ontology lens,
composer inference, backfill, generated prompt suggestions, onboarding-only
conversation, or generated proactive agent greeting exists in this slice.
