import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPolynetCodexWorkerBridgeConfig,
  isPolynetCodexWorkerBridgeConfigured,
} from "../convex/polynetCodexWorkerBridge.ts";

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function proveWorkerReadinessPredicate(): void {
  assert.equal(isPolynetCodexWorkerBridgeConfigured({}), false);
  assert.equal(
    isPolynetCodexWorkerBridgeConfigured({
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
    }),
    false,
  );
  assert.equal(
    isPolynetCodexWorkerBridgeConfigured({
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "http://worker.polynet.test/runtime",
    }),
    false,
  );
  assert.equal(
    isPolynetCodexWorkerBridgeConfigured({
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "https://worker.polynet.test/runtime",
    }),
    true,
  );
  assert.equal(
    getPolynetCodexWorkerBridgeConfig({
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "http://worker.polynet.test/runtime",
    }).disabledReason,
    "POLYNET_CODEX_WORKER_URL must be an https URL.",
  );
}

function proveRuntimeResolutionGate(): void {
  const resolution = readText("convex/runtimeTurnResolution.ts");
  assertContains(
    resolution,
    'import { isPolynetCodexWorkerBridgeConfigured } from "./polynetCodexWorkerBridge";',
    "runtime resolver imports worker readiness predicate",
  );
  assertContains(
    resolution,
    "codexWorkerBridgeConfigured: boolean;",
    "runtime resolution carries worker readiness state",
  );
  assertContains(
    resolution,
    "requested === RUNTIME_ENGINE_CODEX",
    "requested Codex runtime is explicitly checked",
  );
  assertContains(
    resolution,
    "!params.codexWorkerBridgeConfigured",
    "requested Codex runtime depends on worker readiness",
  );
  assertContains(
    resolution,
    "storedRuntimeEngine === RUNTIME_ENGINE_CODEX",
    "stored Codex runtime is explicitly checked",
  );
  assertContains(
    resolution,
    "runtimeEngine: RUNTIME_ENGINE_POLYNET",
    "unready Codex runtime falls back to PolyNet",
  );
  assertContains(
    resolution,
    'fallbackReason: "codex_worker_bridge_not_configured"',
    "fallback reason is stable and auditable",
  );
  assertContains(
    resolution,
    "const codexWorkerBridgeConfigured = isPolynetCodexWorkerBridgeConfigured();",
    "server runtime selection reads live worker readiness",
  );
  assertContains(
    resolution,
    'code: "unsupported_runtime_engine"',
    "invalid runtime engine names still fail closed",
  );
  assertContains(
    resolution,
    "runtimeEngineFallbackReason: runtimeEngineSelection.fallbackReason",
    "runtime resolution exposes fallback reason",
  );
}

function proveRuntimeHandlerEvidence(): void {
  const handler = readText("convex/runtimeTurnHandlers.ts");
  assertContains(
    handler,
    "runtimeEngineFallbackReason,",
    "runtime handler receives fallback reason",
  );
  assertContains(
    handler,
    "codexWorkerBridgeConfigured,",
    "runtime handler receives worker readiness state",
  );
  assertContains(
    handler,
    "runtime_engine_fallback_reason: runtimeEngineFallbackReason",
    "runtime context evidence includes fallback reason",
  );
  assertContains(
    handler,
    "codex_worker_bridge_configured: codexWorkerBridgeConfigured",
    "runtime context evidence includes worker readiness",
  );
}

function provePackageScript(): void {
  const packageJson = readText("package.json");
  assertContains(
    packageJson,
    '"check:codex-runtime-activation-gate-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts/codex_runtime_activation_gate_contract_proof.ts"',
    "package script for Codex runtime activation gate proof",
  );
}

proveWorkerReadinessPredicate();
proveRuntimeResolutionGate();
proveRuntimeHandlerEvidence();
provePackageScript();

console.log("codex_runtime_activation_gate_contract_proof: ok");
