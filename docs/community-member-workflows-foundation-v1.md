# Community Member Workflows Foundation v1

Status: staging foundation

## Outcome

Workflows is the builder-only operating surface for a community's member
success path. A builder sees an ordered horizontal set of stages, edits each
stage directly, and adds another stage from the terminal plus button.

The foundation is deliberately smaller than an automation builder. It owns
only the pipeline definition, a member's current stage when it differs from the
default, and append-only transition receipts.

## Canonical model

### Workflow definition

There is at most one workflow definition per community.

- `communityId`
- ordered stages with opaque server identities, names, and at most one optional
  completion trigger
- optimistic `revision`
- creator/updater and timestamps

The builder API exposes only append, exact stage update, and delete operations. Callers
cannot submit stage identities or replace the whole definition. Existing stage
keys remain stable; every new key is generated once by the server. There is no
draft, publish, activation, version migration, reorder, or enrollment backfill
state.

### Member stage

Every active community membership is conceptually in the workflow's first
stage unless a `communityMemberWorkflowMemberStages` row records a different
stage. Membership remains the authority for identity and access.

The stored state contains only:

- workflow and membership references
- current stage key and stage-entry time
- transition sequence

It does not copy user identity, membership status, activation sequence, or a
workflow version.

### Transition receipt

Every actual stage change writes an append-only
`communityMemberWorkflowTransitions` receipt containing:

- community, membership, and workflow references
- ordered from/to stage keys
- trigger type: `in_app`, `time`, or `external`
- required canonical source receipt reference
- occurrence and creation timestamps

The transition kernel is internal and fail-closed. Product triggers must call
it from trusted server code. A source receipt may cause at most one transition
for a workflow membership; exact retries replay and conflicting reuse fails.

### First in-app trigger

The only implemented completion trigger is `channel_contribution`. A builder
may attach it to any non-terminal stage. A new canonical human root or reply in
a community channel schedules an internal evaluator using the interaction row
itself as the receipt. Personal-agent, community-agent, system, private,
hidden, deleted, owner-without-membership, inactive-membership, unconfigured,
and terminal-stage cases do not advance.

The evaluator moves the member only from their configured current stage to its
immediate next stage. Root receipts use
`in_app:community_interaction_root:{id}` and reply receipts use
`in_app:community_interaction_reply:{id}`. Replaying either receipt cannot move
the member again. The trigger runs after the interaction commits so workflow
evaluation cannot make channel posting unavailable. It is scheduled before
community-agent intake so downstream agent work observes the newest stage.

## Authority and privacy

- Only a community owner/admin/moderator may read or edit the builder board.
- A transition requires an active membership in the same community.
- A stage containing stored member state cannot be deleted.
- The implicit first stage cannot be deleted while active members exist.
- Revision and source-receipt conflicts fail closed.
- `/self.md` may expose only the authenticated member's current stage under the
  selected authorized community lens.
- Workflow state is never exposed through another member's semantic profile.

## Builder surface

The page intentionally contains only:

- `Workflows` header
- horizontal stage columns
- canonical member avatars in their current stage
- edit button on a configured stage
- setup button on an unnamed first stage
- terminal plus button for another stage
- name-only creation modal
- one `Move member when` selector when editing a persisted non-terminal stage
- cursor-based member loading when the board has another page

While the page is open, one manager-authorized realtime projection watches
only the workflow revision, active-member count, and latest transition receipt.
A token change invalidates the visible board and rebuilds every member page the
builder has already loaded. Concurrent invalidations are coalesced into one
refresh plus at most one follow-up refresh, and changing community scope
discards stale results. This is event-driven; Workflows has no polling loop.

There is no separate editing canvas, workflow details form, start/publish
button, evidence form, completion form, enrollment inspector, or manual status
machine.

## Deferred

The remaining trigger families are:

1. additional in-app events
2. time
3. external events

Those triggers must create or reference canonical product/provider/runtime
receipts and invoke the transition kernel. They must not recreate the retired
evidence, workflow-version, or enrollment-reconciliation systems. Agent
prompts, loops, and actions remain a separate later slice.
