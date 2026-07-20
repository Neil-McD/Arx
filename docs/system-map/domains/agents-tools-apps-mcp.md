# Domain Dossier — Agents, Tools, Official MCP, Apps, and Skills

## Irreducible jobs

1. Let a member's personal agent act under one explicit, currently authorized community lens.
2. Let the separate community-owned agent respond to mentions and perform bounded autonomous cognition.
3. Let external harnesses select authorized community context through official Polynet MCP.
4. Expose approved apps, skills, and provider capabilities without giving the browser, model, prompt, or manifest authority.

These jobs are MVP/protected core. Public Apps/Skills discovery is not.

## Principal and context separation

Member agent, community agent, human, system job, and external client are different principals. Context selection affects subsequent turns only; stored history remains auditable. Server operations must revalidate membership/entitlement and target community. Runtime manifests and prompts orient the agent but cannot grant capabilities.

The community-agent internal protocol intentionally has only `search` and `write` cognition operations in `shared/communityAgentToolProtocol.ts`; this is not a duplicate of the member/coding tool surface. It is a smaller semantic boundary for a different principal.

## Tool/schema topology

| Surface | Role | Debt |
| --- | --- | --- |
| `shared/toolRegistry.ts` | 2,296-line native tool schema registry | large but central; needs modular ownership, not parallel copies |
| `shared/polynetPlatformToolSurface.ts` | 19 Polynet-native exposure/authority rows derived from registry | good projection pattern |
| `shared/communityAgentToolProtocol.ts` | two internal cognition tools | intentional separate protocol |
| `shared/polynetMcp.ts` | 1,200-line official MCP wire schemas, 24 tool names | independently declares overlapping semantics and compatibility names |
| worker/runtime dispatch | validates and executes capabilities, records effects | authority must stay server-side |

The official MCP still uses several `workspace_*` fields/tool names for community context; `polynetMcpSetup.ts` explicitly calls `workspace_context_id` a compatibility field. External wire compatibility can remain versioned, but it should project from one internal semantic capability kernel rather than permanently define a second vocabulary and schema truth.

## Convex transport duplication

`convex/community.ts` re-exports 159 registered functions and is the de facto web-facing facade. The original registered functions remain callable under their source modules. `communityExperience.ts` adds another 58 registered re-exports and is then re-exported through `community.ts`. Generated API therefore exposes overlapping public identities for the same implementation.

`communityExperience.ts` has no clear first-party runtime consumer outside the outer facade/proofs/generated references. It is the cleanest facade-deletion candidate, but external callers and generated API compatibility must be checked. Long term, expose one supported public transport identity per operation and keep internal modules internal.

## Apps, skills, and OAuth

Developer apps, app connections/tool snapshots/OAuth states, user/community mounts, skill packages/revisions/installs/attachments, and community source integrations form a real private capability system. They are not rendered by current Discover, but they support settings, community attachments, agents, and official harness access.

`shared/discoverCatalog.ts` is also used for connection policy outside Discover, so deleting it wholesale would remove active capability policy. The deletion target is public marketplace presentation residue and unused catalog projections, not the policy data used by private connections.

Provider connections are split by role: inference provider connections, Drive/GitHub source connections, and developer MCP app connections. That is not automatically duplicate storage, but OAuth-state lifecycle, encryption, account deletion, refresh, and audit policy should be factored into shared primitives.

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| explicit member/community/MCP context authority | `KEEP (MVP core)` | `HARDEN` | 0 | central security invariant |
| community-agent two-tool protocol | `KEEP (MVP core)` | `DOCUMENT` | 1 | intentionally small protocol for a distinct principal |
| intermediate `communityExperience.ts` registered facade | `DELETE (deferred/dead)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 9 | adds callable identities without owning semantics |
| source-module public functions plus outer facade aliases forever | `KEEP (MVP core)` | `CONSOLIDATE` | 8 | one operation should have one supported public identity |
| independent native and MCP semantic schema declarations | `KEEP (MVP core)` | `CONSOLIDATE` | 7 | transports differ; semantic meaning and authority should not |
| legacy `workspace_*` official MCP wire names forever | `DECISION REQUIRED (user confirmation)` | `VERSION`, `MIGRATE_THEN_DELETE` | 6 | current external compatibility may justify them temporarily |
| private app/skill/MCP capability | `KEEP (MVP core)` | `HARDEN` | 1 | required by MVP external harness and community capability |
| public Apps/Skills Discover surface | `DELETE (deferred/dead)` | `OBSERVE_FIRST` | 9 | explicitly deferred and current Discover is communities-only |

## Target architecture

One internal capability identity owns input/output schema, required principal/context, authorization, cost class, effect class, idempotency, executor, and receipt. Native UI, community agent, official MCP, worker, and scheduled adapters project compatible subsets and version their wire contracts. No adapter decides product authority.
