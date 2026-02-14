# PolyNet.ai MVP 8-Readiness Scorecard

Date: 2026-02-13  
Scope: `/Users/neilmcdevitt/code/arx/.worktrees/mvp`

## Hard Gate (Non-Negotiable)

- MVP is only declared 8-ready when **all five axes are >= 8.0**.
- Average score does not count if any single axis is below 8.0.
- Release confidence requires **2 consecutive green weekly reviews** with no open P0/P1 drift.

## Axis Rubric (Pass/Fail)

### 1) Simplicity (target >= 8.0)
- Pass only if:
  - Monolith ratchet and app-shell boundary guards pass.
  - No new duplicate MVP entry surfaces are introduced.
  - Net complexity is non-increasing for touched hotspots (`src/App.tsx`, `apps/web/src/App.tsx`, `src-tauri/src/main.rs`, `src-tauri/src/db.rs`).

### 2) Scalability (target >= 8.0)
- Pass only if:
  - Build passes with explicit bundle budget checks.
  - Hotspot extraction trend is down (no growth in concentrated runtime/app-shell debt for touched files).
  - Query/tooling paths used in MVP remain bounded and deterministic.

### 3) Reliability (target >= 8.0)
- Pass only if:
  - Community core matrix passes.
  - Harness failure matrix passes.
  - Build/test commands pass for shipped surfaces.

### 4) Robustness (target >= 8.0)
- Pass only if:
  - Crash/interrupt semantics remain truthful (no false-success terminal states).
  - Workspace identity and DB write-path contract guards pass.
  - Invite lifecycle and lens-switch state transitions remain contract-aligned.

### 5) Security (target >= 8.0)
- Pass only if:
  - Runtime bootstrap/download paths are checksum/signature verified and fail closed.
  - Entitlement and access boundaries remain fail-closed.
  - Dependency determinism and scanning are wired in CI for active app roots.

## Canonical Evidence Commands

- `bash scripts/community_core_check.sh`
- `bash scripts/harness_failure_matrix_check.sh`
- `bash scripts/workspace_identity_contract_guard.sh`
- `bash scripts/db_write_path_contract_guard.sh`
- `bash scripts/supabase_cli_contract_check.sh`
- `bash scripts/supabase_migration_filename_guard.sh`
- `bash scripts/monolith_ratchet_check.sh`
- `bash scripts/web_bundle_budget_check.sh apps/web`
- `bash scripts/thread_event_perf_smoke_check.sh`
- `npm run build`
- `(cd src-tauri && cargo test -q)`

## Current Snapshot (Baseline)

- Simplicity: 7.2 (below target)
- Scalability: 7.5 (below target)
- Reliability: 8.2 (meets target)
- Robustness: 8.0 (meets target)
- Security: 7.7 (below target)
- Gate result: **NOT 8-ready**

## Immediate Focus (Phase A)

1. Harden runtime supply-chain bootstrap path (fail-closed verification).
2. Close invite lifecycle command parity (`expired` transition).
3. Tighten CI gate + ratchets + dependency determinism checks.
