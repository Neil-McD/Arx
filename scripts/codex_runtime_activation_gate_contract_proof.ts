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

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const keys = [
    "POLYNET_CODEX_WORKER_RUNTIME_ENABLED",
    "POLYNET_DEPLOYMENT_KIND",
    "POLYNET_CODEX_WORKER_AUTH_TOKEN",
    "DAYTONA_API_KEY",
    "DAYTONA_JWT_TOKEN",
  ];
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function proveWorkerReadinessPredicate(): void {
  assert.equal(withEnv({}, () => isPolynetCodexWorkerBridgeConfigured()), false);
  assert.equal(
    withEnv(
      {
        POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      },
      () => isPolynetCodexWorkerBridgeConfigured(),
    ),
    false,
  );
  assert.equal(
    withEnv(
      {
        POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
        POLYNET_DEPLOYMENT_KIND: "development",
        POLYNET_CODEX_WORKER_AUTH_TOKEN: "service-token",
        DAYTONA_API_KEY: "daytona-token",
      },
      () => getPolynetCodexWorkerBridgeConfig().disabledReason,
    ),
    "polynet_codex_worker_deployment_kind_invalid",
  );
  assert.equal(
    withEnv(
      {
        POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
        POLYNET_DEPLOYMENT_KIND: "staging",
        DAYTONA_API_KEY: "daytona-token",
      },
      () => getPolynetCodexWorkerBridgeConfig().disabledReason,
    ),
    "polynet_codex_worker_auth_token_missing",
  );
  assert.equal(
    withEnv(
      {
        POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
        POLYNET_DEPLOYMENT_KIND: "staging",
        POLYNET_CODEX_WORKER_AUTH_TOKEN: "service-token",
      },
      () => getPolynetCodexWorkerBridgeConfig().disabledReason,
    ),
    "daytona_direct_credentials_missing",
  );
  assert.equal(
    withEnv(
      {
        POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
        POLYNET_DEPLOYMENT_KIND: "staging",
        POLYNET_CODEX_WORKER_AUTH_TOKEN: "service-token",
        DAYTONA_API_KEY: "daytona-token",
      },
      () => isPolynetCodexWorkerBridgeConfigured(),
    ),
    true,
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
