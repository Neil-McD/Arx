# Community Onboarding Workflow v1

## Irreducible contract

Community onboarding is one deterministic, activation-bound state machine.
It does not create an onboarding agent, run community-concierge inference, or
store generated narration.

When onboarding is enabled, a real inactive-to-active membership transition
creates exactly one session for that membership activation. Repeated writes to
an already-active membership do not create another session. A later
reactivation supersedes any unfinished active session.

The session snapshots only the optional founder orientation video. Existing
members are not backfilled, and later configuration changes do not rewrite an
active session.

## State machine

An active session advances through five observable milestones:

`orientationCompletedAt -> firstCommunityPostAt -> firstAgentDockTurnAt -> agentTurnAcknowledgedAt -> mcpHandoffCompletedAt`

The visible phase is derived from these timestamps. Each write is idempotent.
After all five exist, the session becomes `completed` and receives
`completedAt`.

- Orientation advances only when the member chooses Continue.
- The first-post milestone is recorded only after the canonical community
  composer creates the post or reply.
- The personal-agent milestone is recorded only after a successful ordinary
  member-agent turn under the same server-validated community lens.
- The agent-turn acknowledgement is recorded only when the member reviews the
  completed response and chooses Next.
- The MCP milestone is recorded only after the member successfully copies the
  canonical setup packet.
- Skip changes the session to `dismissed`.

## Member experience

The application projects deterministic, community-named guidance through a
client-side transcript reveal:

1. Welcome the member and optionally show the founder video.
2. Seed the canonical community composer with an editable introduction.
3. Open the existing personal-agent dock under the community lens and seed one
   focused question.
4. Present the canonical Polynet MCP setup packet.

The transcript animation is presentation only. It does not imply inference,
create conversation history, or control an action. The application owns every
button, permission, route, seeded value, and state transition.

Only step three performs inference, through the member's existing personal
agent with its normal provider, limits, history, permissions, and explicit
community context.

The MCP step copies the same setup packet exposed under global Account
settings. It records the handoff, not an unverifiable claim that installation
completed in an external harness.

## Manager preview

Owners and admins can open `/c/:slug/onboarding/preview`. Preview reads the
saved manager-authorized configuration and renders the same onboarding
surfaces and deterministic copy.

Preview state is local and resets on refresh. Community post sends are
simulated. The personal-agent step uses the builder's real personal agent,
provider, history, permissions, and limits so that the agent experience is
honest.

The preview request suppresses only the onboarding progress receipt so a
builder's real personal-agent turn cannot advance an unrelated live onboarding
session. It does not alter prompts, tools, inference, history, or permissions.

Preview creates no onboarding session, public post, or community-agent message.

## Authority

- Owner/admin: read and save configuration; run preview.
- Active member: read, advance, or dismiss only their own session.
- Canonical community composer: record the first-post outcome.
- Canonical member-agent runtime: record a successful personal-agent outcome.
- Active member: acknowledge the agent turn and complete the MCP handoff after
  a successful clipboard copy.

## Deliberately absent

No generic workflow graph, scheduled inference, community-funded inference,
concierge inference, concierge tools, concierge conversation history, stored
narration, admin transcript, composer inference, backfill, founder-authored
prompt, browser-supplied system prompt, model-authored setup packet, external
installation detector, or harness-specific onboarding wizard exists.
