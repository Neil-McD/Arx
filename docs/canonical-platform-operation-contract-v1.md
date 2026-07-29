# Canonical platform operation contract v1

Status: local staging contract.

## Outcome

Polynet has one operation contract for capabilities that are semantically identical
across the native member agent, the official Polynet MCP, and the worker bridge.
Each admitted operation owns:

- one stable semantic id and executor;
- one authority and target boundary;
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

The v1 seam contains four operations:

| Operation | Native | Official MCP | Worker |
| --- | --- | --- | --- |
| `community.list` | `polynet_list_communities` | `polynet_list_communities` | disabled |
| `community.read` | `polynet_get_community` | `polynet_get_community` | disabled |
| `product_docs.search` | `search_product_docs` | `polynet_product_docs_search` | enabled |
| `product_docs.read` | `get_product_doc` | `polynet_product_doc_read` | enabled |

These were admitted first because their semantics already match across surfaces.
Both runtime dispatchers now call the same executor instead of implementing these
operations independently. Tool registries and runtime policy project from the same
contract.

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
4. A read that persists a retrieval receipt is a domain read with a receipt write;
   it is not scheduler-safe read-only work.
5. An operation is added to this contract only after semantic parity is proven.
   Similar names are not enough.
6. No third-party MCP server or general-purpose workspace product is restored by
   this contract.

## Deliberate boundary

Context-bound memory, chat, AI Feed, and resource tools remain outside v1. Their
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
