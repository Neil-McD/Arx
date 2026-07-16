# Community Cognition Cleanup — Staging Acceptance

Status: passed
Date: 2026-07-16

## Isolated target

- Convex deployment: `coordinated-otter-526`
- Deployment reference:
  `neil-mcdevitt:polynet:dev/cognition-cleanup-v1-20260716`
- Deployment kind: `staging`
- Expiration: one day
- Production touched: no

The proof used a fresh empty deployment and temporarily installed one
environment-gated acceptance module. It did not change production, the shared
staging deployment, community deletion, cron configuration, or schema.

## Fixture and live-community denial

The disposable target contained:

- one record in thirteen cleanup phases
- 205 source traces, forcing three bounded deletion batches
- 218 derived cognition records in total
- one chat/interaction, AI Feed post, event, and Concierge serve request as
  product-source non-interference sentinels

The untouched control contained one row in each of the fourteen cognition
phases and the same four product-source sentinels.

Before community deletion, both inspection and deletion failed closed with
`community_cognition_cleanup_live_community_forbidden`.

## Canonical lifecycle and late-write denial

The proof deleted the target through the real public
`community:deleteCommunity` mutation under the seeded owner's verified CLI
identity. The community row disappeared while all 218 cognition rows and all
four product-source sentinels remained available for the cleanup proof.

After deletion, every guarded cognition seam rejected a late write with
`community_cognition_write_community_not_found`:

- source trace
- compiler digest
- trusted change request
- accepted change-request apply
- community-agent run event
- archive projection
- evidence-retrieval audit

## Bounded cleanup and non-interference

The canonical internal cleanup primitives deleted all 218 target cognition
rows. Every phase used a batch limit of 100. The 205 source traces required
three batches; every other phase required one. Final inspection reported all
fourteen phases empty.

An immediate replay across every phase deleted zero records. Throughout the
cleanup:

- the control retained all fourteen cognition records
- target and control interactions remained unchanged
- target and control AI Feed posts remained unchanged
- target and control events remained unchanged
- target and control Concierge serve requests remained unchanged

This proves the cleanup allowlist is derived-cognition-only and idempotent.

## Teardown and deployed surface

Fixture teardown removed:

- the control's fourteen cognition records
- ten target/control product-source sentinel rows
- the remaining control membership and community
- both fixture users

A final state read found zero target or control cognition, product sources,
communities, or users. The temporary acceptance flag was unset, the temporary
module was deleted, and the deployment was pushed again.

The final function specification contains:

- `inspectDeletedCommunityCognitionInternal`
- `deleteDeletedCommunityCognitionBatchInternal`

It does not contain the acceptance module or any acceptance function.

The machine-readable certificate is
`scripts/fixtures/community_cognition_cleanup_staging_acceptance_20260716.json`.
