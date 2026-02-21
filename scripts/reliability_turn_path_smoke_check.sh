#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Reliability turn-path smoke check =="

TOTAL_STEPS=3
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

TAURI_CARGO_MANIFEST="src-tauri/Cargo.toml"

if ! command -v cargo >/dev/null 2>&1; then
  echo "FAIL: cargo is required for turn-path smoke tests."
  exit 1
fi

run_step "Canonical tool-turn success path" cargo test --manifest-path "$TAURI_CARGO_MANIFEST" -q community_search_falls_back_when_compiled_is_empty
run_step "Canonical tool-turn failure path" cargo test --manifest-path "$TAURI_CARGO_MANIFEST" -q community_memory_candidate_propose_rejects_missing_evidence_items_without_rpc
run_step "Canonical tool-event sequencing path" cargo test --manifest-path "$TAURI_CARGO_MANIFEST" -q community_memory_candidate_propose_records_requested_started_finished_events

echo "PASS: reliability turn-path smoke check passed."
