# Domain Dossier — Frontend, Public Boundaries, Operations, CI, and Release

## Irreducible job

Project canonical state through one coherent communities-first product, expose thin bounded adapters, and make failures diagnosable and releases recoverable. Frontend and operator views never become authority.

## Frontend state and surface debt

`App.tsx` is 12,068 lines, `base.css` 34,819, and `index.css` 3,497. Large files are symptoms. The upstream causes are retained deferred surfaces, split route state, global orchestration, duplicated loaders/gate projections, and multi-era CSS.

A lexical scan found 2,649 class selectors in `base.css`; 832 names were not found in TypeScript/TSX/JS source. Dynamic classes make that only a candidate set. The strongest bounded candidate is the `discover-app-*`/`discover-skill-*` marketplace block: current Discover is communities-only and no non-`base.css` reference was found.

The correct order is surface deletion -> state owner consolidation -> route closure -> component extraction -> CSS/token cleanup -> render/performance optimization. Splitting `App.tsx` first would distribute obsolete complexity.

## Public boundary

The snapshot has 36 Convex HTTP routes and 13 Vercel API route files. `vercel.json` routes MCP adapters, blocks preview paths on the main app, and falls back to the SPA. MCP validates origin/context; auth bridge is same-origin/secret-gated. General HTTP routes delegate to domain code, but request bounds and platform-wide rate-limit semantics are uneven and need route-by-route behavioral proof.

Security headers are limited to `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. This is not itself proof of a vulnerability, but the deployment has no documented browser-header baseline for HSTS, content/type/referrer/permissions policy, or CSP script/connect/image sources.

## Observability and operator views

`criticalAuditEvents` and `platformDiagnosticEvents` provide privacy-aware operational evidence; Sentry/PostHog contracts avoid raw prompts/tool output. The operator authorization boundary is separate from canonical product state.

`buildOperatorCommunityRecord` performs multiple membership/price/subscription/checkout/payout/tier reads per community. `listOperatorCommunitiesInternal`, `getOperatorOverviewInternal`, and `listOperatorRisksInternal` collect all communities and invoke this record builder before slicing; overview also collects all critical audit events. This is unbounded N+1 work whose cost grows with every community and history table.

No explicit retention/prune owner was found for audit/diagnostic history. Operator projections should use bounded time/index windows or maintained aggregates, never rescan product truth on every view.

## CI and proof posture

The GitHub workflow has three jobs: structural Convex cut guards, dependency audits, and a 22-step foundation baseline. It does **not** install web dependencies in the foundation job or run web typecheck, production build, bundle budget, or browser journey. Of 281 script files, 247 are exposed as `check:*`; 207 read source text. Structural regression evidence is extensive, but behavioral, recovery, scale, and signed-in journey evidence is comparatively thin.

This is proof inversion: the repository is optimized to prove file shapes while launch stability depends on the web build and end-to-end authority/recovery behavior.

## Packages, environment, docs, and release

- Root, web, and preview proxy each have a manifest/lock; root and web duplicate React/Vite/Convex/markdown dependency ownership without npm workspaces or an explicit version policy.
- CI uses Node 20 for root/web while preview proxy declares Node 22; root/web declare no engines.
- `.env.convex.quickstart.example` duplicates/stales the primary template and instructs a development-key posture; no first-party owner was found.
- `.env.example` uses `PLATFORM_MODEL_MAP_JSON`, while code reads `ARX_PLATFORM_MODEL_MAP_JSON`.
- `apps/web/.env.example` documents `VITE_DAYTONA_*`, while runtime reads `VITE_WORKSPACE_*`.
- `VITE_ENABLE_RUNTIME_TURN_V2` appears in templates/docs but no active runtime read was found.
- Product docs still describe Workspace/thread as `alpha-current`; docs index understates implemented cognition status.
- Release authority is explicit: `origin/main`, GitHub-triggered Vercel project `polynet`, explicit Convex deployment, and version-marker verification. Direct local Vercel production release is forbidden.
- Git/Vercel and provider rollback are documented, but no concrete product-data backup/restore test, RPO, RTO, or regional recovery runbook was found.

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| communities-first web shell/funnel/member UI | `KEEP (MVP core)` | `HARDEN`, `DECOMPOSE_LATER` | 1 | primary product projection |
| unreferenced Discover Apps/Skills CSS | `DELETE (deferred/dead)` | `OBSERVE_FIRST` | 10 | deferred surface with no static consumer |
| decompose `App.tsx` before deleting surfaces | `DECISION REQUIRED (user confirmation)` | `DELETE_FIRST` | 8 | optimizes obsolete orchestration instead of removing it |
| operator full-community N+1 aggregation | `KEEP (MVP core)` | `BOUND`, `CONSOLIDATE` | 9 | diagnostic UI must not become an unbounded production load |
| 247 permanently retained checks without owners | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `CONSOLIDATE` | 8 | proof volume is not proof quality; classify by CI/release/dev ownership |
| web CI without typecheck/build/journey | `KEEP (MVP core)` | `HARDEN`, `REWRITE_PROOF` | 9 | launch stability is not defended by the canonical gate |
| stale/duplicated env templates and flags | `DELETE (deferred/dead)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 9 | configuration drift creates false operational contracts |
| independent root/web locks forever | `DECISION REQUIRED (user confirmation)` | `CONSOLIDATE` | 5 | may be intentional deployment isolation, but currently lacks an ownership policy |
| product-data backup/restore as an undocumented provider assumption | `KEEP (MVP core)` | `DOCUMENT`, `PROVE` | 10 | reliability without tested recovery is a claim, not a property |

## Frontend endpoint

After backend authority and product scope stabilize, the retained UI should have one route state machine, one authenticated destination model, one loader per canonical projection, small domain hosts, scoped styles/tokens, explicit empty/error/retry states, accessible keyboard/focus semantics, and mobile behavior derived from the same route/state owners rather than a parallel product.
