# Community Member Workflows V1

## Product contract

Workflows is a builder-configured client-success pipeline. It supplies rails,
not a prescribed coaching method.

The V1 grammar is intentionally small:

```text
Workflow = ordered Milestones[]
Milestone = name + Automations[]
Automation = one Trigger + one Action
Trigger = member_contributed(channelId?)
Action = prompt_agent(prompt) | move_member(next_or_complete)
```

A new milestone has no hidden behavior. Merely occupying a milestone never
causes work. A member contribution is the only V1 trigger.

Each rule listens to any authorized channel by default, or one selected channel
ID. The existing milestone popup exposes this as "When a member posts or replies
in [Any channel / channel]". Selection filters the source; it does not assign
members a service room, grant access, or change the reply destination.

Saving a selected channel requires that it belongs to the workflow community and
is active. Renames preserve the selection. Archived/deleted channels never fall
back to Any channel; the editor requires replacing the selection or removing the
rule. Event authorization still checks current member access; agent actions also
require the community agent's access. Deterministic moves need no agent grant.
New runs capture `triggerSnapshot` as well as the source receipt and action.
Historical runs without a snapshot remain valid and are not backfilled from
today's configuration. Filtering happens before run admission and retains the
existing replay key and one-terminal-move rule.

The editor keeps its opening milestone snapshot across live board refreshes.
Unchanged refreshes preserve the draft; a changed milestone blocks saving and
requires closing/reopening, rather than silently erasing or overwriting edits.

### Channel-scoped rules staging acceptance — 2026-09-05

- Code candidate: `a94ffe79a94dfb6516d06a5507b32637323757e3` on Git
  `staging`; the staging `/version.json` returned that exact build ID and
  `environment: staging`. Backend changes deployed explicitly to
  `dev:quick-porcupine-949`; the final follow-up changes were frontend/docs only.
- All 945 tests across 130 files passed (11 new channel-selection cases), both
  typechecks passed, and the full release gate passed on the clean candidate.
  Two inherited gate failures were repaired without weakening authorization:
  bounded channel-settings operation names and the typing-presence proof's
  reference to the canonical channel capability check.
- Signed-in Chrome owner QA in `concierge-welcome-canary-2026-08-20-b` verified
  the unchanged board, Any/General/private choices, private-agent invitation
  guidance, and saving/reloading the selected channel ID. The temporary prompt
  automation was then removed and the original empty rule list reloaded.
- A second Chrome tab temporarily renamed `New` to exercise a concurrent edit.
  The first tab retained its draft, displayed a conflict, and disabled Save.
  The name was restored to `New`; original member positions remained 2 in New
  and 1 in Activated. No member messages or agent actions were sent in this QA.
  No browser console errors were captured; the extra QA tab was closed.
- Still pending: a signed-in ordinary-member private-channel contribution,
  actual same-thread agent reply, exact movement/receipt readback and replay,
  plus the outstanding member-browser revocation acceptance. Local tests cover
  matching, root/reply routing, replay, snapshot stability, archived/deleted/
  foreign/malformed targets, and private-member grant revocation; they are not
  a substitute for that live member canary. Production was not changed.

## Semantics

- `prompt_agent` admits one durable community-agent serve request using the
  builder prompt captured on the workflow run. It replies in the contribution's
  thread. It never advances the member.
- `move_member` deterministically advances to the next ordered milestone, or
  marks the workflow complete at the final milestone. It never invokes a model.
- Each automation produces one idempotent run keyed by workflow, membership,
  contribution receipt, and automation key.
- A milestone may have any number of prompt actions and at most one move action.
- Prompt actions are admitted first. The single move action is terminal and runs
  after prompt admission regardless of its visual order in the editor. Prompt
  success is not a condition for movement; V1 has no action chaining or goals.
- Rules are revalidated against the member's current milestone and workflow
  revision before authoritative writes.

## Canonical records

- `communityMemberWorkflows`: ordered builder definition and revision.
- `communityMemberWorkflowMemberMilestones`: current member projection.
- `communityMemberWorkflowRuns`: immutable trigger/action snapshot and result.
- `communityMemberWorkflowTransitions`: exactly-once movement receipts with
  immutable source and destination milestone-name snapshots.
- `communityAgentServeRequests`: durable admission for `prompt_agent` work.

The builder member dossier reads those records into a bounded recent-activity
timeline. Agent status comes from the linked serve request, movement comes from
the linked transition, and the action prompt and milestone name come from the
occurrence-time workflow-run snapshot. The timeline does not infer success from
the current workflow definition.

Each displayed action resolves its exact linked record independently of the
12-item history window. Agent requests must match the community, requester,
workflow run, action, prompt snapshot, and source receipt. Movement receipts
must match the community, workflow, membership, run/action, revision, source
milestone, and entry time. A missing or mismatched link projects `unavailable`,
not queued/running/success. An explicit failed workflow run remains evidence
of failure even without a downstream receipt. These are read-model statuses;
no persisted status or execution/retry policy changes. Builder Markdown, the
existing dossier, and member self-context share these outcomes.

The old goal evaluator, checks, judgment passes, milestone-pass table, and
evaluation funding surface do not exist in V1.

## Membership context

The member-in-community is the context boundary, not the workflow. The shared
`CommunityMembershipContext` contract contains explicit community, user, and
membership IDs; canonical profile identity; member-approved community facts with
record ID, provenance, and timestamps; optional workflow position; and bounded
recent execution/movement history.

`resolveBuilderCommunityMembershipContext` is the builder-only reader. It
requires current manager authority, an active target membership in that exact
community, and the existing founder/admin fact-consent predicate. Personal and
other-community facts, unapproved facts, and internal behavioral observations
are excluded. Callers resolve the actor from authentication; they cannot select
a more permissive lens.

