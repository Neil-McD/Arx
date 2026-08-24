# Community Member Workflows Foundation v1

Status: staging foundation

## Outcome

Workflows is the builder-only operating surface for a community's member
success path. A builder sees an ordered horizontal set of stages, edits each
stage in place, and adds another stage from the terminal plus button.

The builder defines only two things: a stage name and, for every non-terminal
stage, a plain-language milestone. The system observes canonical product
evidence and evaluates whether that milestone is actually complete. This is a
success path, not a generic automation builder.

## Irreducible model

The runtime has five canonical parts:

1. ordered stage definitions
2. one current stage per active member, with the first stage implicit
3. canonical evidence already owned by Polynet or an authorized integration
4. durable milestone evaluations
5. append-only transition receipts

There is no separate builder-facing trigger, event, rule, condition, objective,
or completion-definition model. A new piece of evidence is only a wake-up cue.
It never advances a member directly.

## Workflow definition

There is at most one workflow definition per community.

- `communityId`
- ordered stages with opaque server identities and names
- an optional natural-language `milestone` on each non-terminal stage
- optimistic `revision`
- creator/updater and timestamps

The builder API exposes only append, exact stage update, and delete operations.
Callers cannot submit stage identities or replace the whole definition. Existing
stage keys remain stable; every new key is generated once by the server. There
is no draft, publish, activation, version migration, reorder, or enrollment
backfill state.

The terminal stage cannot have a milestone because there is no next stage to
enter.

## Member stage

Every active community membership is conceptually in the workflow's first
stage unless a `communityMemberWorkflowMemberStages` row records a different
stage. Membership remains authoritative for identity and access.

Stored state contains only:

- workflow and membership references
- current stage key and stage-entry time
- transition sequence

It does not copy user identity, membership status, activation sequence, or a
workflow version.

## Evidence wake

An eligible canonical event may enqueue an evaluation of the member's current
milestone. The wake receipt is deduplicated per workflow and membership. It
captures the current workflow revision, stage, stage-entry time, milestone
text/hash, and evidence window before scheduling work.

The first implemented wake is a new canonical human root or reply in a
community channel. Personal-agent, community-agent, system, private, hidden,
deleted, owner-without-membership, inactive-membership, unconfigured, and
terminal-stage cases do not enqueue work.

Root wakes use the canonical `interaction:root:{id}` evidence reference and
reply wakes use `interaction:reply:{id}`. The wake runs after the interaction
commits, so evaluation failure cannot make posting unavailable. It is scheduled
before community-agent intake so downstream agent work can observe a completed
transition when timing permits, without making agent intake depend on it.

Future time and external wakes must enter through this same evaluation
boundary. They must reference canonical, authorized receipts rather than invent
a second workflow event store.

## Milestone evaluation

`communityMemberWorkflowMilestoneEvaluations` is the durable work and decision
receipt. It records:

- workflow, membership, stage, revision, and milestone snapshot/hash
- wake kind and canonical wake receipt
- bounded evidence window and cited evidence references
- queued/running/finished/failed/stale lifecycle with lease and attempt count
- `complete`, `not_complete`, or `uncertain` decision
- deterministic or model evaluator kind
- explanation, missing evidence, and timestamps

The first evaluator reads only eligible canonical human channel contributions
from the member inside the current stage window. It sends a bounded evidence
set to the canonical Polynet runtime harness with no tools. The output contract
is strict JSON. Cited references must be a subset of the supplied evidence, and
`complete` requires at least one cited evidence item.

No evidence yields a deterministic `uncertain` result without provider spend.
Provider work uses the community-owner inference funding path and a unique
receipt for each claimed attempt. Failed work retries at most three times.

## Transition authority

Only a finished `complete` evaluation may move a member. Finalization rechecks:

- active membership
- workflow identity and revision
- current stage and stage-entry time
- milestone hash
- existence of the immediate next stage

Any changed authority makes the evaluation stale. `not_complete` and
`uncertain` are durable decisions and do not move the member. A successful
evaluation advances exactly one stage in the same transaction and writes one
append-only `communityMemberWorkflowTransitions` receipt referencing the
evaluation, workflow revision, and milestone hash.

There is no public or generic transition mutation, no direct event-to-stage
move, and no arbitrary target stage.

## Authority and privacy

- Only a community owner/admin/moderator may read or edit the builder board.
- Evaluation and transition require an active membership in the same community.
- A stage containing stored member state cannot be deleted.
- The implicit first stage cannot be deleted while active members exist.
- Revision, claim, definition, and receipt conflicts fail closed.
- `/self.md` may expose only the authenticated member's current stage and
  milestone under the selected authorized community lens.
- Workflow state is never exposed through another member's semantic profile.

## Builder surface

The page intentionally contains only:

- `Workflows` header
- horizontal stage columns
- compact member stubs with canonical avatar, name, and time in the current
  stage
- edit button on a configured stage
- setup button on an unnamed first stage
- terminal plus button for another stage
- name-only creation modal
- a natural-language `Move to the next stage when` field on persisted
  non-terminal stages
- cursor-based member loading when the board has another page

While the page is open, one manager-authorized realtime projection watches
only the workflow revision, active-member count, and latest transition receipt.
A token change invalidates the visible board and rebuilds every member page the
builder has already loaded. Concurrent invalidations are coalesced into one
refresh plus at most one follow-up refresh, and changing community scope
discards stale results. This is event-driven; Workflows has no polling loop.

There is no separate editing canvas, trigger selector, workflow details form,
start/publish button, evidence form, completion form, enrollment inspector, or
manual status machine.

## Deferred

The foundation does not yet implement:

1. scheduled/time evaluation wakes
2. external integration evidence and wakes
3. proactive agent actions or autonomous loops inside a stage
4. builder-visible evaluation history or explanations
5. manual review/override controls

Those slices must reuse the same evidence, evaluation, transition, runtime,
funding, membership, and receipt authorities. They must not recreate retired
workflow versions, enrollments, evidence mirrors, or a generic automation DSL.
