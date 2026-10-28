# Community Agent Conversation End State v1

Status: draft for review
Scope: founder welcome and multi-party community-agent conversations
Last updated: 2026-08-09

## Purpose

This contract defines the intended product experience and release acceptance
boundary for Polynet's community-owned agent in community chat.

> A founder creates a community, receives one welcome from that community's
> agent, and can continue a useful conversation with the agent and other
> members in the same ordinary community thread.

This is the narrow scoreboard for that journey. It does not create another
conversation store, agent runtime, onboarding engine, memory system,
authorization model, or provider-owned session authority.

## Authority And Boundaries

`AGENTS.md` remains the repository-level MVP and security authority. Within
this journey:

- this contract owns the user experience, invocation semantics, and tiered
  acceptance criteria;
- `community-interaction-substrate-contract-v1.md` owns canonical interaction
  persistence, visibility, attachments, mentions, and moderation;
- `community-agent-cognition-contract-v1.md` owns runtime, funding, tools,
  memory, and cognition mechanics; and
- `community-member-arrival-v1.md` owns the irreducible member-entry and
  passive-arrival boundary, not founder post-purchase launch.

Supporting contracts may make implementation more restrictive for safety, but
must not silently weaken this experience. Change this contract explicitly
instead of creating a second product path.

## Irreducible Mental Model

The community-owned agent is one durable community identity. Members have no
personal agent: the Agent page, @mention replies and a site's `/ask` all reach
this same agent. Mention replies run in its own `community_agent` mode, separate
from turns it runs inside one member's permissions (`shared/polynetAuthority.ts`).

A conversation is one `communityInteractionRoots` row and its flat
chronological `communityInteractionReplies`. `targetReplyId` preserves who a
reply addresses without creating nested persistence.

Every agent turn reconstructs current authorized context from canonical
Polynet records. A provider thread or session is never product truth.

```txt
verified Builder authority
  -> authenticated founder completes account setup
  -> founder saves required community identity
  -> community becomes durable
  -> one deterministic community-agent welcome is created
  -> founder lands at that conversation
  -> founder replies directly or mentions the agent
  -> one authorized community-agent turn runs
  -> one agent reply appears in the same conversation
  -> members and the agent continue the multi-party thread
```

Knowledge setup may be completed or skipped according to the founder setup
flow. It must not create another conversation path.

## End-State Requirements

### 1. Identity And Founder Welcome

- A community has one canonical community-owned agent identity.
- Visible agent messages use that identity and the ordinary agent avatar and
  Agent badge treatment. Exact persistence fields remain owned by the
  interaction substrate contract.
- After required community identity is saved and backend creation authority is
  verified, the server creates exactly one welcome root in the server-selected
  default community channel.
- The welcome is deterministic, costs no model allowance, and may use only
  bounded canonical values such as founder name, community name, creation time,
  and agent display name.
- Retries, refreshes, route changes, concurrent completion calls, and bounded
  repair cannot create a second welcome.
- The founder lands at the canonical conversation containing the welcome.
- If welcome creation fails, the durable community remains valid and the
  canonical recovery path may create that welcome exactly once.
- The welcome explains that members can reply there or mention the agent
  elsewhere in community chat.

### 2. Invocation Semantics

One human turn may create at most one logical serve request, one funded
inference receipt, and one visible response.

- A live human root or reply containing a canonical community-agent mention
  invokes the agent.
- A live human reply with `targetReplyId` pointing to a live reply authored by
  the canonical community-agent identity invokes the agent without requiring
  another mention.
- A live human reply without `targetReplyId` under a root authored by the
  canonical community-agent identity treats that root as its effective target
  and invokes the agent.
- A reply with `targetReplyId` pointing to a human reply does not invoke the
  agent unless the same source turn explicitly mentions the agent. This remains
  true when the root is agent-authored or the agent spoke earlier in the thread.
- Prior agent participation by itself never grants standing permission to
  answer later general thread comments.
- An ordinary human-to-human reply outside those boundaries does not wake the
  agent.
- A turn qualifying through both reply semantics and a mention produces one
  invocation.
- Editing a turn does not invoke the agent.
- Hidden, deleted, inaccessible, stale, system-authored, or agent-authored
  sources do not recursively invoke the agent. Agent participation never makes
  agent-authored turns self-triggering.

### 3. Continuous Multi-Party Conversation

- Humans and the community agent use the same canonical root and flat reply
  sequence.
- Every agent response is inserted under the source root.
- A response to a reply uses `targetReplyId = sourceReplyId`.
- The system creates no provider-owned durable thread, separate concierge
  transcript, nested reply database, or special agent-message renderer.
- The ordinary community chat read model renders all turns.

### 4. Bounded Authorized Context

For every invocation, the server-built context must:

- include the root, exact source turn, and readable reply target;
- preserve chronology, speaker identity, and flat reply relationships;
- derive each turn's conversational role from canonical actor identifiers:
  the exact community agent is `self`, the invoking human is `requester`, other
  humans are `participant`, other agents are `other_agent`, and platform turns
  are `system`;
