# Community Resource Evidence Live Acceptance — 2026-07-14

> Historical certificate. The temporary deployed acceptance action used by
> this run has been removed; active proofs now target canonical runtime paths.

Status: passed

## Isolated deployment

- deployment: `basic-robin-885`
- deployment reference: `neil-mcdevitt:polynet:dev/lineage-evidence-20260714`
- acceptance run: `integration-20260714-a`
- result code: `community_resource_evidence_acceptance_passed`
- production data and production deployment were not touched

## Proven through real adapters

The seeded acceptance called the same resource tool adapters used by:

1. the bottom-right personal agent
2. the community Concierge
3. the external Polynet workspace MCP

The isolated action injected the already-authenticated actor and workspace
selector because it has no external identity-provider JWT. The canonical
resource evidence actions still revalidated the seeded owner's database access.

All three surfaces searched and read the same stable `resource:<id>` evidence
reference. Their retrieval audit rows recorded the correct surface and returned
refs without copying the raw query.

## Governance and lifecycle proof

- outsider access failed closed
- draft-module, builder-source, cross-community, and wrong-table references failed closed
- the generic member resource map exposed neither draft nor source state to the owner
- the explicit manager-only builder directory retained access to draft and source state
- hybrid retrieval found an archive-only page outside the bounded recent scan
- archive results were revalidated against canonical resource visibility
- moving a page changed its directory URI but preserved its evidence ref
- resource lineage reported community authority, accountable recorder, no inferred contribution credit, and no profile projection
- resource archival created no compiler source trace
- hiding the destination module immediately denied the old evidence ref and removed its archive projection

## Embedding proof

- embedding model: `gemini-embedding-2-preview`
- processed: `2`
- succeeded: `2`
- failed: `0`

This certificate proves the isolated resource-evidence slice. It is not a
production-release certificate.
