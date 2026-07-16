# Community Memory Retrieval Receipt Staging Acceptance — 2026-07-16

Status: passed

## Scope

This certificate covers the canonical privacy-safe accepted-memory retrieval
receipt on Convex staging deployment `basic-robin-885`. Production was not
touched.

The disposable fixture exercised the actual accepted-memory search, read,
feedback, and outcome functions with authenticated member and manager
identities.

## Happy path

The personal-agent dock, community Concierge, and external MCP each:

- returned the same accepted memory
- wrote a `community_memory_retrieval_receipt:v1` receipt with the correct
  surface, community, and viewer
- persisted no raw search query
- reused that same receipt when the memory was read and injected

The three receipts recorded `useful`, `wrong`, and `stale` feedback. The
external-MCP receipt also recorded an outcome tied to the returned node.

## Fail-closed boundaries

Staging rejected:

- reading an accepted node that the receipt did not return
- using a receipt on a different surface
- using a receipt in a different community
- outsider search without entitlement
- manager attempts to read, give feedback on, or attach an outcome to another
  viewer's receipt
- reading a previously returned node after its lifecycle changed to `archived`

The archived node also disappeared from subsequent accepted-memory search.

## Cleanup

The fixture cleanup probe found zero remaining communities, memberships,
nodes, retrieval logs, outcomes, or change requests. The temporary acceptance
function was removed from the staging deployment and
`POLYNET_MEMORY_RECEIPT_ACCEPTANCE_ENABLED` was unset.

The machine-readable certificate is
`scripts/fixtures/community_memory_retrieval_receipt_staging_acceptance_20260716.json`.
