# Convex Cutover UX Parity Ledger v1

Status: active (cutover baseline)  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Goal: preserve current user-visible behavior while replacing Legacy Cloud with Convex end to end.

## 1) First-Principles Scope

This ledger answers one question only:

1. If we delete Legacy Cloud, what exact UX behavior must still work the same?

Everything in this document is a parity requirement unless explicitly marked as a decision.

## 2) Canonical Sources (Current Truth)

Product and MVP scope:

1. `AGENTS.md`
2. `docs/irreducible-core-contract.md`

Gates, tiers, runtime lanes:

1. `docs/auth-money-access-matrix.md`
2. `docs/archive/convex-gate-matrix-v1.md`
3. `shared/contracts/gate_parity_matrix_v1.json`
4. `shared/canonicalGateEngine.mjs`

Harness and tool lifecycle:

1. `docs/canonical-cloud-run-v1.md`
2. `docs/canonical-harness-parity-matrix.md`
3. `shared/contracts/coding_harness_tools_v1.json`

Convex target data and API surface:

1. `docs/convex-schema-skeleton-v1.md`
2. `convex/schema.ts`
3. `convex/auth.ts`
4. `convex/gates.ts`
5. `convex/projects.ts`
6. `convex/threads.ts`

Shell navigation and route state:

1. `shared/appShellNavigation.ts`
2. `shared/appNavTransitions.ts`
3. `shared/webAppRouteState.ts`

Primary app implementations:

1. `src/App.tsx` (desktop shell)
2. `apps/web/src/App.tsx` (web shell)
3. `shared/CommunityNav.tsx`
4. `apps/web/src/components/WebPublicRouteView.tsx`

## 3) Irreducible UX Outcomes

These are non-negotiable for cutover:

1. User can open workspace and run core chat flow.
2. Auth boundary behavior remains the same at all gated actions.
3. Community discovery and landing routes still work.
4. Community join modes still resolve to one CTA: `join_free`, `request_access`, or `checkout`.
5. Community tab visibility and actions remain role/tier gated.
6. Thread-to-community lens switching remains explicit and auditable.
7. Runtime lane decisions remain deterministic and explainable (`public`, `platform`, `chatgpt_desktop`, `daytona_cloud`, `local_runtime`).
8. Tool-call lifecycle semantics remain evented and auditable.
9. Voice works on web and desktop.
10. Billing and entitlement flows preserve access semantics.

## 4) Canonical Enums and Decision Outputs

The cutover must preserve these canonical values:

1. Auth state: `anonymous | authenticated`
2. Tier: `free | builder | architect` (`pro` only as legacy alias at adapter boundaries)
3. Community visibility: `published | unlisted`
4. Join mode: `join_free | request_access | checkout`
5. App pages: `workspace | community | discover`
6. Community tabs: `chat | feed | library | resources | members | settings | ai_agent | analytics`
7. Runtime lane outputs: `public | platform | chatgpt_desktop | daytona_cloud | local_runtime`
8. Gate decision shape: `{ allowed, code, cta, lane? }`

## 5) UX Parity Matrix (What Must Stay True)

