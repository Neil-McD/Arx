# Community Memory Consumption Staging Acceptance — 2026-07-16

Status: passed

## Scope

This certificate proves that one accepted, compiler-derived community memory is
consumed through the same canonical directory kernel by:

- the member's bottom-right personal agent
- the community Concierge
- the external Polynet MCP

The destructive revocation test ran only against disposable staging
communities. Production data was not touched.

## Accepted-memory fixture

The fixture retained one `promising` insight, `Quartz lantern protocol`, from
one live AI Feed source trace through:

```txt
AI Feed post
  -> community source trace
  -> immutable citation_v1 citation
  -> deterministic community_memory_work:v1 workKey
  -> trusted autonomous compiler-memory apply
  -> accepted community intelligence node
```

The personal agent, Concierge, and MCP all returned the same node identity,
title, status, and bounded subgraph. Each search produced a viewer-owned
retrieval log, and each subsequent read marked the same node as injected.

## Governance and adversarial proof

- Ordinary members saw the accepted community neighbor only.
- Managers saw both accepted community and accepted admin-scoped neighbors.
- Draft neighbors were never injected for members or managers.
- No edge with a hidden or otherwise unreadable neighbor was returned without
  that neighbor.
- A foreign-community node failed closed.
- An authenticated outsider without membership was denied.

## Citation revocation

The fixture hid its canonical AI Feed source through the normal source
lifecycle. The source trace became `admin` / `redacted`, while the memory node
and immutable citation remained preserved for lineage and audit.

After revocation:

- member search no longer returned the memory
- member direct read failed
- manager search no longer returned the memory
- manager direct read failed

Manager authority therefore widens visibility but does not bypass evidence
redaction or citation revocation.

## Cleanup

The acceptance action's `finally` path deleted the disposable communities and
all scoped source, citation, directory, edge, mutation, retrieval, membership,
and AI Feed rows. A separate cleanup probe confirmed zero remaining rows across
both fixture communities.

The temporary staging acceptance function was then removed from the deployed
code, and `POLYNET_MEMORY_CONSUMPTION_ACCEPTANCE_ENABLED` was unset. Durable
evidence is stored in
`scripts/fixtures/community_memory_consumption_staging_acceptance_20260716.json`.

This certificate does not by itself prove the production UI release. It proves
the backend contracts that production will receive from the exact validated
release candidate.