The existing dossier query is its first adapter. A community with no workflow
returns `workflow: null`, not an error or an automatically created workflow.
Markdown and the dossier modal both support that state. No new navigation is
introduced in this slice.

Workflow lookup, unique member progress, and first-milestone defaulting are
shared read rules used by the board, execution, dossier, and member self-context
projection. Reads never initialize state. Duplicate records and unknown
milestones fail closed; recorded completion and historical names are preserved.

No new tables, stored directories, Markdown copies, or memory permissions are
introduced. This builder reader must not be reused as an agent-access shortcut.

### Member self-context

Native personal agents and authorized external MCP agents discover
`/communities/<slug>/members/me/context.md` through `polynet_list` on the
community's `members/` directory, then `me/`. They use the same `polynet_read`
executor and self-only query. `me` is the authenticated actor, never a tool
argument naming another member. Current community access is checked again in
the query; the community-owned agent cannot list or read this subtree using
its sponsor's identity.

The document projects identity, current membership, optional workflow position,
approved community facts, recent action statuses, and movement history. It
reuses private record assembly with the builder reader but strips prompt
snapshots and uses the canonical `member_orientation` fact lens. Private,
other-member, other-community, unapproved, and observed-behavior facts are
excluded. A community owner without a membership row receives identity with
null membership/workflow fields; reading never synthesizes membership.

Facts scan at most 121 rows to inspect a 120-row recent creation window and
return at most 12 approved facts, ordered by update time within that window.
This is explicitly a bounded orientation, not an exhaustive fact export.
Activity and movement history each retain their existing 12-row bounds.
The rendered document stays within the canonical 24,000-character tool limit,
shedding oldest history before facts if needed and reporting truncation.
`read_at` identifies the fresh query snapshot. Queued activity does not mean
completed activity, and no workflow does not mean success.

The hidden local `/self.md` document, renderer, and duplicate workflow assembler
are deleted, with no compatibility alias. Global `/users/me/profile.md` and
public member profile paths are unchanged. This document is read-only context,
not new action authority, and is not indexed by search. It adds no tables,
Markdown persistence, cache, synchronization writer, or automatic prompt
injection. Live signed-in native/MCP acceptance remains a separate test gate.

Personal-agent guidance routes questions about the member's progress or next
steps through the active community's returned `members/` then `me/` directory
and `context.md` document. Global profile reads remain identity context, not
progress authority. Retrieval is on demand, not every turn; a new progress
question calls for fresh context. No active community means no scoped progress
guidance. Suggestions are not configured requirements, unavailable outcomes
are not ongoing work, and neither context nor a reply authorizes advancement.

### Workflow agent orientation

The existing community-agent participant loader remains the agent fact reader:
approved community facts use `member_orientation`, not the builder dossier.
For workflow actions only, the requester also receives a compact read-only
workflow projection in that participant context. Other thread participants do
not receive workflow enrichment. Ordinary mentions remain unchanged, including
community owners without a membership row.

The worker validates the durable run's community, action/prompt, contribution
receipt, and exact active requester membership before composing context.
Recreated membership rows cannot inherit old queued actions. Canonical duplicate
membership/workflow/state checks and invalid-milestone checks fail closed.
Known context invariant failures fail the claimed attempt through the existing
failure path rather than leaving it running until lease recovery. Unexpected
infrastructure exceptions retain the existing leased recovery behavior.

Two positions are deliberately distinct:

- `action_origin`: immutable run ID, workflow/revision, milestone, and receipt
  captured when the trigger admitted the action.
- `current_at_context_read`: current workflow/revision, milestone and completion
  state from canonical readers within the context query. Null means no current
  workflow, not success. Reading a default milestone never creates state.

Prompt admission may be followed immediately by deterministic movement. Later
movement or edits do not retarget the queued prompt; the agent sees the captured
instruction alongside the current position. Neither context nor an agent reply
authorizes movement. This is not action chaining or a goal loop.

Orientation is bounded, JSON-escaped data in the existing untrusted participant
section. It must not be silently dropped under transcript pressure. The existing
attempt-specific context snapshot records the exact provider input; no additional
table, stored Markdown directory, cache, scheduler, or synchronization writer is
introduced. A retry reads fresh authorized facts/state but retains the original
action snapshot. Earlier attempt snapshots are not rewritten.

Membership/source access is rechecked at snapshot and reply persistence. Fact
consent is evaluated at context-read time, not continuously during inference;
fact revocation cannot undo context already sent to a provider. This slice does
not add a per-fact finalization/revocation protocol or cross-community access.

## Authority and safety

- Builder mutations require current manager authority and an expected revision.
- Contributions must be live, human-authored, channel-addressable, and owned by
  an active community member with current access to the source channel.
- Invite-only contributions can drive deterministic movement without an agent
  grant. Prompt actions additionally require the community agent to be invited
  and able to reply. Private runs answer in the originating thread; they cannot
  publish elsewhere or write shared memory. See `community-private-channels-v1.md`.
- Agent action intake re-reads the workflow run and exact prompt snapshot,
  rechecks source identity/access, and uses the canonical community-agent
  funding and worker path.
- Prompt instructions are community policy beneath platform policy; they do not
  grant builder authority or weaken tool boundaries.
- A durable serve admission completes the workflow action. Provider execution
  continues under the existing leased community-agent worker.

## Explicitly deferred

Time and external triggers, arbitrary event filters, goals, LLM judges,
multi-step loops, action graphs, action chaining, agent selection, and manual
member movement are not V1 primitives. Add one only after a real use case cannot
be expressed by the grammar above.
