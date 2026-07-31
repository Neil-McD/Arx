# Canonical Polynet operation contract v1

Status: staging contract.

## Outcome

Polynet has one public agent operation surface:

```text
polynet_list
polynet_read
polynet_search
polynet_write
polynet_call
```

The native personal harness, community-owned Concierge, and official external
MCP project these same definitions from
[`shared/polynetCanonicalToolContract.ts`](../shared/polynetCanonicalToolContract.ts)
and execute them through
[`convex/polynetCanonicalExecutor.ts`](../convex/polynetCanonicalExecutor.ts).

This is the irreducible harness. Domain-specific capabilities are paths and
discoverable operations, not new public verbs.

## Layers

```text
transport projection
  -> shared five-tool schema
  -> normalized input
  -> server-derived principal + community authority
  -> canonical executor
  -> existing domain owner
  -> canonical result + receipt
```

Transport adapters may frame requests and responses. They may not redefine a
schema, authority rule, effect, failure code, or executor.

The lower-level contracts in
[`shared/platformOperationContract.ts`](../shared/platformOperationContract.ts)
and [`convex/platformOperationExecutor.ts`](../convex/platformOperationExecutor.ts)
remain private semantic list/read domain machinery. They are not a second
public tool catalog.

## Repository

The personal harness and external MCP can list `/`, which contains
`communities/` and `users/`. An authorized community contains identity,
members, resources, channels, AI Feed, accepted memory, and versioned
capabilities. Owner/admin authority additionally reveals `builder/`.

The community-owned agent receives a server-mounted community root. It cannot
escape to `/`, select another community, or inherit builder authority from its
operational sponsor.

Semantic Markdown is a permissioned projection over canonical domain data, not
a second source of truth. Every canonical path, and every underlying evidence
reference it resolves, is authorized again when used.

## Authority

The executor derives authority for every call:

- personal agent and external MCP: current authenticated human relation;
- owner/admin with current resource-management permission: builder lane;
- moderator/member: member lane;
- community-owned agent: fixed member lane within its mounted community;
- missing or revoked entitlement: no access.

Member and builder lanes can participate in chat and AI Feed. Builder-only
resource work is staged as a changeset, then reviewed through operations
discovered under `capabilities/`.

## Effects

- `polynet_list` is bounded discovery.
- `polynet_read` reads exact evidence and may append a retrieval receipt.
- `polynet_search` searches one bounded subtree and returns paths. A community
  root search composes the canonical channel, AI Feed, resource, and accepted
  memory projections under one global limit; it does not use the private
  prompt-context aggregator. Every returned result path must round-trip through
  `polynet_read`, and hidden domain failures fail the operation.
- `polynet_write` delegates to the owning chat, AI Feed, or resource changeset
  domain.
- `polynet_call` invokes only a discoverable versioned transition.

Mutating tools require an idempotency key. Canonical operation receipts reserve
the key against the normalized request before effects, reject conflicting
reuse, and persist the completed result. Domain owners remain independently
idempotent for crash recovery.

## Public-surface deletion rule

The official MCP, personal harness, and community agent must each expose
exactly the canonical five. Names such as `polynet_workspace_*`,
`community_resources_*`, `community_memory_*`, and specialized builder
tool names may remain only as private migration substrate while first-party
callers are removed. They are not public tools and are deletion candidates
once no private call path requires them.

Premium capabilities such as web research are orthogonal overlays. They do
not expand or fork the base Polynet repository contract.

## Verification

`npm run check:canonical-operation-surface-proof` checks schema, registry,
projection, policy, executor, and retired-name boundaries.

`npm run check:community-semantic-repository-proof` checks paths and semantic
projection.

`npx vitest run convex/polynetCanonicalExecutor.test.ts` checks member/builder
authority, community-agent confinement and attribution, community-root
search/read round trips, global search bounds, member-visible memory projection,
mutation idempotency/conflict behavior, and staged builder calls against an
isolated Convex backend.

The release gate and live staging MCP acceptance remain required before this
contract can leave staging.
