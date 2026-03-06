# Convex Track A Execution Board v1

Status: archived (completed)
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`
Scope: complete Convex runtime/gate/auth hardening before any Web3 activation work.

## 1) Objective

Ship a deterministic, Convex-first cloud runtime with contract-accurate tool lifecycle semantics, stable lane behavior, and fail-closed auth/gate enforcement across web + desktop.

## 2) Non-Negotiable Constraints

1. `requires_tools=true` cloud turns cannot silently drift to non-tool execution.
2. Server remains gate authority (UI is advisory).
3. Verified identity remains fail-closed by default.
4. Idempotency and persistence semantics remain deterministic.
5. No legacy transport markers re-enter runtime/product paths.

## 3) Milestones

## M0 — Baseline Integrity (Checkpoint)

Status: completed

Tasks:
1. [x] Convex cut report baseline captured (`scripts/convex_cut_surface_report.sh`).
2. [x] Foundation baseline gate green (`scripts/foundation_baseline_gate.sh`).
3. [x] Journey smoke gate green (`scripts/journey_smoke_gate.sh`).

Exit evidence:
1. `legacy_transport_ratio_pct=0.00`
2. Foundation baseline gate pass.
3. Journey smoke gate pass.

## M1 — Runtime Turn Contract Closure

Status: completed

Primary files:
1. `convex/http.ts`
2. `convex/threads.ts`
3. `shared/useWebTurnRunnerController.ts`
4. `src/services/thread/createDesktopCloudChatThreadApi.ts`

Tasks:
1. [x] Persist canonical run lifecycle evidence (`run_started` / `run_finished`) in Convex runtime ledgers.
2. [x] Preserve deterministic message persistence and replay/idempotency behavior.
3. [x] Add explicit `requires_tools` lifecycle trace (`tool_call_requested`, `tool_call_denied`) so tool-path behavior is not silent.
4. [x] Replace transitional tool-denied trace with explicit lifecycle events (`tool_call_requested` -> `tool_call_started` -> `tool_call_finished`) for tool-capable cloud turns.
5. [x] Replace lifecycle placeholder with Daytona-backed probe execution (`tool_call_requested` -> `tool_call_started` -> `tool_call_finished`) and fail-closed runner errors.
6. [x] Extend probe execution to model-directed iterative Daytona tool loop with policy-evented approvals/denials.
7. [x] Remove cloud manual-approval branch state and keep deterministic cloud tool policy execution.

Exit evidence:
1. `bash scripts/runtime_turn_contract_guard.sh`
2. `bash scripts/runtime_turn_client_idempotency_guard.sh`
3. `bash scripts/reliability_turn_path_smoke_check.sh`

## M2 — Lane Determinism and Fallback Hardening

Status: completed

Primary files:
1. `convex/http.ts`
2. `shared/useWebSendFlowController.ts`
3. `src/services/thread/createDesktopCloudChatThreadApi.ts`
4. `docs/canonical-cloud-run-v1.md`

Tasks:
1. [x] Make tool-capable cloud turns deterministic and contract-compliant.
2. [x] Bound or remove fallback behavior that violates tool-turn contract expectations.
3. [x] Keep lane behavior explicit and observable in responses/errors.

Exit evidence:
1. `bash scripts/runtime_turn_contract_guard.sh`
2. `bash scripts/journey_smoke_gate.sh`
3. Manual verification that cloud tool turns do not silently execute in fallback non-tool lane.

## M3 — Auth + Gate Fail-Closed Parity

Status: completed

Primary files:
1. `convex/http.ts`
2. `convex/authIdentity.ts`
3. `convex/gates.ts`
4. `convex/auth.ts`
5. `shared/cloudAuthCore.ts`
6. `shared/cloudAuthFlow.ts`

Tasks:
1. [x] Keep verified-identity path authoritative.
2. [x] Keep gate outcomes stable against matrix contracts.
3. [x] Keep auth transport Convex runtime-routed and contract-safe.

Exit evidence:
1. `bash scripts/convex_verified_identity_guard.sh`
2. `bash scripts/auth_env_contract_guard.sh`
3. `bash scripts/gate_parity_contract_check.sh`

## M4 — Migration Closure and Confidence Lock

Status: completed

Primary files:
1. `docs/README.md`
2. `docs/archive/*`
3. `scripts/foundation_baseline_gate.sh`
4. `scripts/convex_cut_surface_report.sh`

Tasks:
1. [x] Prune migration-era guard/doc noise only after parity confidence is locked.
2. [x] Keep active docs aligned to actual runtime behavior.
3. [x] Keep CI baseline focused on production-relevant contracts.

Exit evidence:
1. `bash scripts/foundation_baseline_gate.sh`
2. `bash scripts/convex_cut_surface_report.sh`
3. `bash scripts/no_legacy_provider_repo_guard.sh`

## 4) Weekly Operating Cadence

1. Start-of-week: run full baseline gate, capture failures as milestone tasks.
2. Mid-week: land one milestone slice at a time (no cross-milestone churn).
3. End-of-week: rerun full baseline and update milestone status in this file.

## 5) Definition of Done (Track A)

Track A is done when all are true:

1. M1-M4 are complete.
2. Runtime contract behavior and docs are aligned.
3. All baseline guards pass in CI.
4. Convex remains the only active backend surface for runtime/product paths.

## 6) Command Bundle (Single Run)

```bash
bash scripts/convex_cut_surface_report.sh && \
bash scripts/runtime_turn_contract_guard.sh && \
bash scripts/runtime_turn_client_idempotency_guard.sh && \
bash scripts/convex_verified_identity_guard.sh && \
bash scripts/auth_env_contract_guard.sh && \
bash scripts/gate_parity_contract_check.sh && \
bash scripts/journey_smoke_gate.sh && \
bash scripts/foundation_baseline_gate.sh
```
