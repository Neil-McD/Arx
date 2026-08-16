# Community Member Concierge Welcome v1

## Purpose

Help recently joined members orient inside a community without adding another
member-onboarding flow. Membership activation remains immediate and canonical;
the welcome is a later, recoverable conversation projection.

## Irreducible behavior

- A real inactive-to-active membership transition registers the member for a
  community-scoped welcome batch.
- The first eligible activation opens one twelve-hour collection window.
  Additional eligible activations in that window converge on the same batch.
- At the due time, the system rechecks community lifecycle, the founder-owned
  welcome switch, founder-funded AI availability, and active membership.
- The community agent publishes one deterministic root in the canonical General
  channel and directly mentions at most 24 eligible members.
- Additional members are represented by bounded overflow copy, never an
  unbounded post or mention fanout.
- Direct user mentions create ordinary in-app attention but are explicitly
  ineligible for mention email.
- A member replying to the root enters the existing community-agent direct-reply
  conversation path. The welcome itself performs no inference.

## Authorities

- `communityMemberships` and `activateCommunityMembershipCore` own access and
  activation truth.
- `communities.conciergeWelcomesEnabled` is part of the existing versioned
  community settings snapshot. Absence means enabled; only the community owner
  may change it.
- `communityMemberWelcomeBatches` is bounded operational coordination state. It
  does not grant access and is not member-onboarding state.
- `createCommunityAgentCanonicalInteractionCore` remains the canonical chat
  writer for the concierge root; the existing internal mutation is its thin
  registered wrapper.
- `resolveCommunityInferenceFundingAdmission` remains the community AI funding
  authority.

## Failure and retry contract

- Failure to register or publish a welcome never rolls back membership.
- There is no global cron, full-community scan, or zero-delay registration job.
  Membership activation registers directly; one new batch schedules one due
  internal mutation.
- The scheduled mutation writes the canonical root, mentions, and batch
  settlement in one database transaction. Convex retries transient mutation
  failures without exposing partial publication state.
- Batch identity plus canonical interaction idempotency produce at most one root.
- A premature invocation is a no-op. A settled batch is a no-op.
- Disabled, archived, lifecycle-replaced, unfunded, or empty batches settle as
  skipped and produce no chat root.

## Deliberately absent

No workflow builder, configurable cadence, generated copy, per-member agent
turn, welcome email, global scheduler, activity-event authority, retired
`communityOnboarding` state, or second conversation writer is part of v1.
