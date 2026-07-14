# Community Onboarding Workflow v1

## Irreducible contract

When onboarding is enabled, a real inactive-to-active membership transition
creates exactly one onboarding session for that activation. Repeated writes to
an already-active membership do not create a session. A later reactivation
supersedes any unfinished active session.

The session snapshots only the configured welcome message and optional founder
orientation video. Onboarding media is separate from public funnel media.
Existing members are not backfilled, and later configuration changes do not
rewrite an active session.

Onboarding is deterministic UI orchestration. It does not create an onboarding
agent, a community-agent conversation, hidden prompts, or a separate inference
mode.

## State machine

An active session advances through three observable outcomes:

`orientationCompletedAt -> firstCommunityPostAt -> firstAgentDockTurnAt`

The visible phase is derived from these timestamps. Each write is idempotent.
After all three exist, the session becomes `completed` and receives
`completedAt`.

- Orientation advances only when the member chooses Continue.
- The first-post milestone is recorded only after the canonical community
  composer creates the post or reply.
- The personal-agent milestone is recorded only after a successful ordinary
  member-agent turn under the same server-validated community lens.
- Skip changes the session to `dismissed`.

## Member experience

Step 1 presents the saved welcome and optional founder video in a focused
overlay. Step 2 spotlights the canonical community composer and seeds an
editable introduction draft. Step 3 opens and focuses the existing personal
agent dock under the community lens.

The community agent and personal agent keep their normal identities,
permissions, prompts, histories, providers, and rate limits. Onboarding merely
points the member at existing product surfaces and observes successful actions.

## Manager preview

Owners and admins can open `/c/:slug/onboarding/preview`. Preview reads the
saved manager-authorized configuration and renders the same onboarding
surfaces. Preview state is local and resets on refresh. Community post sends are
simulated, while the personal-agent step uses the builder's real personal agent,
provider, history, and limits so the agent experience is honest.

The preview request suppresses only the onboarding progress receipt so a
builder's real personal-agent turn cannot advance an unrelated live onboarding
session they may own. It does not alter prompts, tools, inference, history, or
permissions.

Preview creates no onboarding session, public post, community-agent message, or
special runtime prompt. It is available while onboarding is off.

## Authority

- Owner/admin: read and save configuration; run preview.
- Active member: read, advance, or dismiss only their own session.
- Canonical community composer: record the first-post outcome.
- Canonical member-agent runtime: record a successful personal-agent outcome.

## Deliberately absent

No generic workflow graph, arbitrary triggers, public welcome, onboarding
concierge, community-funded inference, admin transcript, composer inference,
backfill, generated prompt suggestions, or browser-supplied system prompt exists
in this slice.
