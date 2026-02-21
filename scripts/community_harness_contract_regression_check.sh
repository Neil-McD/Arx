#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONTRACT_FILE="shared/contracts/community_harness_capabilities_v3.json"
RUNTIME_FILE="src-tauri/src/main.rs"
EDGE_FILE="supabase/functions/agent_turn/index.ts"

echo "== Community harness contract regression checks =="

echo "[1/9] Contract file + core shape..."
if [ ! -f "$CONTRACT_FILE" ]; then
  echo "FAIL: missing $CONTRACT_FILE"
  exit 1
fi
node - <<'NODE'
const fs = require("node:fs");
const contractPath = "shared/contracts/community_harness_capabilities_v3.json";
const raw = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(raw);
const requiredRuntimeTools = [
  "community_search",
  "community_memory_candidate_propose",
];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(contract.id === "community_harness_capabilities_v3", "contract id mismatch");
assert(contract.version === 3, "contract version mismatch");

const runtimeTools = contract.runtime_exposed_tools?.desktop ?? [];
const webRuntimeTools = contract.runtime_exposed_tools?.web ?? [];
assert(Array.isArray(runtimeTools), "runtime_exposed_tools.desktop missing");
assert(Array.isArray(webRuntimeTools), "runtime_exposed_tools.web missing");
assert(
  JSON.stringify(runtimeTools) === JSON.stringify(webRuntimeTools),
  `runtime_exposed_tools.desktop/web mismatch: desktop=${JSON.stringify(runtimeTools)} web=${JSON.stringify(webRuntimeTools)}`
);

const caps = Array.isArray(contract.capabilities) ? contract.capabilities : [];
const activeNames = caps
  .filter((cap) => cap?.status === "active")
  .map((cap) => cap.name)
  .filter((name) => typeof name === "string");
for (const name of requiredRuntimeTools) {
  assert(runtimeTools.includes(name), `runtime_exposed_tools.desktop missing required tool ${name}`);
  assert(activeNames.includes(name), `missing active capability ${name}`);
}

const deprecatedCapabilities = caps.filter((cap) => cap?.status === "deprecated");
assert(
  deprecatedCapabilities.length === 0,
  `legacy deprecated community alias capabilities should be deleted: ${deprecatedCapabilities.map((cap) => cap?.name).join(",")}`,
);

const requiredApproval = caps
  .filter((cap) => cap?.approval_policy?.desktop === "required")
  .map((cap) => cap.name);
assert(
  JSON.stringify(requiredApproval) === JSON.stringify(["community_memory_candidate_propose"]),
  `required approval tools mismatch: ${JSON.stringify(requiredApproval)}`
);
NODE

echo "[2/9] Desktop runtime must consume shared community contract..."
grep -q "community_harness_capabilities_v3.json" "$RUNTIME_FILE" \
  || { echo "FAIL: runtime is not loading shared community contract JSON"; exit 1; }
grep -q "COMMUNITY_HARNESS_TOOLS_CONTRACT" "$RUNTIME_FILE" \
  || { echo "FAIL: runtime community contract static cache missing"; exit 1; }
grep -q "make_community_tool_schema()" "$RUNTIME_FILE" \
  || { echo "FAIL: runtime community schema builder missing"; exit 1; }
grep -q "community_harness_desktop_runtime_tools()" "$RUNTIME_FILE" \
  || { echo "FAIL: runtime lane gate is not using community contract runtime list"; exit 1; }

echo "[3/9] Edge runtime must use matching contract id..."
grep -q 'COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID = "community_harness_capabilities_v3"' "$EDGE_FILE" \
  || { echo "FAIL: edge runtime community contract id mismatch"; exit 1; }

echo "[4/9] Cloud agent_turn must use canonical community retrieval orchestrator..."
grep -q "runCanonicalCommunitySearch" "$EDGE_FILE" \
  || { echo "FAIL: edge runtime is not using canonical community retrieval orchestrator"; exit 1; }
! grep -q "search_compiled_community_context" "$EDGE_FILE" \
  || { echo "FAIL: edge runtime should not call compiled context RPC directly"; exit 1; }
! grep -q "search_community_chat_snippets" "$EDGE_FILE" \
  || { echo "FAIL: edge runtime should not call community chat snippet RPC directly"; exit 1; }
! grep -q "search_community_resource_snippets" "$EDGE_FILE" \
  || { echo "FAIL: edge runtime should not call community resource snippet RPC directly"; exit 1; }
! grep -q "search_community_memory_items" "$EDGE_FILE" \
  || { echo "FAIL: edge runtime should not call community memory RPC directly"; exit 1; }

echo "[5/9] Cross-runtime runtime-surface parity checks..."
node scripts/community_harness_runtime_surface_parity_check.mjs

echo "[6/9] Cross-surface e2e matrix checks..."
bash scripts/community_harness_surface_e2e_matrix_check.sh

echo "[7/9] Community harness contract tests..."
(cd src-tauri && cargo test -q community_harness_contract_tests::)

echo "[8/9] Community contract fixture parity tests..."
(cd src-tauri && cargo test -q community_context_contract_fixture_tests::observability_and_capability_contract_ids_match_json_contracts)

echo "[9/9] Community research orchestrator regression checks..."
npx --yes tsx scripts/community_research_orchestrator_regression_check.mjs

echo "PASS: community harness contract regression checks passed."
