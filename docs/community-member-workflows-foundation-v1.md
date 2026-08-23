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

1. Scan the ordered stage board.
2. Select a stage to understand its objective and completion definition.
3. Select a member to inspect current state, evidence, and history.
4. Move the member with an explicit reason and optional evidence.
5. Edit a draft, then activate a new immutable workflow version.

There are no Pipeline, Integrations, or Activity tabs. Integrations and
autonomous actions are later capabilities attached to concrete criteria and
interventions, not empty navigation surfaces.

## Visual Direction

Visual thesis: a calm, production-native operating board with restrained
surface hierarchy, real member identity, and one theme-owned selection accent.

Content plan:

- Header: workflow identity, Draft or Active status, and one Edit action.
- Workspace: horizontally ordered stages with member rows as the primary data.
- Stage inspector: objective and completion definition.
- Member inspector: current state, accepted evidence, and transition history.

Interaction thesis:

- Stage selection moves the inspector context without navigating away.
- Member selection opens an explicit inspector or mobile full-screen surface.
- Draft edits and member movement use short, stateful transitions that preserve
  spatial continuity and honor reduced-motion preferences.

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

### `communityMemberWorkflowVersions`

A bounded workflow definition.

- mutable only while `draft`
- immutable after activation
- monotonically increasing version number
- one outcome name and outcome definition
- two to twelve ordered stages
- stable stage keys within the workflow
- stage name, objective, and completion definition

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
- Completion uses the final stage and sets the enrollment to `completed`.
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

1. Builder creates a valid draft with two to twelve stages.
2. Activating it creates one immutable version and enrolls every active member
   exactly once at the first stage.
3. A newly activated membership enrolls exactly once.
4. Manual movement updates enrollment state and creates one transition receipt.
5. Exact retries replay; conflicting idempotency-key reuse fails.
6. A member is present in exactly one stage for one enrollment.
7. Active-version definitions cannot be edited.
8. Cross-community and unauthorized operations fail closed.
9. The builder UI renders real members and canonical avatars in the production
   community shell across supported themes and viewport sizes.
10. The pipeline remains usable by keyboard and without drag-and-drop.
11. No production Git ref, deployment, Convex deployment, or production data is
    changed during staging development and acceptance.
