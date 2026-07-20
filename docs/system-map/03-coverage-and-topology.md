# 03 — Coverage and Topology

## Smallest useful model

Polynet is six irreducible planes, not 125 independent products:

1. **Authority:** verified identity, account, community ownership, membership, entitlement, and operator authority.
2. **Collective state:** interactions, resources, evidence, compiler state, accepted intelligence, and outcomes.
3. **Execution:** member agent, community agent, tools, MCP, apps/skills, workers, and external providers.
4. **Economy:** community access payments, platform tier, workspace/tool credits, creator settlement, and secondary Builder Partner obligations.
5. **Delivery:** browser UI, public/API adapters, funnels, email, previews, and external harness transports.
6. **Evidence and operations:** events, receipts, diagnostics, tests, release markers, backup/restore, and lifecycle cleanup.

Most debt is an extra authority, compatibility adapter, incomplete lifecycle, or unowned projection between these planes. Table count alone is a poor deletion heuristic.

## Required coverage reconciliation

| # | Required domain | Primary dossier | Mechanical assignment | Blunt state |
| ---: | --- | --- | --- | --- |
| 1 | repo, refs, dependencies, supply chain, generated code, CI, release | frontend/public/operations | 72 repository files, 46 release/config files, 249 test/proof files | release boundary is explicit; proof pyramid and package ownership are weak |
| 2 | env, flags, hosts, backup, restore, rollback | frontend/public/operations | 159 env names, 3 manifests/locks | templates drift; no product-data RPO/RTO restore proof found |
| 3 | identity, sessions, account, operator | identity/access + privacy lifecycle | 4 identity tables, 30 identity functions; operator functions separate | core authority is soundly shaped; session and destructive lifecycle gaps are P0 |
| 4 | profiles, memory, consent, privacy, export, deletion | privacy lifecycle | 7 profile/privacy tables, 20 functions | deletion is incomplete and shared ownership is not explicit |
| 5 | communities, membership, roles, visibility, funnels, onboarding | identity/access | 10 community-core tables, 76 functions | required core; legacy membership compatibility and duplicate rows need closure |
| 6 | entitlements, checkout, subscriptions, credits, commissions, payouts | billing/money | 18 tables, 106 functions, 9 crons | four economies are coupled; retained Builder Partner requires prospective v3 simplification |
| 7 | interactions, DMs, presence, events, notifications | interactions/communications | 30 tables, 84 functions, 8 crons | canonical interaction migration is incomplete; DM account deletion destroys shared history |
| 8 | resources, ingestion, evidence, compiler, intelligence, retrieval | resources/intelligence | 21 tables, 153 functions, 3 crons | protected core has a coherent spine; inline body and legacy chat residue remain |
| 9 | agents, model routing, prompt, context, tools, receipts | agents/tools/apps/MCP | 7 agent/runtime tables, 59 functions, 22 HTTP routes | required; context authority is explicit, but schema/transport duplication is large |
| 10 | native tools, MCP, apps, skills, OAuth, credentials | agents/tools/apps/MCP | 16 tables, 113 functions, 2 HTTP + 2 API routes | private capability is core; public catalog presentation is deferred |
| 11 | workspace/thread substrate, harnesses, workers, terminals, previews | workspace/runtime/async | 10 tables, 115 functions, 3 HTTP routes | protected backend substrate; standalone route/UI state is contradictory |
| 12 | crons, queues, outboxes, retries, leases, cleanup | workspace/runtime/async | all 23 crons assigned | most jobs are bounded; several have no durable continuation and can starve work |
| 13 | public/auth APIs, Vercel/Convex boundaries, rate limits | frontend/public/operations | 36 Convex HTTP + 13 API files | delegation is generally explicit; bounds/rate-limit posture is uneven |
| 14 | frontend routes, state, duplicate components, CSS, mobile | frontend/public/operations | 310 frontend files | `App.tsx` and CSS concentrate debt after obsolete surfaces are removed |
| 15 | observability, audit, analytics, incident/legal ownership | frontend/public/operations | 2 evidence tables, 25 functions, 11 ops files | privacy-aware telemetry exists; operator aggregation and retention do not scale |
| 16 | tests, scripts, docs, archives, migrations, fixtures, references | frontend/public/operations | 247 `check:*`, 91 docs, protected references | structural proof volume is high; behavioral/recovery coverage is low |

The generated assignment reports zero fallback schema tables. Counts overlap only where a source surface legitimately projects across domains; the assignment itself is not a claim that each surface should remain.

## Concentration map

| Surface | Size/concentration | Interpretation |
| --- | ---: | --- |
| `apps/web/src/App.tsx` | 12,068 lines | state and orchestration monolith; decompose only after deleting deferred flows |
| `apps/web/src/base.css` | 34,819 lines | accumulated multi-era UI residue; lexical scan found a large unused-candidate set |
| `convex/communityResources.ts` | about 10k lines | protected capability plus ingestion/migration/compatibility concentration |
| `convex/builderPartners.ts` | 3,533 lines | substantial retained secondary economy with obsolete tool-usage and 5% prospective policy |
| `convex/operatorIntelligence.ts` | 2,832 lines | many broad projections; several unbounded full-domain scans/N+1 paths |
| `shared/toolRegistry.ts` | 2,296 lines | canonical native schema gravity; should project rather than be copied |
| `shared/polynetMcp.ts` | 1,200 lines | independent external wire schema with compatibility names |
| `convex/community.ts` | 159 function aliases | de facto web-facing facade, while source modules remain callable too |
| `convex/communityExperience.ts` | 58 function aliases | intermediate facade whose registered functions are re-exported again |
| root `package.json` | 280 scripts, 247 checks | operational discoverability and proof ownership have collapsed into one manifest |

## Boundary map

```mermaid
flowchart LR
  WEB["Web app"] --> API["Vercel API adapters"]
  WEB --> CX["Convex public facade"]
  API --> HTTP["Convex HTTP routes"]
  MCP["External MCP client"] --> API
  CX --> CORE["Domain authority cores"]
  HTTP --> CORE
  CORE --> DB[("Convex canonical + operational state")]
  CORE --> STRIPE["Stripe"]
  CORE --> IDP["Identity provider"]
  CORE --> MODEL["Model/provider"]
  CORE --> WORKER["Workspace worker/provider"]
  CORE --> MAIL["Email provider"]
  DB --> CRON["Crons/queues/reconcilers"]
  CRON --> CORE
```

The desired reduction is not one transport. It is one semantic operation and one authority decision per job, with thin versioned adapters for web, Convex HTTP, official MCP, worker, and scheduled execution.

## Main deletion queues

1. **Immediate static candidates:** stale quickstart/config flags, unreferenced Discover Apps/Skills CSS, stale doc claims, and the intermediate `communityExperience` facade after proof.
2. **Migration candidates:** inline resource bodies, legacy community chat/link/attachment reads, absent-membership-active compatibility, duplicate membership rows, legacy retrieval query fields, and old MCP wire names.
3. **Decision-required systems:** standalone Workspace destination, exact audit/privacy/legal retention periods, package ownership, and adopted status of the expanded semantic thesis. Builder Partner direction and shared-content account-deletion ownership are resolved; their implementations are migration work, not open product choices.
4. **Never blanket-delete:** coding/community harnesses, compiler, resources/memory, references, canonical interaction/intelligence history, ordinary creator payout, and official MCP capability.
