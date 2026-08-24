# Community Member Workflows Foundation v1

Status: implementation contract

## Outcome

One community can own one active, versioned member-success workflow. Every
active community membership can be enrolled exactly once for its activation,
occupies one current stage, and moves only through an authorized, atomic,
auditable transition backed by explicit evidence or an explicit manual
decision.

This is the deterministic state substrate for future proactive client success.
It is not an automation builder, onboarding flow, course-completion tracker, or
second agent harness.

## Product Surface

Builders see `Workflows` in the community rail directly above `Funnel`.
Members do not see the builder pipeline.

The first surface has one interaction model:

1. Land directly on an ordered horizontal canvas with one blank stage column
   when no workflow exists yet.
2. Set up a stage in a focused modal without changing the canvas into an editor.
3. Add another blank stage with the single plus control immediately after the
   final stage.
4. Select a member to inspect current state, evidence, and history in an overlay.
5. Move the member with an explicit reason and optional evidence.
6. Complete the workflow through a separate explicit decision when the defined
   outcome is achieved.
7. Start or publish the complete path as an immutable workflow version.

There is no separate setup wizard, empty-state gate, or full-page definition
form. Rendering the one-stage blank column does not write canonical state.
The terminal plus action remains available while other stages are blank.
Incomplete columns stay local to the builder's current canvas; stage-modal Save
writes canonical draft state only once every stage is valid. Start workflow
remains an explicit builder command.

There are no Pipeline, Integrations, or Activity tabs. Integrations and
autonomous actions are later capabilities attached to concrete criteria and
interventions, not empty navigation surfaces.

## Visual Direction

Visual thesis: a calm, production-native operating board with restrained
surface hierarchy, real member identity, and one theme-owned selection accent.

Content plan:

- Header: the canonical compact community utility row, with page identity,
  status, and only the necessary activation action; no page-level subtitle.
- Canvas: horizontally ordered stage columns plus one terminal Add action.
- Stage column: stage identity, member count, member cards, and one edit affordance.
- Stage modal: stage name and safe deletion.
- Member overlay: current state, accepted evidence, and transition history.

Interaction thesis:

- Stage setup opens over the unchanged operating canvas.
- Member selection opens an explicit overlay or mobile full-screen surface.
- Stage edits and member movement preserve spatial continuity and honor
  reduced-motion preferences.

## Canonical Owners

- `communityMemberships` remains access and member-activation authority.
- Workflow tables own workflow definitions and member-success state.
- Workflow evidence owns claims about progress; it may reference existing
  product evidence but does not copy private personal memory.
- Workflow transitions own append-only progress history.
- `memberFacts`, `memberProfileSpines`, and personal memory remain separate.
- Community intelligence may consume privacy-safe workflow outcome traces later;
  it does not own individual progress state.
- The existing Polynet runtime and canonical five operations remain the only
  agent harness and public operation surface.
- Retired community-onboarding tables remain compatibility tombstones and are
  never read or written by this domain.

## Records

### `communityMemberWorkflows`

The stable community-owned workflow identity.

- one non-archived workflow per community in v1
- `draft | active | archived`
- pointers to the current draft and active version
- optimistic `revision`
- creator/updater and timestamps
- no hidden workflow name; the community owns one canonical path

### `communityMemberWorkflowVersions`

A bounded workflow definition.

- mutable only while `draft`
- immutable after activation
- monotonically increasing version number
- one to twelve ordered stages
- stable stage keys within the workflow
- stage name only in this foundation slice

The foundation deliberately does not store prose objectives or prose
completion definitions. A later slice may add typed completion criteria and
bounded agent instructions when their authority and execution contracts exist.
Those are not compatibility aliases for the retired prose fields.

### `communityMemberWorkflowEnrollments`

One member's state for one membership activation.

- bound to workflow, active version, membership, user, and activation sequence
- `active | paused | completed | exited`
- exactly one current stage while active or paused
- optimistic revision and stage-entry timestamp
- completion/exit timestamps when applicable

### `communityMemberWorkflowEvidence`

An explicit, append-preserving claim about progress.

