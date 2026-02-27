#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MATRIX_DOC="docs/canonical-harness-parity-matrix.md"
CODING_CONTRACT="shared/contracts/coding_harness_tools_v1.json"
RUNTIME_TURN="supabase/functions/runtime_turn/index.ts"
CLOUD_HARNESS_CORE="supabase/functions/_shared/cloud_harness_core.ts"
CLOUD_HARNESS_LANE="supabase/functions/_shared/daytona_cloud_lane.ts"
LOCAL_MAIN="src-tauri/src/main.rs"

echo "== Harness parity contract check =="

echo "[1/10] Canonical parity matrix doc must exist..."
test -f "$MATRIX_DOC" || {
  echo "FAIL: missing $MATRIX_DOC"
  exit 1
}

echo "[2/10] Canonical parity matrix doc must include core contract sections..."
for heading in \
  "Irreducible Harness Core" \
  "Golden Tool Parity (Coding Harness)" \
  "Golden Approval Parity" \
  "Golden Event Parity" \
  "Drift Policy"
do
  grep -q "$heading" "$MATRIX_DOC" || {
    echo "FAIL: missing heading '$heading' in $MATRIX_DOC"
    exit 1
  }
done

echo "[3/10] Coding harness contract desktop runtime tools must stay canonical..."
EXPECTED_TOOLS="update_plan read list_dir glob grep sha256 write edit bash"
ACTUAL_TOOLS="$(
  node -e "const fs=require('fs');const p=process.argv[1];const json=JSON.parse(fs.readFileSync(p,'utf8'));const tools=((json||{}).runtime_exposed_tools||{}).desktop||[];if(!Array.isArray(tools)){process.exit(2)};process.stdout.write(tools.join(' '));" \
    "$CODING_CONTRACT"
)"
if [[ "$ACTUAL_TOOLS" != "$EXPECTED_TOOLS" ]]; then
  echo "FAIL: coding harness runtime tools changed"
  echo "Expected: $EXPECTED_TOOLS"
  echo "Actual:   $ACTUAL_TOOLS"
  exit 1
fi

echo "[4/10] Cloud Daytona lane must parse canonical coding tool names..."
for tool_name in update_plan read list_dir glob grep sha256 write edit bash
do
  if ! grep -q "\"${tool_name}\"" "$RUNTIME_TURN" && ! grep -q "\"${tool_name}\"" "$CLOUD_HARNESS_CORE"; then
    echo "FAIL: cloud harness missing tool parse support for '${tool_name}'"
    exit 1
  fi
done

echo "[5/10] Cloud Daytona lane must read approval policy from shared coding contract..."
grep -q "coding_harness_tools_v1.json" "$CLOUD_HARNESS_CORE" || {
  echo "FAIL: cloud_harness_core must import shared coding harness contract"
  exit 1
}
for policy_marker in \
  "cloud_policy_v1:readonly_auto_allow" \
  "cloud_policy_v1:update_plan_auto_allow" \
  "cloud_policy_v1:write_tools_enabled_agent_full" \
  "cloud_policy_v1:read_only_mode" \
  "cloud_policy_v1:write_tools_require_explicit_approval"
do
  if ! grep -q "$policy_marker" "$CODING_CONTRACT"; then
    echo "FAIL: shared coding contract missing cloud policy marker '$policy_marker'"
    exit 1
  fi
done

echo "[6/10] Cloud Daytona lane must emit canonical tool lifecycle events..."
for event_name in \
  "tool_call_requested" \
  "tool_approval_requested" \
  "tool_call_approved" \
  "tool_call_denied" \
  "tool_call_started" \
  "tool_call_finished"
do
  if ! grep -q "\"${event_name}\"" "$RUNTIME_TURN" && ! grep -q "\"${event_name}\"" "$CLOUD_HARNESS_LANE"; then
    echo "FAIL: runtime_turn missing event '${event_name}'"
    exit 1
  fi
done

echo "[7/10] Cloud Daytona lane must keep tool-decision pause/resume contract..."
grep -q "waitForRuntimeToolDecision" "$RUNTIME_TURN" || {
  echo "FAIL: runtime_turn missing waitForRuntimeToolDecision"
  exit 1
}
grep -q "action === \"tool_decision\"" "$RUNTIME_TURN" || {
  echo "FAIL: runtime_turn missing tool_decision action path"
  exit 1
}
if ! grep -q "status: \"awaiting_approval\"" "$RUNTIME_TURN" && ! grep -q "status: \"awaiting_approval\"" "$CLOUD_HARNESS_LANE"; then
  echo "FAIL: runtime_turn missing awaiting_approval status transition"
  exit 1
fi
grep -q "status: \"resuming\"" "$RUNTIME_TURN" || {
  echo "FAIL: runtime_turn missing resuming status transition"
  exit 1
}

echo "[8/10] Cloud runtime terminal event must be canonical run_finished..."
grep -q "\"run_finished\"" "$RUNTIME_TURN" || {
  echo "FAIL: runtime_turn missing canonical terminal event 'run_finished'"
  exit 1
}
if grep -q "\"run_completed\"" "$RUNTIME_TURN" || grep -q "\"run_failed\"" "$RUNTIME_TURN"; then
  echo "FAIL: runtime_turn still emits non-canonical terminal events ('run_completed'/'run_failed')"
  exit 1
fi

echo "[9/10] Local harness must remain contract-driven from shared coding contract..."
grep -q "coding_harness_tools_v1.json" "$LOCAL_MAIN" || {
  echo "FAIL: local harness missing shared coding contract import"
  exit 1
}
grep -q "CODING_HARNESS_CAPABILITY_CONTRACT_ID" "$LOCAL_MAIN" || {
  echo "FAIL: local harness missing coding contract id constant"
  exit 1
}

echo "[10/10] Local harness must preserve canonical tool lifecycle events..."
for event_name in \
  "tool_call_requested" \
  "tool_call_started" \
  "tool_call_finished" \
  "run_started" \
  "run_finished"
do
  grep -q "\"${event_name}\"" "$LOCAL_MAIN" || {
    echo "FAIL: local harness missing event '${event_name}'"
    exit 1
  }
done

echo "PASS: harness parity contract check passed."
