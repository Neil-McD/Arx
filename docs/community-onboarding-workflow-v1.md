# Community Onboarding Workflow v1

## Irreducible contract

When onboarding is enabled, a real transition from inactive or nonexistent
membership to active membership creates exactly one onboarding session for that
activation. Repeated writes to an already-active membership do not create a
session. A later reactivation supersedes any unfinished active session.

The session snapshots the configured orientation copy, personal-agent guidance,
and the community funnel video when the funnel hero is a video. Existing members
are not backfilled, and later configuration changes do not rewrite a session.

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
same server-validated community lens. The member's provider, limits, private
conversation, and existing global personal-agent channel remain authoritative.

## Member presentation

The community host subscribes to the active member-owned session. During the
`orientation` phase it presents one accessible modal with the snapshotted
welcome, community name, optional founder video, and the three-step path. The
modal writes `openedAt` when shown. Continue writes `orientationCompletedAt`;
skip dismisses the session. Refresh and cross-device behavior remain server
owned rather than relying on browser workflow state.

After orientation, the host selects Community Chat and focuses the canonical
composer. During `first_community_post`, a compact guide beside that composer
offers a deterministic community-specific prompt and a persistent skip action.
It never prefills or intercepts the draft. Only the canonical successful post or
reply mutation advances the session to `first_agent_dock_turn`; failed and local
drafts do not.

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
composer inference, backfill, or agent-dock spotlight exists in this slice.
