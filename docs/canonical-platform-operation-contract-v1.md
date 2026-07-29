# Canonical platform operation contract v1

Status: local staging contract.

## Outcome

Polynet has one operation contract for capabilities that are semantically identical
across the native member agent, the official Polynet MCP, and the worker bridge.
Each admitted operation owns:

- one stable semantic id and executor;
- one actor, community-access, and target boundary;
- explicit domain, external, and receipt effects;
- retry and idempotency semantics;
- transport projections for native, MCP, and worker surfaces.

Transport names and JSON schemas may differ. Their meaning, authority, effects, and
executor may not.

The contract is
[`shared/platformOperationContract.ts`](../shared/platformOperationContract.ts).
Runtime execution is
[`convex/platformOperationExecutor.ts`](../convex/platformOperationExecutor.ts).

## Admitted operations

The v1 seam contains six operations:

| Operation | Native | Official MCP | Worker |
| --- | --- | --- | --- |
| `community.list` | `polynet_list_communities` | `polynet_list_communities` | disabled |
| `community.read` | `polynet_get_community` | `polynet_get_community` | disabled |
| `community.semantic.list` | `polynet_list` | `polynet_list` | enabled |
| `community.semantic.read` | `polynet_read` | `polynet_read` | enabled |
| `product_docs.search` | `search_product_docs` | `polynet_product_docs_search` | enabled |
| `product_docs.read` | `get_product_doc` | `polynet_product_doc_read` | enabled |

These were admitted because their semantics are proven across surfaces. Native,
official MCP, and worker adapters call the same executor instead of implementing
the operations independently. Tool registries and runtime policy project from the
same contract.

`community.semantic.list` traverses the selected community's deterministic root,
member directory, and live resource directory. `community.semantic.read` resolves
exact community, self, member, and resource documents. Native and worker calls use
the server-bound community lens; official MCP calls name a canonical community
slug and revalidate access on every request.

Resource-backed semantic reads append retrieval-audit evidence. The operation is
therefore a domain read with a receipt write: it is not parallel-safe, and retry
may duplicate an audit receipt until invocation-id deduplication exists.
The MCP `readOnlyHint` describes the absence of user-visible domain or external
mutation; the separate receipt effect still makes runtime scheduling
write-aware, and the MCP operation is explicitly not idempotent.

## Deleted public façades

The following Convex modules were duplicate public aliases and no longer exist:

- `convex/community.ts`
- `convex/communityExperience.ts`
- `convex/billing.ts`

First-party callers now address the canonical domain owner directly. Generated
Convex bindings must not expose these retired modules.

## Invariants

1. The official Polynet MCP remains a supported external surface.
2. Domain modules remain the canonical owners of business logic and data.
3. A transport adapter may normalize wire input and output, but may not redefine
   authority, effects, or execution.
   Actor and community-access requirements belong to the operation contract.
   Worker authority is derived from that requirement rather than redeclared.
   Canonical semantic arguments are validated again at the shared executor:
   root listing rejects pagination, directory listing uses bounded cursor pagination,
   and offset/limit apply only to resource documents. Adapters must not clamp an
   invalid semantic argument into a valid one.
4. A read that persists a retrieval receipt is a domain read with a receipt write;
   it is not scheduler-safe read-only work.
5. An operation is added to this contract only after semantic parity is proven.
   Similar names are not enough.
6. No third-party MCP server or general-purpose workspace product is restored by
   this contract.

## Deliberate boundary

Context-bound memory, chat, AI Feed, batch resource reads, resource search, and
builder resource tools remain outside v1. Their
native forms use the active server-bound community lens, while the official MCP
forms accept an explicit opaque community selector and perform different adapter
work. They already converge on domain kernels in many paths, but they are not to
be declared one operation until input, authority, receipt, and failure semantics
are proven equivalent.

This is a guard against a new mega-registry. The next operation family should be
admitted only when doing so deletes a real duplicate executor or policy source.

## Verification

`npm run check:canonical-operation-surface-proof` enforces:

- retired façade absence and caller migration;
- unique operation and projection names;
- native, MCP, worker, and policy parity with the contract;
- shared executor use by native and MCP dispatchers;
- official MCP preservation and an accurate tool-count label.

`npm run check:community-semantic-repository-proof` enforces the shared path,
rendering, and argument contract. `npm run check:community-semantic-behavior`
executes the authorization, profile, resource traversal, audit, collision, and
revocation behavior against an isolated Convex test backend.
