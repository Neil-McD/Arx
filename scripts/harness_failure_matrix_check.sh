#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Harness failure-path matrix =="

echo "[1/6] ARP degrade guards (handshake/cursor resume fallback)..."
bash scripts/arp_degrade_regression_check.sh

echo "[2/6] Event contract enforcement tests..."
(cd src-tauri && cargo test -q append_event_contract_)

echo "[3/6] Tool-loop no-progress cycle tests..."
(cd src-tauri && cargo test -q tool_cycle_tests::)

echo "[4/6] Projection parity guard..."
(cd src-tauri && cargo test -q rebuild_tool_calls_projection_matches_incremental_state)

echo "[5/6] Tool-call refresh event contract..."
if ! grep -q "emit_tool_calls_updated(window, thread_id);" src-tauri/src/main.rs; then
  echo "FAIL: runtime is not emitting tool-calls-updated after tool lifecycle writes"
  exit 1
fi
if ! grep -q "tool-calls-updated" src/runtime/arp/tauriClient.ts; then
  echo "FAIL: ARP client is not subscribed to tool-calls-updated"
  exit 1
fi
if ! grep -q "\"tool-calls-updated\"" src/App.tsx; then
  echo "FAIL: App listener path for tool-calls-updated is missing"
  exit 1
fi

echo "[6/6] Desktop invoke boundary guard..."
bash scripts/desktop_invoke_boundary_guard.sh

echo "PASS: harness failure-path matrix checks passed."
