# 01 — Normative Contract Drift

## Resolved source hierarchy

For this mapping program, requirements are interpreted in this order:

1. Current explicit user direction plus `AGENTS.md` define the current MVP boundary and execution constraints.
2. `PLATFORM.md` defines durable platform doctrine where it is compatible with that MVP boundary.
3. `docs/agent-native-semantic-platform-thesis.md` is the active destination architecture. Its explicit status matrix separates implemented, next, proposed, and deferred elements; it does not make proposals implementation truth or authorize a slice.
4. Explicitly active domain contracts govern their bounded domain only where they do not contradict levels 1–3 and current executable authority.
5. Schema, source, generated types, tests, and runtime evidence describe implementation truth; they do not silently redefine the product target.
6. `docs/product/` is the user/LLM-facing projection. Its own index says it is downstream and must be corrected when it conflicts with platform doctrine or runtime contracts (`docs/product/README.md:13-22`).
7. `SOUL.md` governs voice and behavior, not data ownership or MVP scope.
8. `docs/polynet-reduction-execution-contract-v1.md` tracks execution status and evidence only; it is not product, schema, lifecycle, or architecture authority.

This hierarchy resolves how to map the current snapshot. It does not resolve every product choice and does not authorize implementation.

## Doctrine register

| ID | Claim/surface | Status | Evidence | Mapping conclusion |
| --- | --- | --- | --- | --- |
| N-001 | Communities, gated funnels, auth/session, core interaction, billing/entitlement, member agent, community agent, and MCP are MVP | active | `AGENTS.md:20-43` | Normative keep boundary. |
| N-002 | Workspace/thread infrastructure remains migration substrate, not the primary destination | active | `AGENTS.md`; thesis implementation classification and cleanup sequence | Infrastructure may remain; destination doctrine must not depend on Workspace. |
| N-003 | Product docs describe the mounted member-agent dock and authorized community-page context; the standalone Workspace primitive/guide are deleted and thread persistence is `internal-only` | resolved in C7.4A current staging source | `docs/product/manifest.json`; `primitives/agent.md`; `primitives/community-lens.md`; `primitives/thread.md`; generated-corpus retirement proof | Product truth now aligns with N-002 while preserving protected runtime/project/thread substrate. |
| N-004 | Community-agent cognition contract is active architecture with an implemented core runtime boundary | resolved | `docs/README.md`; contract status at `docs/community-agent-cognition-contract-v1.md:3` | The active index and bounded contract now agree; protected cognition remains current architecture. |
| N-005 | Project-bound workspace tools are protected MVP substrate, not a user-facing Workspace destination | resolved | `AGENTS.md`; thesis implementation classification | Preserve harness/thread capability and bounded compatibility; do not rebuild or depend on the deferred standalone destination. |
| N-006 | A virtual semantic community repository and irreducible five-tool destination are active architecture | adopted with explicit implementation gates | reconciled repository thesis and C0 execution receipt | The destination is active. Only the existing authority/read foundation is implemented; the initial namespace plus list/read are next, while search/write/call and wider mounts remain proposed. |
| N-007 | Product docs are currently verified product truth | stale-risk, not blanket-invalid | `docs/product/README.md:5-6` last verified `2026-04-26` | Validate each claim against higher doctrine and implementation; do not delete the corpus wholesale. |
| N-008 | Builder Partner is retained, but is not a primary MVP journey or launch gate | implemented on staging; historical reconciliation remains | `AGENTS.md` and `shared/builderPartnerProgram.ts` select v3 community-only 4% economics; the retained member surface is Settings-based; old ledger and legal evidence remain versioned history | Keep the secondary system and payout evidence. New paid-tool accrual, prospective 5% economics, and primary Workspace coupling are removed; historical obligations remain governed by their original policy and evidence. |
| N-009 | Public Apps and Skills catalogs belong in Discover | deferred | `AGENTS.md:57`; current `WebDiscoverPanel` is communities-only | Private apps, skills, mounts, and MCP are retained; Discover marketplace presentation residue is not. |
| N-010 | Existing thread/workspace infrastructure may be deleted because the standalone destination is deferred | false | `AGENTS.md:42,67-72` | Retain protected substrate and migration compatibility; challenge only user-facing destination routes and duplicate adapters. |
| N-011 | Community resources, memory, compiler, cognition, and harnesses are cleanup targets | protected | `AGENTS.md:62-72` | Audit and simplify internal compatibility, but deletion of the protected capability requires explicit human confirmation. |

## Candidate classifications

| Exact candidate | Classification | Action tag | Idiot index | Reason and requirement owner |
| --- | --- | --- | ---: | --- |
| Workspace as a primary product destination claim | `DELETE (deferred/dead)` | `DOCUMENT`, `MIGRATE_THEN_DELETE` | 9 | Current user/`AGENTS.md` explicitly selects communities as the destination; retain only the required substrate and compatibility behavior. Owner: MVP contract. |
| Workspace/thread persistence substrate | `KEEP (MVP core)` | `DOCUMENT` | 2 | It remains necessary for migration, auditable context, and protected harness compatibility, even if hidden from navigation. Owner: platform/runtime. |
| Community cognition/compiler contract and implementation | `KEEP (MVP core)` | `DOCUMENT` | 1 | Explicitly protected and required for separate community-agent cognition. Owner: community intelligence. |
| Reconciled semantic-platform thesis as destination authority | `KEEP (MVP core)` | `DOCUMENT` complete | 1 | One repository thesis now owns the accepted destination while its status matrix prevents proposals from masquerading as implementation. Owner: product architecture. |
| Project-bound workspace tools as protected substrate | `KEEP (MVP core)` | `DOCUMENT` complete | 2 | Preserve required harness/thread capability and bounded compatibility, not the deferred standalone Workspace destination. Owner: protected harness/MVP. |
| Builder Partner as a secondary growth capability | `KEEP (MVP core)` | `DOCUMENT`, `HARDEN`, `CONSOLIDATE` | 2 | Current direction explicitly retains it, while excluding it from primary MVP journeys. Owner: product/finance. |
| paid-tool Builder Partner commission eligibility | `DELETE (deferred/dead)` complete for new accrual | `VERSION` | 10 | v3 creates no new paid-tool commission; historical ledger evidence remains immutable. Owner: product/finance. |
| 5% as the prospective Builder Partner community-revenue rate | `DELETE (deferred/dead)` complete | `VERSION` | 8 | New eligible commissions use 4%; previously earned rows retain their original policy. Owner: product/finance/legal. |
| Builder Partner in primary Workspace/onboarding/headline flows | `DELETE (deferred/dead)` complete | `DOCUMENT` | 9 | The retained member surface is a secondary Settings capability; operator controls remain separate. Owner: MVP product. |
| Private app/skill/MCP capability | `KEEP (MVP core)` | `HARDEN`, `CONSOLIDATE` | 1 | Required for authorized community context and external harness access. Owner: platform capabilities. |
| Public Apps/Skills Discover marketplace presentation residue | `DELETE (deferred/dead)` complete | `PROVE` | 9 | The unreferenced legacy CSS surface was removed; current Discover remains communities-only. Owner: frontend MVP. |

## Phase 0 gate

The mapping gate passes because the source hierarchy is explicit and contradictions remain visible. Builder Partner v3, account-deletion containment, authenticated session continuity, the first zero-authority frontend/config deletion, and semantic-thesis adoption are complete on the staging work lane. The architecture decision changes no implementation claim: historical Builder Partner lineage, product-doc changes, Workspace surface retirement, lifecycle execution, canonical migrations, and semantic namespace/tool implementation remain separately bounded work.
