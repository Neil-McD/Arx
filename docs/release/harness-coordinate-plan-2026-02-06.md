# Harness Coordinate Plan (MVP)

- Timestamp: 2026-02-06 18:27:51 UTC
- Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/mvp`
- Goal: keep Arx aligned to core harness primitives for long-horizon reliable autonomy.

## Irreducible Harness Primitives

1. Control-plane contract: UI <-> runtime handshake, capabilities, and failure degradation.
2. Loop reliability: bounded autonomous loop with deterministic pause/exit behavior.
3. Tool protocol truth: request/approval/start/finish evidence with stable replay semantics.
4. Resume continuity: event cursoring and fallback behavior that never wedges sessions.

## Current Evidence (Executed)

- ARP degrade regression check: PASS.
  - Command: `npm run check:arp-degrade`
- ARP parity preflight script: PASS (compile + degrade checks).
  - Command: `bash scripts/arp_parity_check.sh`
- Web build: PASS.
  - Command: `npm run build`
- Tauri tests: PASS (`14` tests).
  - Command: `(cd src-tauri && cargo test -q)`
- Compaction/handoff reliability tests: PASS.
  - Added tests in `src-tauri/src/main.rs`:
    - `soft_compact_openai_prunes_old_tool_and_long_assistant`
    - `hard_compact_openai_preserves_system_goal_and_tail`
    - `handoff_summary_event_roundtrips_latest_summary`
  - Result: total Tauri tests now `14` passing.

## Coordinate Check Against Primitives

1. Control-plane contract: GREEN
- `initialize()` fails closed (`cursor_resume: false`) in `src/runtime/arp/tauriClient.ts`.
- Protocol mismatch and initialize failure disable cursor resume in `src/App.tsx`.

2. Resume continuity: GREEN (guardrail present)
- Incremental sync trips one-way session breaker and falls back to full refresh on cursor non-advance or error.

3. Tool protocol truth: GREEN
- Tool lifecycle projection tests exist and pass (`tool_calls_projection` path).

4. Loop reliability: GREEN (with residual manual validation)
- Loop guards and compaction are integrated.
- Dedicated compaction/handoff regression tests now cover core behavior.

## Remaining Execution Plan (Harness-Focused)

1. Manual ARP UI parity run (required human verification)
- Run app with `VITE_ARP_CLIENT=1` and complete checklist in `scripts/arp_parity_check.sh`.
- Record pass/fail per item in release notes.

2. Add compaction/handoff regression tests (code) [DONE]
- Added deterministic tests for:
  - soft compaction pruning behavior
  - hard compaction tail preservation
  - handoff summary append + reload behavior

3. Add one runtime failure-path smoke for incremental sync circuit breaker (code) [DONE]
- Hardened `scripts/arp_degrade_regression_check.sh` to assert:
  - non-advancing cursor guard exists (`listEventsSince returned a non-advancing cursor`)
  - circuit breaker warning exists
  - `setRuntimeSupportsCursorResume(false)` fallback exists

4. Keep DB lint cleanup tracked separately
- Do not block harness QA on unrelated SQL lint debt; handle as parallel hardening stream.
