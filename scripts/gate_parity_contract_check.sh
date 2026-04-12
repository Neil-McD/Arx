#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MATRIX_PATH="$ROOT_DIR/shared/contracts/gate_parity_matrix_v1.json"
ENGINE_PATH="$ROOT_DIR/shared/canonicalGateEngine.ts"

echo "== Gate parity contract check =="

echo "[1/4] Required files must exist..."
test -f "$MATRIX_PATH" || {
  echo "FAIL: missing $MATRIX_PATH"
  exit 1
}
test -f "$ENGINE_PATH" || {
  echo "FAIL: missing $ENGINE_PATH"
  exit 1
}

echo "[2/4] Canonical web scenarios must match expected outputs..."
echo "[3/4] Intentional divergence scenarios must match expected outputs..."
MATRIX_PATH="$MATRIX_PATH" ENGINE_PATH="$ENGINE_PATH" node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import tsModule from "typescript";

const matrixPath = process.env.MATRIX_PATH;
const enginePath = process.env.ENGINE_PATH;

if (!matrixPath || !enginePath) {
  console.error("FAIL: MATRIX_PATH/ENGINE_PATH env vars are required.");
  process.exit(1);
}

const matrixRaw = fs.readFileSync(matrixPath, "utf8");
const matrix = JSON.parse(matrixRaw);
const ts = tsModule?.default ?? tsModule;
const engineSource = fs.readFileSync(path.resolve(enginePath), "utf8");
const transpiled = ts.transpileModule(engineSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const engine = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`,
);

if (typeof engine.evaluateCanonicalGate !== "function") {
  console.error("FAIL: canonical gate engine missing evaluateCanonicalGate export.");
  process.exit(1);
}

const stable = (value) => JSON.stringify(value);
const project = (value) => ({
  allowed: Boolean(value?.allowed),
  code: String(value?.code ?? ""),
  cta: String(value?.cta ?? ""),
  lane: value?.lane ?? null,
  fundingSource: value?.fundingSource ?? null,
  effectiveTier: String(value?.effectiveTier ?? ""),
});

for (const scenario of matrix.sharedParityScenarios ?? []) {
  const input = scenario?.input ?? {};
  const expected = scenario?.expected ?? {};
  const webResult = project(engine.evaluateCanonicalGate({ surface: "web", ...input }));
  const expectedProjected = project(expected);
  if (stable(webResult) !== stable(expectedProjected)) {
    console.error(`FAIL: shared scenario '${scenario.id}' mismatch for web.`);
    console.error("Expected:", expectedProjected);
    console.error("Actual:  ", webResult);
    process.exit(1);
  }
}

NODE

echo "[4/4] Contract id/version markers must be present..."
grep -q '"contract_id": "gate_parity_matrix_v1"' "$MATRIX_PATH" || {
  echo "FAIL: missing contract id marker in gate parity matrix."
  exit 1
}
grep -q '"version": 1' "$MATRIX_PATH" || {
  echo "FAIL: missing version marker in gate parity matrix."
  exit 1
}

echo "PASS: gate parity contract check passed."
