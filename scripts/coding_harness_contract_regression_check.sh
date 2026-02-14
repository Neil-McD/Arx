#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONTRACT_FILE="shared/contracts/coding_harness_tools_v1.json"
RUNTIME_FILE="src-tauri/src/main.rs"

echo "== Coding harness contract regression checks =="

echo "[1/4] Contract file + core shape..."
if [ ! -f "$CONTRACT_FILE" ]; then
  echo "FAIL: missing $CONTRACT_FILE"
  exit 1
fi
node - <<'NODE'
const fs = require("node:fs");
const contractPath = "shared/contracts/coding_harness_tools_v1.json";
const raw = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(raw);
const expectedRuntimeTools = [
  "update_plan",
  "read",
  "list_dir",
  "glob",
  "grep",
  "sha256",
  "write",
  "edit",
  "bash",
];
const expectedCapabilityOrder = [
  "update_plan",
  "read",
  "list_dir",
  "sha256",
  "write",
  "edit",
  "glob",
  "grep",
  "bash",
];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(contract.id === "coding_harness_tools_v1", "contract id mismatch");
assert(contract.version === 1, "contract version mismatch");

const runtimeTools = contract.runtime_exposed_tools?.desktop ?? [];
assert(Array.isArray(runtimeTools), "runtime_exposed_tools.desktop missing");
assert(
  JSON.stringify(runtimeTools) === JSON.stringify(expectedRuntimeTools),
  `runtime_exposed_tools.desktop mismatch: ${JSON.stringify(runtimeTools)}`
);

const capabilities = Array.isArray(contract.capabilities) ? contract.capabilities : [];
const capabilityNames = capabilities.map((cap) => cap?.name).filter((name) => typeof name === "string");
assert(
  JSON.stringify(capabilityNames) === JSON.stringify(expectedCapabilityOrder),
  `capability order mismatch: ${JSON.stringify(capabilityNames)}`
);

const requiredApprovalNames = capabilities
  .filter((cap) => cap?.approval_policy?.desktop === "required")
  .map((cap) => cap.name);
assert(
  JSON.stringify(requiredApprovalNames) === JSON.stringify(["write", "edit", "bash"]),
  `required approval tools mismatch: ${JSON.stringify(requiredApprovalNames)}`
);

const promptVisibleNames = capabilities
  .filter((cap) => cap?.prompt_visible === true)
  .map((cap) => cap.name);
assert(
  !promptVisibleNames.includes("update_plan"),
  "update_plan must not be prompt_visible"
);
NODE

echo "[2/4] Runtime must consume shared coding contract..."
if ! grep -q "coding_harness_tools_v1.json" "$RUNTIME_FILE"; then
  echo "FAIL: runtime is not loading shared coding contract JSON"
  exit 1
fi
if ! grep -q "CODING_HARNESS_TOOLS_CONTRACT" "$RUNTIME_FILE"; then
  echo "FAIL: runtime coding contract static cache missing"
  exit 1
fi

echo "[3/4] Coding contract tests..."
(cd src-tauri && cargo test -q coding_harness_contract_tests::)

echo "[4/4] Lane tool contract tests..."
(cd src-tauri && cargo test -q lane_tool_contract_tests::)

echo "PASS: coding harness contract regression checks passed."