- bound to enrollment, workflow version, stage, and optional criterion key
- `member | builder | product | provider | agent_assessment` source type
- `pending | accepted | rejected | superseded`
- bounded summary plus optional canonical source reference
- confidence and uncertainty are recorded, never silently converted to truth
- actor, observation time, and decision time

### `communityMemberWorkflowTransitions`

The append-only movement receipt.

- workflow version, enrollment, membership, and user
- from/to stage
- `enrolled | manual_move | evidence_confirmed | completed | paused | resumed | exited`
- evidence references, actor, reason, and idempotency key
- transition sequence and timestamp

## Authority

- Owner/admin with current `can_manage_members` capability may create/edit/
  activate workflows, review evidence, and move members.
- A member may read their own enrollment and later submit their own evidence;
  member evidence submission is not part of the first builder slice.
- Moderators and ordinary members cannot view the builder pipeline.
- Every operation revalidates community lifecycle, Builder operational state,
  role, membership, and target-community ownership server-side.
- Missing, inactive, revoked, cross-community, stale-revision, or ambiguous
  authority fails closed.

## Versioning and Enrollment

- Activating a draft freezes it and supersedes the prior active version.
- Existing enrollments remain pinned to their activated version. While any are
  active or paused, a replacement version cannot activate. v1 does not silently
  remap them; completed and exited histories remain attached to the old version.
- Activating the first version enrolls all current active membership rows at
  the first stage. The community owner is not manufactured as a synthetic
  membership or pipeline client.
- A future inactive-to-active membership transition enrolls once using
  `(workflowId, membershipId, activationSequence)`.
- An inactive or deleted membership exits its current active/paused enrollment
  through an append-only system transition. A later activation sequence gets a
  new enrollment rather than reopening the old history.
- Retry of an identical enrollment or transition is an idempotent replay.
- Reuse of an idempotency key for different normalized input conflicts.
- Membership backfill is paginated and retries a failed page with a bounded
  exponential delay before surfacing an explicit error state.

## Transition Rules

- A transition and its receipt are written in one Convex mutation.
- The enrollment revision increments exactly once.
- The target stage must exist in the enrollment's pinned version.
- Moving stages never completes an enrollment, including movement to the final
  stage.
- Completion is a separate authorized command that records a reason, preserves
  the current stage, sets the enrollment to `completed`, and appends a
  `completed` transition.
- Manual movement requires a bounded reason.
- Evidence can support a transition but AI assessment alone cannot authorize
  progression in v1.
- History is never rewritten when a stage or workflow draft changes.

## Semantic and Agent Boundary

The first slice may expose a bounded read-only projection of current workflow
state to the authenticated member's personal agent under the same explicit
community lens. It must not expose other members or private personal memory.

Builder-wide workflow operations, community-agent success outreach, automatic
skill activation, and proactive runtime execution are deferred until their
authority lenses are separately contracted.

## Explicit Exclusions

- integrations and inbound webhooks
- time/activity/provider triggers
- autonomous outreach
- automatic AI progression
- branching or graph editing
- multiple active workflows per community
- success analytics
- drag-and-drop as the only movement mechanism
- generic event bus or arbitrary community code
- writes to onboarding, member ontology, personal memory, or community memory

## Acceptance

1. The first visit renders one blank stage column without writing workflow
   state.
2. Builder creates a valid draft with one to twelve stages from the inline
   stage modal and terminal plus action.
3. Activating it creates one immutable version and enrolls every active member
   exactly once at the first stage.
4. A newly activated membership enrolls exactly once.
5. Manual movement updates enrollment state and creates one transition receipt
   without implicitly completing the workflow.
6. Explicit completion sets terminal status and creates one completion receipt.
7. Exact retries replay; conflicting idempotency-key reuse fails.
8. A member is present in exactly one stage for one enrollment.
9. Active-version definitions cannot be edited.
10. Cross-community and unauthorized operations fail closed.
11. The builder UI renders real members and canonical avatars in the production
    community shell across supported themes and viewport sizes.
12. The pipeline remains usable by keyboard and without drag-and-drop.
13. No production Git ref, deployment, Convex deployment, or production data is
    changed during staging development and acceptance.
14. The default canvas never renders a permanent stage editor, workflow-details
    form, or page-level edit mode.
