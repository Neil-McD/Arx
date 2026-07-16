# Community Memory Outcome Idempotency — Staging Acceptance

Status: passed
Date: 2026-07-16

## Isolated target

- Convex deployment: `effervescent-impala-326`
- Deployment reference:
  `neil-mcdevitt:polynet:dev/memory-receipt-v1-20260716`
- Deployment kind: `staging`
- Self-expiring deployment: yes
- Production touched: no

The proof temporarily restored one environment-gated acceptance action on the
isolated deployment. The action seeded one member, one community, three
accepted-memory nodes, and three V1 external-MCP retrieval receipts. It called
the canonical internal outcome mutation rather than a duplicate implementation.

## Transactional replay proof

The first outcome for one receipt/node pair created:

- one outcome observation
- one pending `attach_outcome` change request
- one outcome reference on the receipt

An exact retry with formatting-only note whitespace returned the same
`outcome_observation_id`, normalized the note to the same stored value, reported
`deduplicated: true`, and created no additional records.

Two identical outcome calls were then started concurrently against a fresh
receipt/node pair. Convex serialized the competing receipt writes:

- both calls succeeded
- both returned the same outcome id
- one reported `deduplicated: false`
- one reported `deduplicated: true`
- the database contained one outcome, one change request, and one receipt link
  for that consumption episode

This proves effectively exactly-once write effects under at-least-once delivery.

## Immutable conflict and episode boundaries

Staging also proved:

- the same receipt/node with a changed result status failed with
  `community_memory_outcome_conflict`
- a second injected node on the same receipt created a distinct outcome
- the original node through a new receipt created a distinct outcome
- four legitimate consumption episodes produced exactly four outcomes and four
  change requests
- the three receipt ledgers contained `2`, `1`, and `1` outcome references

No caller idempotency key, replay table, schema field, schema index, or compiler
`workKey` was added.

## Cleanup

The acceptance action deleted:

- 4 change requests
- 4 outcome observations
- 3 retrieval receipts
- 3 intelligence nodes
- the fixture membership, community, and users

The temporary acceptance action was then deleted, the acceptance flag and
local-dev auth fallback variables were removed, and the final source was pushed
again. The final deployed function specification contains the canonical
`recordCommunityOutcomeObservationInternal` mutation and no outcome-idempotency
acceptance function.

The machine-readable certificate is
`scripts/fixtures/community_memory_outcome_idempotency_staging_acceptance_20260716.json`.
