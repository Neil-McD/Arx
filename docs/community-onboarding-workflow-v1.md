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
  completed response and chooses Next. The MCP handoff is not shown while the
  agent turn is still running.
- The MCP handoff milestone is recorded only after the member successfully
  copies the canonical Polynet MCP setup packet. It records the handoff, not an
  unverifiable claim that an outside harness finished installation.
- Skip changes the session to `dismissed`.

## Member experience

Steps 1 and 2 share one deterministic community-concierge presentation. Step 1
uses the community avatar, name, one-liner, saved welcome, and an optional
founder video in a focused overlay. Its saved Markdown streams into view before
the video and Continue action appear. Step 2 moves the same concierge voice to
the canonical community composer, reveals brief scripted guidance, and seeds
an editable introduction draft. Neither presentation invokes an agent or
consumes inference. Step 3 shades the page, opens the existing
personal agent dock under the community lens, and keeps only its composer and a
matching guidance card in focus. After the agent finishes, the same card asks
the member to confirm the response makes sense. Step 4 appears only after that
confirmation and presents the canonical Polynet MCP setup packet as one
deterministic copy action.

The community agent and personal agent keep their normal identities,
permissions, prompts, histories, providers, and rate limits. Onboarding merely
points the member at existing product surfaces and observes successful actions.
The MCP step does not attempt to detect or attest to external installation.

## Manager preview

Owners and admins can open `/c/:slug/onboarding/preview`. Preview reads the
saved manager-authorized configuration and renders the same onboarding
surfaces. Preview state is local and resets on refresh. Community post sends are
simulated, while the personal-agent step uses the builder's real personal agent,
provider, history, and limits so the agent experience is honest.

A successful preview agent turn advances locally to the same response-review
card. Choosing Next reveals the MCP handoff. Copying uses the same canonical
setup packet as personal Integrations settings, then completes only the local
preview session.

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
- Active member: acknowledge their completed agent turn and complete their own
  MCP handoff after a successful clipboard copy.

## Deliberately absent

No generic workflow graph, arbitrary triggers, public welcome, inference-backed
onboarding concierge, community-funded inference, admin transcript, composer inference,
backfill, generated prompt suggestions, browser-supplied system prompt, external
installation detector, or harness-specific onboarding wizard exists in this slice.
