# Domain Dossier — Frontend, Public Boundaries, Operations, CI, and Release

## Irreducible job

Project canonical state through one coherent communities-first product, expose thin bounded adapters, and make failures diagnosable and releases recoverable. Frontend and operator views never become authority.

## Frontend state and surface debt

`App.tsx` is 9,267 lines, `base.css` 27,613, and `index.css` 2,765 after C7.4B2 current source. Large files are symptoms. The upstream causes are retained domain concentration, global orchestration, duplicated loaders/gate projections, and multi-era CSS.

The earlier lexical scan found 2,649 class selectors in `base.css`; 832 names were not found in TypeScript/TSX/JS source. Dynamic classes make that only a candidate set. The strongest bounded `discover-app-*`/`discover-skill-*` marketplace block has since been deleted with production-build and staging visual proof.

The correct order is surface deletion -> state owner consolidation -> route closure -> component extraction -> CSS/token cleanup -> render/performance optimization. Splitting `App.tsx` first would distribute obsolete complexity.

## Public boundary

The snapshot has 36 Convex HTTP routes and 13 Vercel API route files. `vercel.json` routes MCP adapters, blocks preview paths on the main app, and falls back to the SPA. MCP validates origin/context; auth bridge is same-origin/secret-gated. General HTTP routes delegate to domain code, but request bounds and platform-wide rate-limit semantics are uneven and need route-by-route behavioral proof.

Security headers are limited to `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. This is not itself proof of a vulnerability, but the deployment has no documented browser-header baseline for HSTS, content/type/referrer/permissions policy, or CSP script/connect/image sources.

## Observability and operator views

`criticalAuditEvents` and `platformDiagnosticEvents` provide privacy-aware operational evidence; Sentry/PostHog contracts avoid raw prompts/tool output. The operator authorization boundary is separate from canonical product state.

`buildOperatorCommunityRecord` performs multiple membership/price/subscription/checkout/payout/tier reads per community. `listOperatorCommunitiesInternal`, `getOperatorOverviewInternal`, and `listOperatorRisksInternal` collect all communities and invoke this record builder before slicing; overview also collects all critical audit events. This is unbounded N+1 work whose cost grows with every community and history table.

No explicit retention/prune owner was found for audit/diagnostic history. Operator projections should use bounded time/index windows or maintained aggregates, never rescan product truth on every view.

## CI and proof posture

Canonical CI has three baseline jobs—Convex cut guards, low-threshold dependency
audits, and the 40-step foundation baseline with critical-audit,
account-deletion quarantine, community-evidence revocation, and email-retention
behavior coverage, web dependency install, typecheck, production build, and
bundle budget. A separate staging-branch canary waits until
`polynet-staging.vercel.app/version.json` equals the exact pushed SHA, then
exercises the anonymous `/c/polynet` funnel in Chromium. It asserts accessible
join UI and fails on browser errors, Polynet/Convex request failures, or
first-party 5xxs; it performs no click, sign-in, or product mutation.
Wrong-SHA rejection is exercised on every run, and browser failures produce
bounded redacted artifacts.

The remaining proof imbalance is narrower: signed-in authority/recovery journeys, scale behavior, and provider outage convergence are still comparatively thin. Required-check enforcement is unavailable on the current private-repository account plan.

## Packages, environment, docs, and release

- Root, web, and preview proxy each own one independently installed manifest/lock pair under the active package/deployment ownership contract and CI proof.
- All three manifests/locks, the proxy container, and CI share Node 22; root/web shared declarations must use one range.
- The ownerless quickstart, unread runtime-v2 flag, and deleted browser-preview template names are removed from tracked source.
- Product docs follow the mounted member-agent/community-page-context model; thread persistence is `internal-only`.
- Names-only deployed-environment reconciliation remains U-031.
- Release authority is explicit: `origin/main`, GitHub-triggered Vercel project `polynet`, explicit Convex deployment, and version-marker verification. Direct local Vercel production release is forbidden.
- Git/Vercel and provider rollback are documented, but no concrete product-data backup/restore test, RPO, RTO, or regional recovery runbook was found.

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| communities-first web shell/funnel/member UI | `KEEP (MVP core)` | `HARDEN`, `DECOMPOSE_LATER` | 1 | primary product projection |
| unreferenced Discover Apps/Skills CSS | `DELETE (deferred/dead)` complete | `DELETE` | 10 | deferred surface had no static consumer and passed build/visual proof after removal |
| decompose `App.tsx` before deleting surfaces | `DECISION REQUIRED (user confirmation)` | `DELETE_FIRST` | 8 | optimizes obsolete orchestration instead of removing it |
| operator full-community N+1 aggregation | `KEEP (MVP core)` | `BOUND`, `CONSOLIDATE` | 9 | diagnostic UI must not become an unbounded production load |
| 241 permanently retained `check:*` commands without complete owners | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `CONSOLIDATE` | 8 | proof volume is not proof quality; classify by CI/release/dev ownership |
| web CI with one exact-build anonymous journey | `KEEP (MVP core)` | `KEEP_BOUNDED` | 2 | current gate defends the shipped build and one mutation-free public boundary; additional journeys need distinct risk justification |
| stale/duplicated tracked env templates and flags | `DELETE (deferred/dead)` complete for source | `DELETE` | 9 | C7.4B1 removes false tracked configuration contracts; deployed-name cleanup remains U-031 |
| one graph per independently installed root/web/proxy artifact | `KEEP (MVP core)` | `DOCUMENT`, `PROVE` complete | 1 | separate Vercel/Convex, browser, and Fly/Docker installs are now explicit and range-locked |
| product-data backup/restore as an undocumented provider assumption | `KEEP (MVP core)` | `DOCUMENT`, `PROVE` | 10 | reliability without tested recovery is a claim, not a property |

## Frontend endpoint

After backend authority and product scope stabilize, the retained UI should have one route state machine, one authenticated destination model, one loader per canonical projection, small domain hosts, scoped styles/tokens, explicit empty/error/retry states, accessible keyboard/focus semantics, and mobile behavior derived from the same route/state owners rather than a parallel product.
