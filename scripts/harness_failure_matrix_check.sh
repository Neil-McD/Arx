#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
RUN_ORCHESTRATION_HOOK="src/controllers/desktop/useDesktopRunOrchestration.ts"

echo "== Harness failure-path matrix =="

echo "[1/24] ARP degrade guards (handshake/cursor resume fallback)..."
bash scripts/arp_degrade_regression_check.sh

echo "[2/24] Event contract enforcement tests..."
(cd src-tauri && cargo test -q append_event_contract_)

echo "[3/24] Tool-loop no-progress cycle tests..."
(cd src-tauri && cargo test -q tool_cycle_tests::)

echo "[4/24] Projection parity guard..."
(cd src-tauri && cargo test -q rebuild_tool_calls_projection_matches_incremental_state)

echo "[5/24] Coding harness contract guard..."
bash scripts/coding_harness_contract_regression_check.sh

echo "[6/24] Community harness contract guard..."
bash scripts/community_harness_contract_regression_check.sh

echo "[7/26] Supabase CLI contract guard..."
bash scripts/supabase_cli_contract_check.sh

echo "[8/26] Supabase migration filename guard..."
bash scripts/supabase_migration_filename_guard.sh

echo "[7/24] Tool-call refresh event contract..."
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

echo "[8/24] Desktop invoke boundary guard..."
bash scripts/desktop_invoke_boundary_guard.sh

echo "[9/24] Desktop shell boundary guard..."
bash scripts/desktop_shell_boundary_check.sh

echo "[10/24] Desktop send-flow controller regression guard..."
bash scripts/desktop_send_flow_controller_regression_check.sh

echo "[11/24] Desktop slash controller regression guard..."
bash scripts/desktop_slash_controller_regression_check.sh

echo "[12/24] Desktop tool approval controller regression guard..."
bash scripts/desktop_tool_approval_controller_regression_check.sh

echo "[13/23] Desktop runtime type dedupe guard..."
bash scripts/desktop_runtime_type_dedupe_check.sh

echo "[14/23] Desktop sources-used controller regression guard..."
bash scripts/desktop_sources_used_controller_regression_check.sh

echo "[15/23] Community message parsing shared regression guard..."
bash scripts/community_message_parsing_shared_regression_check.sh

echo "[16/23] Legacy feature prune guard..."
bash scripts/legacy_feature_prune_check.sh

echo "[17/23] BYOK surface prune guard..."
bash scripts/byok_surface_prune_check.sh

echo "[18/23] Model routing legacy fallback prune guard..."
bash scripts/model_routing_legacy_fallback_prune_check.sh

echo "[19/23] Desktop Supabase session secure-store guard..."
bash scripts/desktop_supabase_session_secure_store_guard.sh

echo "[20/23] Thread context regression guard..."
bash scripts/thread_context_regression_check.sh

echo "[21/23] Community context degrade guard..."
if ! test -f shared/contracts/community_harness_capabilities_v3.json; then
  echo "FAIL: community harness capability v3 contract is missing"
  exit 1
fi
if ! test -f shared/contracts/community_context_observability_v1.json; then
  echo "FAIL: community context observability contract is missing"
  exit 1
fi
if ! grep -q "search_compiled_community_context" src-tauri/src/main.rs src-tauri/src/community_context.rs; then
  echo "FAIL: desktop runtime is not calling compiled community context RPC"
  exit 1
fi
if ! grep -q "search_compiled_community_context" supabase/functions/agent_turn/index.ts; then
  echo "FAIL: cloud agent_turn is not calling compiled community context RPC"
  exit 1
fi
if ! grep -q "fn build_community_context_diagnostics" src-tauri/src/main.rs src-tauri/src/community_context.rs; then
  echo "FAIL: desktop runtime is missing centralized community context diagnostics helper"
  exit 1
