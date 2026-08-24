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
- ordered `stages: [{ key, name }]`
- optimistic `revision`
- creator/updater and timestamps

Saving a stage edits the canonical definition immediately. There is no draft,
publish, activation, version migration, or enrollment backfill state.

### Member stage

Every active community membership is conceptually in the workflow's first
stage unless a `communityMemberWorkflowMemberStages` row records a different
stage. Membership remains the authority for identity and access.

The stored state contains only:

- community, workflow, and membership references
- current stage key and stage-entry time
- transition sequence and optimistic revision

It does not copy user identity, membership status, activation sequence, or a
workflow version.

### Transition receipt

Every actual stage change writes an append-only
`communityMemberWorkflowTransitions` receipt containing:

- membership and workflow references
- ordered from/to stage keys
- cause type: `builder`, `in_app`, `time`, `external`, or `system`
- optional canonical source receipt reference
- actor type: `builder`, `agent`, or `system`
- idempotency key/fingerprint and timestamp

The transition kernel is internal and fail-closed. Product triggers must call
it from trusted server code and supply a durable source reference whenever one
exists.

## Authority and privacy

- Only a community owner/admin/moderator may read or edit the builder board.
- A transition requires an active membership in the same community.
- A stage containing stored member state cannot be deleted.
- Revision and idempotency conflicts fail closed.
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
- name-only stage modal

There is no separate editing canvas, workflow details form, start/publish
button, evidence form, completion form, enrollment inspector, or manual status
machine.

## Deferred next slice

Stage configuration for triggers and agent actions is not represented yet.
The next slice may add only the three agreed trigger families:

1. in-app events
2. time
3. external events

Those triggers should reference canonical product/provider/runtime receipts and
invoke the transition kernel. They must not recreate the retired evidence,
workflow-version, or enrollment-reconciliation systems.