| Area | Must-Stay UX Behavior | Current Contracts | Primary Code Anchors | Convex Cutover Target |
|---|---|---|---|---|
| Workspace shell | `workspace` remains default page with thread list + active thread + send flow | `AGENTS.md`, `shared/webAppRouteState.ts` | `src/App.tsx`, `apps/web/src/App.tsx` | Convex-backed thread/message APIs only |
| Settings navigation | Workspace settings toggle stays route-backed and reversible | `shared/appNavTransitions.ts`, `shared/appShellNavigation.ts` | `src/App.tsx`, `apps/web/src/App.tsx` | Keep same route/hash semantics |
| Discover | Discover page remains separate surface with search/refresh and open-community affordance | `AGENTS.md` | `src/App.tsx`, `apps/web/src/App.tsx` | Convex discovery reads |
| Public landing | `/c/:slug` landing remains canonical entry point | `AGENTS.md`, `docs/auth-money-access-matrix.md` | `shared/webAppRouteState.ts`, `apps/web/src/components/WebPublicRouteView.tsx` | Convex public community read |
| Join CTA | One resolved join CTA from server state (`join_free` / `request_access` / `checkout`) | `docs/auth-money-access-matrix.md`, `docs/archive/convex-gate-matrix-v1.md` | `apps/web/src/App.tsx`, `apps/web/src/communityJoinPolicy.ts` | Convex gate resolver + funnel actions |
| Community tabs | Tab set and gate behavior preserved per role/tier | `docs/irreducible-core-contract.md`, `docs/archive/convex-gate-matrix-v1.md` | `shared/CommunityNav.tsx`, `src/App.tsx`, `apps/web/src/App.tsx` | Convex tab gate queries |
| Community AI agent | AI Agent tab behavior and draft/active prompt flows remain | `docs/irreducible-core-contract.md` | `src/App.tsx`, `apps/web/src/App.tsx`, shared controllers | Convex draft/active prompt endpoints |
| Runtime lane routing | Routing remains deterministic by auth+tier+model+turn-class | `docs/auth-money-access-matrix.md`, `shared/contracts/gate_parity_matrix_v1.json` | `shared/canonicalGateEngine.mjs`, web/desktop runner controllers | Convex gate API returns same decisions |
| Tool approvals | Read tools auto-allow and write tools approval semantics preserved | `shared/contracts/coding_harness_tools_v1.json`, `docs/canonical-harness-parity-matrix.md` | runtime runner + tool UI in `src/App.tsx` | Convex runtime run/event contract |
| Thread lens | Community lens switch affects only subsequent turns and fails closed when unauthorized | `AGENTS.md` | `src/App.tsx`, `apps/web/src/App.tsx` | Convex validated lens mutation |
| Projects/sandboxes | Cloud thread stays project-bound; project operations and sandbox status UX preserved | `docs/daytona-project-sandbox-migration-spec.md` | `shared/daytonaCloudProjects.ts`, `shared/daytonaCloudThreadsRead.ts`, `shared/cloudThreadsGateway.ts` | Convex projects/threads/daytona modules |
| Voice | Voice input/transcribe flow preserved on web and desktop | `docs/irreducible-core-contract.md` | `shared/useWebVoiceInputController.ts`, `src/controllers/desktop/useDesktopVoiceInputController.ts` | Convex-compatible transcribe path |
| Billing/member access | Checkout/finalize/webhook-derived entitlement semantics preserved in UX | `docs/auth-money-access-matrix.md`, `docs/irreducible-core-contract.md` | web/desktop billing and join flows | Convex billing projection + entitlement resolver |
| Pending recovery | Pending-purchase recovery and invite recovery UX preserved | `AGENTS.md` | `src/App.tsx`, `apps/web/src/App.tsx` | Convex recovery endpoints |

## 6) Journey Checklist (Cutover Acceptance)

Each journey is complete only when behavior matches current UX:

1. Anonymous user opens app and can use allowed workspace flow.
2. Anonymous user opens community landing and is prompted correctly at gated actions.
3. Authenticated free user can use free model lane and is denied paid/tool lanes with correct CTA.
4. Authenticated paid user can access paid model/daytona lanes with correct gating.
5. User joins community via each join mode and lands in community chat.
6. User can navigate community tabs with role/tier-appropriate visibility.
7. User can create/select project, create thread, send turn, and reload history.
8. User can switch thread community lens and subsequent turn reflects new context only.
9. User can complete checkout or recover pending purchase and entitlement updates gate outcomes.
10. User can use voice input on web and desktop without regressions.

## 7) Failure and Security Expectations

Fail-closed behavior must remain:

1. Backend remains authoritative for gate decisions; UI is advisory only.
2. Denied actions return stable machine code + CTA.
3. No implicit access from client-local state.
4. No silent lane fallback on cloud agent/tool turns.
5. No runtime success claims without run/event evidence.

## 8) Known Drift and Required Decisions

These must be resolved explicitly during cutover:

1. Tier naming drift:
   1. Some contracts use `builder/pro`.
   2. Convex target uses `builder/architect`.
   3. Decision: freeze canonical persisted enum to `free|builder|architect`; allow `pro -> architect` only in adapters.
2. Community tab drift:
   1. `irreducible-core-contract.md` keep-list omits `feed`.
   2. Runtime UI currently includes `feed`.
   3. Decision: keep `feed` as MVP core or formally defer/remove it.
3. Contract status drift:
   1. Several Convex docs are still marked `draft`.
   2. Decision: promote this ledger + gate matrix + schema target to active for migration.
4. Endpoint naming drift:
   1. Current contracts still reference Legacy Cloud endpoint names.
   2. Decision: preserve behavior contract while renaming transport to Convex-only APIs.

## 9) Cutover Exit Criteria

The Legacy Cloud hard cut is done only when all are true:

1. All journeys in Section 6 pass on web and desktop.
2. Gate outputs match canonical behavior for matrix scenarios.
3. Runtime/tool lifecycle events satisfy canonical contracts.
4. `rg -n "(/functions/v1|/rest/v1|/rpc\\b)"` is zero for active runtime product paths.
5. No user-facing CTA or navigation regression from the ledger matrix.

## 10) Operating Rule for This Ledger

1. Any migration change that affects UX behavior must update this file in the same PR.
2. If code and ledger disagree, code is considered drift and must be reconciled immediately.
3. New behavior is not accepted unless mapped to:
   1. first-principles outcome,
   2. gate/tier decision rule,
   3. at least one concrete user journey.
