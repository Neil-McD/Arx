# App Shell Contract (MVP)

Scope:
- `src/App.tsx`
- `apps/web/src/App.tsx`

These files are composition roots. They orchestrate views and wiring, not domain workflows.

## Allowed In App Shells
- Route/page/view selection.
- Layout and panel visibility state.
- Wiring extracted controllers/hooks to UI components.
- Passing data and callbacks into composed components.

## Disallowed In App Shells
- New direct API endpoint literals (`/rest/v1/*`, `/functions/v1/*`).
- New long async workflows (auth/session, billing, community admin, chat runtime, voice, attachments).
- New duplicated desktop/web business logic blocks.
- New net `useEffect`/`useState` growth (shell hook counts are frozen).

## Enforcement (Frozen Budgets)
- `scripts/app_hook_budget_check.sh`
  - `src/App.tsx`: `useState <= 116`, `useEffect <= 65`
  - `apps/web/src/App.tsx`: `useState <= 134`, `useEffect <= 79`
- `scripts/app_shell_boundary_check.sh`
  - `src/App.tsx`: endpoint literals `<= 19`, function declarations `<= 144`
  - `apps/web/src/App.tsx`: endpoint literals `<= 38`, function declarations `<= 109`
- `scripts/monolith_ratchet_check.sh`
- `scripts/community_core_check.sh`

## Operating Rule
- If a feature requires new shell hooks or new shell endpoint literals, extraction is required first.
- Every App-shell change must be net-neutral or net-reductive on at least one shell metric.

## Target End State
- App shells are composition-only surfaces.
- Domain logic lives in:
  - `src/controllers/desktop/*`
  - `apps/web/src/controllers/*`
  - `shared/*`
