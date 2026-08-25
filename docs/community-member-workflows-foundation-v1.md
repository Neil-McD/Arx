# Community Member Milestone Workflows v1

Status: staging completion kernel

## Outcome

Workflows is the builder-only operating surface for a community's member
success path. The path is one ordered set of milestones. Every active member is
pursuing exactly one milestone until its completion checks pass.

A milestone contains only:

- an opaque server-owned key
- a builder-authored name
- zero or more all-of completion checks

Checks are either automatic product-state checks or bounded AI judgments. A
milestone with no checks is visible but cannot complete. Passing the final
milestone completes the workflow; there is no dummy terminal position.

## Irreducible runtime

The runtime has four canonical persistence lanes:

1. `communityMemberWorkflows`: ordered milestone definitions and revision
2. `communityMemberWorkflowMemberMilestones`: one explicit member projection
   after the first advancement or final completion
3. `communityMemberWorkflowMilestoneEvaluations`: leased judgment work and
   durable results
4. `communityMemberWorkflowMilestonePasses`: append-only successful completion,
   advancement, and final-completion receipts

There is no separate builder-facing stage, trigger, event, action, condition,
objective, pass policy, enrollment, evidence mirror, or transition table.

## Completion checks

V1 supports exactly two automatic checks backed by canonical product evidence:

- `channel_posted`: the member created an eligible human channel root after
  entering the milestone
- `channel_replied`: the member created an eligible human channel reply after
  entering the milestone

V1 also supports judgment checks containing a bounded plain-language criterion.
All configured checks must pass. There is no OR, threshold, nesting, or generic
predicate language.

Automatic checks read existing canonical interaction records. They do not
create an event mirror. Judgment checks use the same eligible member evidence
window and the canonical Polynet inference funding/runtime path.

## Member-action routing

After an eligible human channel contribution commits, Polynet routes the
canonical receipt through the member's current milestone:

1. reject inactive membership, wrong scope, private/system/agent content,
   pre-milestone activity, completed workflows, and unconfigured milestones
2. resolve every automatic check from canonical evidence
3. stop without provider work if an automatic prerequisite is missing
4. record a milestone pass immediately when a purely automatic milestone is
   satisfied
5. otherwise admit or coalesce one judgment evaluation

The scheduled post-commit resolver protects chat availability. It is not an
agent wake, autonomous loop, or progression authority of its own.

## Judgment evaluation

One evaluation snapshots:

- workflow revision
- milestone identity, name, and entry time
- every completion-check definition and the combined definition hash
- the triggering member-action receipt
- a bounded evidence window
- one result per judgment check

The evaluator receives no tools. Builder criteria and member evidence are
explicitly untrusted contextual data. Output is strict JSON; every result must
match one supplied check key and every citation must match supplied evidence.
`complete` requires at least one cited evidence reference.

Concurrent contributions coalesce into one active evaluation. A contribution
arriving during provider work requests one serialized rerun over the widened
evidence boundary rather than starting a parallel model call.

## Completion authority

Only the canonical completion reducer may progress a member. Before writing a
pass it rechecks:

- active membership in the same community
- workflow identity and revision
- current milestone and entry time
- current completion-check hash
- eligible cited evidence
- every automatic and judgment result

A successful pass atomically updates member progress and writes one immutable
`communityMemberWorkflowMilestonePasses` receipt. The receipt contains the
completion method, check results, evidence references, source action, current
revision, next milestone when present, and whether the workflow completed.

Retries and replays are idempotent. Changed authority makes model work stale.
No public mutation may select an arbitrary member position.

## Builder surface

The page intentionally contains only:

- `Workflows` header
- horizontal milestone columns
- canonical member profile stubs and time in the milestone
- one edit button per configured milestone
- one setup button for the initial blank milestone
- one terminal plus button to append a milestone
- a name-only creation modal
- a compact `Complete when` check editor
- a manager-only read-only member success dossier

The board subscribes to workflow revision, active-member count, latest pass,
and latest evaluation state. It reconciles without polling and refreshes an
open dossier when evaluation state changes.

The dossier projects canonical membership, approved community-scoped member
facts, current milestone checks, the latest judgment, and bounded immutable
milestone history. Its deterministic Markdown rendering labels member and
workflow content as contextual data, not trusted instructions. It is not yet
mounted as an agent-readable semantic document.

## Authority and privacy

- Only owner/admin/moderator roles may read or edit Workflows.
- Membership remains identity and access authority.
- Builders see only approved facts scoped to their community.
- Personal memory and private agent conversations are not workflow evidence.
- `/self.md` exposes only the authenticated member's current milestone and
  completion status under the selected authorized community lens.
- Definition, revision, claim, scope, and receipt conflicts fail closed.

## Deferred

This kernel does not implement:

1. durable agent goals, tasks, or intervention loops
2. scheduled follow-up or inactivity wakes
3. coach assignment or manual review
4. external evidence adapters
5. call attendance, resource uploads, or generic webhooks
6. configurable completion policies
7. population-level success analytics

Those slices must reuse the milestone, evidence, evaluation, funding,
membership, pass-receipt, and runtime authorities defined here. They must not
reintroduce stages, a generic automation DSL, or direct event-to-position
mutations outside the completion reducer.
