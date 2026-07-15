# Community Onboarding Workflow v1

## Irreducible contract

When onboarding is enabled, a real inactive-to-active membership transition
creates exactly one onboarding session for that activation. Repeated writes to
an already-active membership do not create a session. A later reactivation
supersedes any unfinished active session.

The session snapshots the configured concierge welcome guidance, optional
founder orientation video, and a deterministic orientation fallback. On the
member's first authorized view, the application may replace that fallback once
with bounded concierge narration generated for that member. Onboarding media is separate from public funnel media. Existing
members are not backfilled, and later configuration changes do not rewrite an
active session.

Onboarding keeps a deterministic control plane. The community concierge may
generate only the prose used by the orientation surface. It cannot choose an
action, permission, route, seeded composer value, prompt, or state transition.
No onboarding-agent identity, community-agent conversation, or new inference
mode is created.

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

Steps 1 and 2 share one community-concierge presentation. For step 1, the
member immediately receives the stored deterministic welcome. Their first
authorized view claims one best-effort no-tools `member_concierge` call that writes 2-4 short sentences from the
community identity, saved founder guidance, member first name, and founder-video
availability. The joining member sponsors that call with their ordinary
personal-agent funding policy and limits: ChatGPT when connected, otherwise the
member's OpenAI key. Membership activation never triggers inference. The result
is stored once on the onboarding session and replayed on refresh. Missing
access, a disabled agent, missing provider, timeout, invalid output, or a stale
claim resolves to the stored deterministic fallback. Skip and Continue remain
available while the optional narration is preparing, so inference can never
lock onboarding. The chosen prose streams into view through the existing
client-side reveal. Step 2 moves
the same concierge voice to the canonical community composer, reveals brief
scripted guidance, and seeds an editable introduction draft. Step 3 shades the page, opens the existing
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
surfaces. Its orientation call uses the builder's provider and limits but is
returned ephemerally: it creates no member session or milestone. Preview state
is local and resets on refresh. Community post sends are simulated, while the
personal-agent step uses the builder's real personal agent, provider, history,
and limits so the agent experience is honest.

A successful preview agent turn advances locally to the same response-review
card. Choosing Next reveals the MCP handoff. Copying uses the same canonical
setup packet as personal Integrations settings, then completes only the local
preview session.

The preview request suppresses only the onboarding progress receipt so a
builder's real personal-agent turn cannot advance an unrelated live onboarding
session they may own. It does not alter prompts, tools, inference, history, or
permissions.

Preview creates no onboarding session, public post, or community-agent message.
It is available while onboarding is off.

## Authority

- Owner/admin: read and save configuration; run preview.
- Active member: read, advance, or dismiss only their own session.
- Canonical community composer: record the first-post outcome.
- Canonical member-agent runtime: record a successful personal-agent outcome.
- Active member's first onboarding view: claim one bounded orientation prose
  generation, sponsored by that member for live onboarding.
- Owner/admin preview: generate the same bounded prose ephemerally with the
  builder's ordinary personal-agent funding policy.
- Active member: acknowledge their completed agent turn and complete their own
  MCP handoff after a successful clipboard copy.

## Deliberately absent

No generic workflow graph, arbitrary triggers, public welcome, community-funded
inference, concierge tools, concierge conversation history, admin transcript,
composer inference, backfill, generated prompt suggestions, browser-supplied
system prompt, external installation detector, or harness-specific onboarding
wizard exists in this slice.