fi
if ! grep -q "make_tool_schema_for_lane" src-tauri/src/main.rs; then
  echo "FAIL: desktop runtime is missing lane-aware tool schema selection"
  exit 1
fi
if ! grep -q "community_harness_capabilities_v3" src-tauri/src/main.rs; then
  echo "FAIL: desktop runtime is missing explicit community harness capability v3 contract id"
  exit 1
fi
if ! grep -q "community_context_search" src-tauri/src/main.rs; then
  echo "FAIL: desktop runtime community tool surface is missing community_context_search"
  exit 1
fi
if ! grep -q "community_memory_search" src-tauri/src/main.rs; then
  echo "FAIL: desktop runtime community tool surface is missing community_memory_search"
  exit 1
fi
if ! grep -q "community_memory_candidate_propose" src-tauri/src/main.rs; then
  echo "FAIL: desktop runtime community tool surface is missing community_memory_candidate_propose"
  exit 1
fi
if ! grep -q "COMMUNITY_RPC_MEMORY_SEARCH" src-tauri/src/community_context.rs; then
  echo "FAIL: desktop runtime is missing community memory search RPC constant wiring"
  exit 1
fi
if ! grep -q "COMMUNITY_RPC_MEMORY_CANDIDATE_PROPOSE" src-tauri/src/community_context.rs; then
  echo "FAIL: desktop runtime is missing community memory candidate RPC constant wiring"
  exit 1
fi
if ! grep -q "create or replace function public.community_memory_candidate_propose" supabase/migrations/*.sql; then
  echo "FAIL: cloud memory pipeline migration is missing community_memory_candidate_propose"
  exit 1
fi
if ! grep -q "create or replace function public.search_community_memory_items" supabase/migrations/*.sql; then
  echo "FAIL: cloud memory pipeline migration is missing search_community_memory_items"
  exit 1
fi
if ! grep -q "community_context_observability_v1" src-tauri/src/main.rs src-tauri/src/community_context.rs; then
  echo "FAIL: desktop runtime is missing explicit community context observability contract id"
  exit 1
fi
if ! grep -q "build_community_context_payload(" src-tauri/src/main.rs; then
  echo "FAIL: memory_retrieval payload is not wired through centralized community context payload helper"
  exit 1
fi
if ! grep -q "\"compile_version\": diagnostics.get(\"compile_version\").cloned()" src-tauri/src/community_context.rs; then
  echo "FAIL: community context payload helper is missing compile_version wiring"
  exit 1
fi
if ! grep -q "\"chat_fetch_ok\": diagnostics.get(\"chat_fetch_ok\").cloned()" src-tauri/src/community_context.rs; then
  echo "FAIL: memory_retrieval payload is missing centralized community chat fetch diagnostics wiring"
  exit 1
fi
if ! grep -q "\"resource_fetch_ok\": diagnostics.get(\"resource_fetch_ok\").cloned()" src-tauri/src/community_context.rs; then
  echo "FAIL: memory_retrieval payload is missing centralized community resource fetch diagnostics wiring"
  exit 1
fi
if ! grep -q "\"quality_band\": diagnostics.get(\"quality_band\").cloned()" src-tauri/src/community_context.rs; then
  echo "FAIL: memory_retrieval payload is missing quality band diagnostics wiring"
  exit 1
fi
if ! grep -q "\"retrieval_latency_ms\": diagnostics.get(\"retrieval_latency_ms\").cloned()" src-tauri/src/community_context.rs; then
  echo "FAIL: memory_retrieval payload is missing retrieval latency diagnostics wiring"
  exit 1
fi
(cd src-tauri && cargo test -q community_context_prompt_tests::)

echo "[22/23] Community context parity guard..."
node scripts/community_context_parity_check.mjs
(cd src-tauri && cargo test -q community_context_contract_fixture_tests::)

echo "[23/23] Thread context E2E matrix guard..."
bash scripts/thread_context_e2e_matrix_check.sh

echo "PASS: harness failure-path matrix checks passed."
