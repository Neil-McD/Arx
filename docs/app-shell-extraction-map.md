# App Shell Extraction Map (MVP)

Date: 2026-02-13  
Scope:
- `src/App.tsx` (desktop shell)
- `apps/web/src/App.tsx` (web shell)

Related:
- `docs/app-shell-contract.md`
- `scripts/app_hook_budget_check.sh`
- `scripts/app_shell_boundary_check.sh`

## Purpose

Freeze the next extraction queue from first principles:
- keep App shells as composition roots
- move effect-heavy domain logic into controllers/shared modules
- reduce regression blast radius while preserving behavior

## Baseline Snapshot (Current)

| Metric | Desktop `src/App.tsx` | Web `apps/web/src/App.tsx` |
|---|---:|---:|
| LOC | 11964 | 11807 |
| `useState` | 98 | 106 |
| `useEffect` | 51 | 49 |
| Function declarations | 106 | 89 |
| Endpoint literals (`/rest/v1`, `/functions/v1`) | 15 | 37 |

Interpretation:
- Hook pressure is materially lower than the previous baseline, and both shells are under hook/function ceilings.
- Web endpoint literal budget is still near ceiling (`37/38`), so extraction should prioritize moving endpoint-heavy workflows out of App shells.

## First-Principles Constraint

The current bottleneck is not infra; it is shell concentration:
- too many effect clusters in App shells
- mixed responsibilities (composition + workflow orchestration)
- higher change risk per feature due to coupling

## Ranked Effect Clusters (Extraction Priority)

### P0 (Do First)

| Cluster | Surface | Why first | Current anchor points |
|---|---|---|---|
| Auth/session bootstrap + refresh lifecycle | Desktop + Web | Highest coupling and highest break risk; blocks many downstream paths | `src/App.tsx:1779`, `src/App.tsx:2394`, `src/App.tsx:2430`, `apps/web/src/App.tsx:2373`, `apps/web/src/App.tsx:2451` |
| Community analytics + automations loaders | Desktop + Web | High churn product area, currently shell-bound effect blocks | `src/App.tsx:5348`, `src/App.tsx:5383`, `apps/web/src/App.tsx:3213`, `apps/web/src/App.tsx:3244` |
| Community membership review/funnel effect stack | Web | Dense, permission-sensitive workflow with large state reset/load chains | `apps/web/src/App.tsx:3054`, `apps/web/src/App.tsx:3144`, `apps/web/src/App.tsx:3156` |

### P1 (Do Next)

| Cluster | Surface | Why next | Current anchor points |
|---|---|---|---|
| Community settings/access/pricing lifecycle | Desktop + Web | Medium-high complexity; many related effects can move together | `src/App.tsx:2620`, `src/App.tsx:2643`, `src/App.tsx:2674`, `apps/web/src/App.tsx:2907`, `apps/web/src/App.tsx:2930`, `apps/web/src/App.tsx:2986` |
| Chat lifecycle resets + resource loaders | Desktop + Web | Frequent UX touchpoints; extraction lowers regression blast radius | `src/App.tsx:2586`, `src/App.tsx:2591`, `src/App.tsx:2815`, `apps/web/src/App.tsx:2852`, `apps/web/src/App.tsx:2857`, `apps/web/src/App.tsx:3183` |
| Model picker lifecycle listeners (web still inline) | Web | Desktop already extracted equivalent; parity and simplification win | `apps/web/src/App.tsx:2531` |

### P2 (After P0/P1)

| Cluster | Surface | Why later | Current anchor points |
|---|---|---|---|
| Billing/claims/redeem timers and finalize loops | Desktop + Web | Complex but less blocked once auth/session is extracted | `src/App.tsx:2454`, `src/App.tsx:2517`, `apps/web/src/App.tsx:3794`, `apps/web/src/App.tsx:3869` |
| Discover/public-route sync and landing hydration | Web | Lower coupling than P0/P1 but still shell-heavy | `apps/web/src/App.tsx:2417`, `apps/web/src/App.tsx:2423`, `apps/web/src/App.tsx:3754` |
| Lightbox/session-drawer UI listeners | Desktop + Web | Low risk, easy wins after major extractions | `src/App.tsx:5029`, `apps/web/src/App.tsx:4993`, `apps/web/src/App.tsx:7016` |

## Immediate Queue (Next 3 Slices)

1. Web thread/message data loaders (`threads`, `messages`, `model_registry`) into a shared web thread-data controller.
2. Web personal-memory/settings CRUD (`personal_memory_items`, `user_memory_settings`, `user_model_settings`) into a shared memory-settings controller.
3. Membership/community access/profile loaders (`community_memberships`, `get_my_community_access`, `profiles`) into a shared membership-access controller.

## Extraction Sequence (No Over-Engineering)

1. Extract P0 auth/session lifecycle into shared controller/hook surfaces.
2. Extract P0 community analytics/automations loaders.
3. Extract P0 web membership review/funnel cluster.
4. Re-run guards and tighten budgets immediately after each slice.
5. Proceed to P1 clusters only after all P0 guards are green.

## Guardrail Policy Per Slice

Required after each slice:
- `./scripts/app_hook_budget_check.sh`
- `bash ./scripts/app_shell_boundary_check.sh`
- `./scripts/monolith_ratchet_check.sh`
- `bash ./scripts/community_core_check.sh`
- `npm run -s build`

Acceptance rule:
- no increase in shell hooks, endpoint literals, function declarations, or LOC ceilings
- each slice must reduce at least one shell complexity metric

## Out of Scope

- rewrite/migration to new state framework
- protocol/runtime redesign
- feature expansion while web shell remains at hook ceiling
