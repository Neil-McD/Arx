#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
RUN_ORCHESTRATION_HOOK="src/controllers/desktop/useDesktopRunOrchestration.ts"

echo "== Harness failure-path matrix =="

echo "[1/22] ARP degrade guards (handshake/cursor resume fallback)..."
bash scripts/arp_degrade_regression_check.sh

echo "[2/22] Event contract enforcement tests..."
(cd src-tauri && cargo test -q append_event_contract_)

echo "[3/22] Tool-loop no-progress cycle tests..."
(cd src-tauri && cargo test -q tool_cycle_tests::)

echo "[4/22] Projection parity guard..."
(cd src-tauri && cargo test -q rebuild_tool_calls_projection_matches_incremental_state)

echo "[5/22] Coding harness contract guard..."
bash scripts/coding_harness_contract_regression_check.sh

echo "[6/22] Supabase CLI contract guard..."
bash scripts/supabase_cli_contract_check.sh

echo "[7/22] Supabase migration filename guard..."
bash scripts/supabase_migration_filename_guard.sh

echo "[8/22] Tool-call refresh event contract..."
if ! grep -q "emit_tool_calls_updated(window, thread_id);" src-tauri/src/main.rs; then
  echo "FAIL: runtime is not emitting tool-calls-updated after tool lifecycle writes"
  exit 1
fi
if ! grep -q "tool-calls-updated" src/runtime/arp/tauriClient.ts; then
  echo "FAIL: ARP client is not subscribed to tool-calls-updated"
  exit 1
fi
if ! grep -q "\"tool-calls-updated\"" "$RUN_ORCHESTRATION_HOOK" \
  && ! grep -q "tool_calls_updated" "$RUN_ORCHESTRATION_HOOK"; then
  echo "FAIL: run-orchestration hook listener path for tool call refresh notifications is missing"
  exit 1
fi

echo "[9/22] Desktop invoke boundary guard..."
bash scripts/desktop_invoke_boundary_guard.sh

echo "[10/22] Desktop shell boundary guard..."
bash scripts/desktop_shell_boundary_check.sh

echo "[11/22] Desktop send-flow controller regression guard..."
bash scripts/desktop_send_flow_controller_regression_check.sh

echo "[12/22] Desktop slash controller regression guard..."
bash scripts/desktop_slash_controller_regression_check.sh

echo "[13/22] Desktop tool approval controller regression guard..."
bash scripts/desktop_tool_approval_controller_regression_check.sh

echo "[14/22] Desktop runtime type dedupe guard..."
bash scripts/desktop_runtime_type_dedupe_check.sh

echo "[15/22] Desktop sources-used controller regression guard..."
bash scripts/desktop_sources_used_controller_regression_check.sh

echo "[16/22] Community message parsing shared regression guard..."
bash scripts/community_message_parsing_shared_regression_check.sh

echo "[17/22] Legacy feature prune guard..."
bash scripts/legacy_feature_prune_check.sh

echo "[18/22] BYOK surface prune guard..."
bash scripts/byok_surface_prune_check.sh

echo "[19/22] Model routing legacy fallback prune guard..."
bash scripts/model_routing_legacy_fallback_prune_check.sh

echo "[20/22] Desktop Supabase session secure-store guard..."
bash scripts/desktop_supabase_session_secure_store_guard.sh

echo "[21/22] Community context degrade guard..."
bash scripts/community_harness_contract_regression_check.sh
node scripts/community_context_parity_check.mjs
bash scripts/community_harness_write_guard_check.sh
(cd src-tauri && cargo test -q community_context_prompt_tests::)

echo "[22/22] User-facing output sanitization guard..."
node scripts/community_user_facing_output_sanitization_check.mjs

echo "PASS: harness failure-path matrix checks passed."