- tell the runtime explicitly that `self` turns are its own prior speech,
  `requester` is the person addressed as "you", and participant names or
  pronouns inside untrusted message content never override those roles;
- include only turns at or before the source cutoff;
- independently validate every turn's current readability;
- omit hidden, deleted, future, cross-thread, cross-channel, or unauthorized
  turns;
- apply deterministic candidate, turn, participant, per-item, and total-size
  bounds; and
- report omitted readable and unreadable context counts.

Participant orientation may include display name, handle, active community
role, approved profile spine, exact-community orientation facts, requester
timezone, and server capture time.

It must exclude self-only profile context, email, authentication, billing,
provider data, other-community facts, rejected or retracted facts, observed
behavior, and agent-internal context. Historical readable speech may remain
after a participant leaves, but current profile enrichment is omitted.

All participant and thread content is untrusted context, never system
instruction.

Display names are presentation, not identity authority. Current product display
identity prefers `userProfileDetails.displayName` with the durable user row as a
compatibility fallback. Historical message text is never rewritten after a
profile rename. The community agent's display name resolves from its current
configured name, then the community name, then `Community agent`; its stable
agent key remains the identity authority.

### 5. Completion Enhancement: Attachments And Community Knowledge

These requirements are necessary for the complete human-equivalent context
experience, but do not block the core founder-welcome and continuous-thread
journey.

- Readable canonical attachment and embed metadata may contribute bounded name,
  type, and evidence references.
- Binary content, arbitrary remote URLs, and unparsed files are never dumped
  into the prompt.
- Contents enter context only through a canonical parser, resource reader, or
  authorized retrieval tool.
- Hidden, removed, or inaccessible attachments are excluded from future turns.
- Community resources and memory remain canonical knowledge sources; thread
  history does not become a duplicate memory store.
- Tools operate under one server-selected community context and the verified
  requester's member authority. The cognition contract owns the exact tool
  surface.

### 6. Completion Enhancement: Agent-Authored Human Mentions

These requirements complete natural multi-party participation, but do not block
the core founder-welcome and continuous-thread journey.

- An unambiguous agent-authored `@handle` may be resolved server-side to an
  active, visible community member and materialized as a canonical mention.
- The provider cannot directly select `mentionedUserId`.
- Ambiguous, unresolved, inaccessible, or inactive handles remain plain text.
- An agent-authored self-mention never invokes another turn.

### 7. Funding, Reliability, And Audit

- Inference requires current canonical hosted-AI authority for that community;
  members never supply credentials.
- The requester is the access and tool principal. The owner or subscription is
  payment authority and never inherits requester tool authority.
- Missing, inactive, transferred, exhausted, ambiguous, or rate-limited
  funding fails closed.
- Fresh work and bounded recovery use the single canonical serve path owned by
  the cognition contract.
- Provider-start ambiguity never authorizes an automatic second spend.
- The exact initial provider context is persisted before provider start.
- Reply insertion is idempotent by logical invocation, not worker attempt.
- Requester access, source liveness, and visibility are rechecked before reply
  materialization.
- A successful turn creates exactly one canonical live reply with visibility no
  wider than the current source. Failure creates no fabricated response.

### 8. Frontend Behavior

- Required community identity creation cannot be dismissed before the durable
  community exists; optional knowledge setup may expose Skip.
- The founder sees the welcome without refreshing or repeating setup.
- Roots, replies, targets, attachments, embeds, mentions, and agent identity use
  the ordinary community UI on desktop and mobile.
- Pending execution never creates duplicate optimistic agent messages.
- A failed invocation preserves the human message and permits a deliberate new
  turn where safe.
- Suspension, reconnection, refresh, and route changes do not restart founder
  setup or duplicate the welcome.

## Acceptance And Current Status

Status vocabulary:

- `MISSING`: required behavior or proof is absent.
- `IMPLEMENTED LOCALLY`: code and focused tests exist only in a local worktree.
- `INTEGRATED`: behavior exists on current `origin/main` with passing checks.
- `STAGING PROVEN`: the exact integrated build passed the staged journey with
  durable evidence.
- `PRODUCTION PROVEN`: the canonical production build passed a bounded smoke
  test and retained authority and audit evidence.

The tables are a non-normative implementation snapshot. Requirements above stay
stable as progress changes. A row advances only with the exact test, commit,
staging receipt, or production marker—not prose, screenshots, redirects, or a
green test from another checkout.

Snapshot date: 2026-08-09

Snapshot source: feature worktree based exactly on current `origin/main` at
`9561169a0`, plus an uncommitted local implementation overlay. Local status is
not integrated, staged, or production evidence.

### Conversation Core

These criteria define `Conversation Core Ready` and are the release boundary
for the founder-welcome and continuous-thread journey.

