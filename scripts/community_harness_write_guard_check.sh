#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CAPABILITIES_CONTRACT="shared/contracts/community_harness_capabilities_v3.json"
RUST_RUNTIME="src-tauri/src/main.rs"
EDGE_RUNTIME="supabase/functions/agent_turn/index.ts"

fail() {
  echo "FAIL: $1"
  exit 1
}

echo "== Community harness write guard checks =="

echo "[1/4] Capability contract is read-first and denies chat/resource write tools..."
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const contract = JSON.parse(readFileSync("shared/contracts/community_harness_capabilities_v3.json", "utf8"));
const runtimeTools = Array.isArray(contract?.runtime_exposed_tools?.desktop)
  ? contract.runtime_exposed_tools.desktop
  : [];
const deniedToolNames = Array.isArray(contract?.denied_tool_names) ? contract.denied_tool_names : [];

const requiredRuntimeTools = [
  "community_context_search",
  "community_memory_search",
  "community_memory_candidate_propose",
];
const forbiddenRuntimeTools = [
  "community_chat_post",
  "community_resource_publish",
  "community_artifact_publish",
  "community_automation_trigger",
];
for (const name of requiredRuntimeTools) {
  if (!runtimeTools.includes(name)) {
    throw new Error(`runtime_exposed_tools.desktop missing ${name}`);
  }
}
for (const name of forbiddenRuntimeTools) {
  if (!deniedToolNames.includes(name)) {
    throw new Error(`denied_tool_names missing ${name}`);
  }
  if (runtimeTools.includes(name)) {
    throw new Error(`runtime_exposed_tools.desktop must not include ${name}`);
  }
}
NODE

echo "[2/4] Desktop lane gate must be contract-driven and enforced by lane tests..."
grep -q "community_harness_desktop_runtime_tools()" "$RUST_RUNTIME" \
  || fail "community lane gate is not using contract runtime tool list"
(cd src-tauri && cargo test -q lane_tool_contract_tests::chat_lane_exposes_only_community_tools)
(cd src-tauri && cargo test -q lane_tool_contract_tests::agent_lane_keeps_coding_tool_surface)

echo "[3/4] Desktop community tool router has no direct chat/resource publish tools..."
grep -q "\"community_chat_post\" =>" "$RUST_RUNTIME" && fail "desktop runtime exposes community_chat_post tool handler"
grep -q "\"community_resource_publish\" =>" "$RUST_RUNTIME" && fail "desktop runtime exposes community_resource_publish tool handler"

echo "[4/4] Cloud community RPC map is retrieval + memory-candidate only..."
RPC_BLOCK="$(awk '/const COMMUNITY_RPC = Object.freeze\(\{/{flag=1} flag{print} /\}\);/{if(flag){exit}}' "$EDGE_RUNTIME")"
[[ -n "$RPC_BLOCK" ]] || fail "unable to locate COMMUNITY_RPC map in edge runtime"

for required in search_compiled_community_context search_community_chat_snippets search_community_resource_snippets search_community_memory_items community_memory_candidate_propose; do
  grep -q "$required" <<<"$RPC_BLOCK" || fail "COMMUNITY_RPC missing $required"
done

for forbidden in community_chat_post community_resource_publish create_community_chat_message insert_community_resource publish_community_resource; do
  if grep -q "$forbidden" <<<"$RPC_BLOCK"; then
    fail "COMMUNITY_RPC must not expose $forbidden"
  fi
done

echo "PASS: community harness write guard checks passed."
