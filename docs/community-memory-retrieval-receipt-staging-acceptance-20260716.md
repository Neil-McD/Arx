# Community Memory Retrieval Receipt Canonicalization — Staging Acceptance

Status: passed
Date: 2026-07-16

## Isolated target

- Convex deployment: `effervescent-impala-326`
- Deployment reference:
  `neil-mcdevitt:polynet:dev/memory-receipt-v1-20260716`
- Deployment kind: `staging`
- Expiration: one day
- Production touched: no

The prior isolated deployment had expired, so this proof created a fresh,
empty, self-expiring Convex dev deployment in the Polynet project. Only the
minimum auth configuration, staging marker, and temporary acceptance flag were
present.

## Canonical surface proof

The member identity exercised the real adapter path for:

- personal agent: `executeRetrievalHarnessTool`
- community Concierge: `executeConciergeTool`
- external harness: JSON-RPC through `handleMcpPost`

All three surfaces:

- searched and read the same accepted intelligence node
- created `community_memory_retrieval_receipt:v1`
- attributed the receipt to the exact surface, viewer, and community
- reused the search receipt for read
- marked the read node injected
- persisted no raw query
- returned no receipt-wide feedback field

The external MCP outcome path rejected the node after search alone with
`community_intelligence_retrieval_node_not_injected`. The same outcome
succeeded after read marked that exact node injected.

## Fail-closed proof

Staging rejected:

- a node the receipt did not return
- a receipt reused through another surface
- a receipt reused in another community
- an unversioned historical receipt on read
- an unversioned historical receipt on outcome
- an outcome without `node_id`
- an outcome for a returned but uninjected node
- owner/manager attempts to read or record an outcome against another viewer's
  receipt

The fabricated unversioned receipt also carried historical raw query and
receipt-wide feedback fields. A metabolizer settlement remained `noop`, and the
node's retrieval-usefulness and staleness scores remained unchanged. This
proves historical receipts are audit-only rather than active learning input.

## Deleted deployed APIs

The post-deploy Convex function specification contained:

- the canonical internal
  `recordCommunityOutcomeObservationInternal`

It did not contain:

- `retrieveCommunityIntelligenceForWorkflow`
- `recordCommunityIntelligenceRetrievalFeedback`
- public `recordCommunityOutcomeObservation`

The source contains one canonical production receipt insert. The only second
insert during acceptance belonged to the temporary fixture that fabricated an
unversioned historical row.

## Cleanup

The final fixture cleanup deleted:

- 2 communities
- 2 users
- 2 memberships
- 3 intelligence nodes
- 5 retrieval receipts
- 1 outcome observation
- 1 change request
- 1 metabolizer run

A post-cleanup query found zero fixture communities and zero fixture users. The
temporary acceptance environment flag was removed, the acceptance module was
deleted, the deployment was pushed again, and the final function specification
confirmed the acceptance functions were absent.

The machine-readable certificate is
`scripts/fixtures/community_memory_retrieval_receipt_staging_acceptance_20260716.json`.