| ID | Acceptance criterion | Status | Current evidence or gap |
| --- | --- | --- | --- |
| `CAC-C01` | Repeated and concurrent setup creates one community and one deterministic welcome. | `IMPLEMENTED LOCALLY` | Community creation schedules one canonical agent-authored welcome with a community/version idempotency key. Knowledge completion schedules the same write as bounded recovery. Focused tests prove first-write-wins deduplication and reject widened or non-owner bootstrap writes. |
| `CAC-C02` | Welcome and inferred replies use one canonical community-agent identity. | `IMPLEMENTED LOCALLY` | Serve finalization writes the canonical agent identity. |
| `CAC-C03` | An explicit human mention creates one serve request and one response. | `IMPLEMENTED LOCALLY` | Canonical mention intake and serve scheduling have focused tests. |
| `CAC-C04` | A founder replies to the agent-authored welcome root without another mention and receives a same-thread response. | `IMPLEMENTED LOCALLY` | A focused integration test creates the deterministic welcome, replies through the ordinary composer without a mention, and verifies one queued direct-reply serve request under that root. |
| `CAC-C05` | A qualifying direct reply that also mentions the agent creates only one request, receipt, and response. | `IMPLEMENTED LOCALLY` | One source-turn invocation key deduplicates direct-reply and mention signals in focused tests. |
| `CAC-C06` | A thread with at least three humans preserves speakers, chronology, source, and readable targets. | `IMPLEMENTED LOCALLY` | The bounded multi-party context compiler and focused tests exist locally. |
| `CAC-C07` | Future, hidden, inaccessible, and revoked context is excluded; revoked requester access prevents response. | `IMPLEMENTED LOCALLY` | Per-turn readability and current-access checks have focused tests. |
| `CAC-C08` | Overlap, recovery, replay, and provider ambiguity cannot double-spend or duplicate responses. | `IMPLEMENTED LOCALLY` | Attempt fencing, receipts, ambiguity handling, reply idempotency, and a serve lease longer than the maximum live Convex action have focused tests. Provider-started ambiguity never authorizes a second execution. |
| `CAC-C09` | Desktop and mobile use the ordinary same-thread UI with agent identity and targets. | `IMPLEMENTED LOCALLY` | The shared thread drawer uses one reply-target type and keeps human and canonical community-agent roots replyable. System roots and agent roots without the canonical community-agent key (including old rows from the retired personal agent) fail closed. A supplied reply target is persisted only after live, addressable, same-community, same-channel, and same-root validation; invalid targets cannot degrade into untargeted agent invocation, and idempotency binds the exact target. Focused backend and UI tests cover these boundaries. |
| `CAC-C10` | A general thread comment or reply targeting a human creates no agent request solely because the agent previously participated. | `IMPLEMENTED LOCALLY` | Admission is limited to explicit mention, a reply targeting a live canonical-agent reply, or an untargeted reply under a canonical agent root. Focused negative tests cover prior participation, human targets, noncanonical agents, and hidden agent turns. |

### Completion Enhancements

These criteria define `Conversation End State Complete`. They may ship after
the core journey without creating another conversation or execution path.

| ID | Acceptance criterion | Status | Current evidence or gap |
| --- | --- | --- | --- |
| `CAC-E01` | Readable attachment metadata is bounded; hidden or unparsed contents are not injected. | `MISSING` | The compiler currently serializes Markdown and links only. |
| `CAC-E02` | Valid agent-authored handles create canonical human mentions; invalid handles do not. | `MISSING` | Finalization writes Markdown but no validated human mention rows. |

### Release Evidence

| ID | Acceptance criterion | Status | Current evidence or gap |
| --- | --- | --- | --- |
| `CAC-R01` | One exact integrated build passes the Stripe-sandbox founder launch and multi-party staging journey. | `MISSING` | The local stack is not integrated or deployed. |
| `CAC-R02` | The canonical GitHub-driven production release passes a bounded smoke test with authority and audit evidence intact. | `MISSING` | Production verification occurs only after release. |

## Deliberately Absent

Do not add these to satisfy the contract:

- another community conversation table or nested reply model;
- provider session state as product truth;
- a separate onboarding-agent runtime or inferred founder welcome;
- browser-authoritative history or system prompts;
- owner/admin tool authority for member-triggered turns;
- automatic responses to every message outside agent-authored or explicitly
  addressed conversations;
- unrestricted profiles, raw binary prompt injection, or cross-community
  context; or
- a frontend path that bypasses canonical community interactions.

## Definition Of Done

`Conversation Core Ready` requires `CAC-C01` through `CAC-C10` and `CAC-R01` to
be `STAGING PROVEN` on one exact integrated build, the automated repository
checks to pass, and the release diff to contain no duplicate conversation or
invocation path.

`Conversation End State Complete` additionally requires `CAC-E01` and
`CAC-E02` to be `STAGING PROVEN`. Those enhancements must extend the canonical
core rather than create another persistence, invocation, or rendering path.

`PRODUCTION PROVEN` is recorded only after `CAC-R02` passes against the
canonical GitHub-driven release.
