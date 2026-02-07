# Monolith Extraction Plan (Desktop/Web/Harness)

- Timestamp: 2026-02-06 UTC
- Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/mvp`
- Goal: reduce monolith risk without changing product behavior.

## Baseline (measured)

Top monolith files:

1. `apps/web/src/App.tsx` — 19498 lines
2. `src/App.tsx` — 19059 lines
3. `src-tauri/src/main.rs` — 11153 lines
4. `src/index.css` — 8565 lines
5. `src-tauri/src/db.rs` — 3822 lines
6. `apps/web/src/index.css` — 2684 lines

Concentration:

- Top 6 files account for ~97.5% of tracked app/runtime code lines.

Desktop orchestration pressure:

- `src/App.tsx`: 260 `useState`, 80 `useEffect`, 85 direct `invoke(...)` callsites.

## Contracts to Preserve

1. ARP handshake fails closed (`cursor_resume=false` on init mismatch/failure).
2. Tool lifecycle contract remains event-driven (`requested -> approved/denied -> started -> finished`).
3. Domain separation stays explicit:
   - desktop personal: local
   - web personal: cloud
   - community: shared cloud

## Immediate Guardrails (done)

1. Added desktop invoke boundary guard:
   - `scripts/desktop_invoke_boundary_guard.sh`
   - current baseline: `85` direct `invoke(...)` uses in `src/App.tsx`
2. Wired guard into harness matrix:
   - `scripts/harness_failure_matrix_check.sh`
3. First extraction pattern landed:
   - `src/features/harness/runPhase.ts`
   - `src/App.tsx` now imports run-phase reducer/types from module.
4. Streaming orchestration extracted:
   - `src/features/harness/useStreamingState.ts`
   - `src/App.tsx` now consumes hook-managed streaming refs/state/throttle.

## Extraction Sequence (no behavior changes)

### Phase 1 — Desktop App slice extraction

Target: `src/App.tsx`

1. `src/features/harness/sendTurn.ts`
   - own send transaction path (`ensureThreadId -> lens check -> optimistic user row -> sendTurn -> error fallback`)
   - all runtime side-effects injected as dependencies.
2. `src/features/harness/streaming.ts`
   - own streaming refs + RAF scheduling + render throttle.
3. `src/features/approvals/*`
   - tool approval data normalization and decision handlers.
4. `src/features/threads/*`
   - thread CRUD and active-thread selection self-heal.

Exit criteria:

- `src/App.tsx` falls below 60 direct `invoke(...)` callsites.
- no change in harness failure matrix checks.

### Phase 2 — Tauri runtime command split

Target: `src-tauri/src/main.rs`

1. Move command handlers into modules:
   - `src-tauri/src/commands/runtime.rs`
   - `src-tauri/src/commands/threads.rs`
   - `src-tauri/src/commands/memory.rs`
2. Keep `main.rs` as registration/wiring.
3. Keep loop internals in runtime modules:
   - `runtime/turn_loop.rs`
   - `runtime/tool_approval.rs`

Exit criteria:

- `main.rs` < 7000 lines.
- command registration unchanged in behavior.

### Phase 3 — Web App split

Target: `apps/web/src/App.tsx`

1. `apps/web/src/features/chat/*` — send/stream/render.
2. `apps/web/src/features/community/*` — community lens, joins, funnel.
3. `apps/web/src/features/auth/*` — session, OAuth, user bootstrap.

Exit criteria:

- `apps/web/src/App.tsx` < 12000 lines.
- no behavior regressions in chat/community/auth workflows.

### Phase 4 — CSS decomposition

1. Split desktop CSS:
   - `src/styles/chat.css`
   - `src/styles/tools.css`
   - `src/styles/approvals.css`
2. Split web CSS similarly under `apps/web/src/styles/*`.

Exit criteria:

- selector ownership is feature-scoped, not global file-sprawl.

## Validation Loop (every phase)

1. `bash scripts/harness_failure_matrix_check.sh`
2. `npm run build`
3. `(cd src-tauri && cargo test -q)`
4. Manual ARP parity checklist with `VITE_ARP_CLIENT=1`.
