import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPolynetCodexWorkerBridgeConfig,
  isPolynetCodexWorkerBridgeConfigured,
} from "../convex/polynetCodexWorkerBridge.ts";
import { resolveRuntimeActivationForTurn } from "../shared/runtimeActivation.ts";

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function assertNotContains(haystack: string, needle: string, label: string): void {
  assert.ok(!haystack.includes(needle), `did not expect ${label}`);
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

function proveRuntimeActivationClassifier(): void {
  assert.deepEqual(resolveRuntimeActivationForTurn({ latestUserText: "Yo, yo." }), {
    requestedAgenticTools: false,
    useWorkspaceRuntime: false,
    reason: "simple_chat",
  });
  assert.equal(
    resolveRuntimeActivationForTurn({
      latestUserText: "build a mental model of this community",
    }).useWorkspaceRuntime,
    false,
  );
  assert.deepEqual(
    resolveRuntimeActivationForTurn({
      latestUserText: "research OpenAI current status",
    }),
    {
      requestedAgenticTools: true,
      useWorkspaceRuntime: false,
      reason: "knowledge_tool_intent",
    },
  );
  assert.deepEqual(
    resolveRuntimeActivationForTurn({
      latestUserText: "create a tiny HTML app and run it",
    }),
    {
      requestedAgenticTools: true,
      useWorkspaceRuntime: true,
      reason: "workspace_runtime_intent",
    },
  );
  assert.deepEqual(
    resolveRuntimeActivationForTurn({
      latestUserText: "go",
      recentConversationText: [
        "Can you create a tiny app and run the preview?",
        "go",
      ],
    }),
    {
      requestedAgenticTools: true,
      useWorkspaceRuntime: true,
      reason: "workspace_runtime_continuation",
    },
  );
}

function proveRuntimeResolutionGate(): void {
  const resolution = readText("convex/runtimeTurnResolution.ts");
  assertContains(
    resolution,
    'import { resolveRuntimeActivationForTurn } from "../shared/runtimeActivation";',
    "runtime resolver imports runtime activation classifier",
  );
  assertContains(
    resolution,
    "runtimeActivation.reason",
    "runtime resolution carries activation reason",
  );
  assertContains(
    resolution,
    "workspaceRuntimeRequired: runtimeActivation.useWorkspaceRuntime",
    "runtime resolution carries workspace runtime requirement",
  );
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
    "!params.workspaceRuntimeRequired",
    "requested Codex runtime depends on workspace activation",
  );
  assertContains(
    resolution,
    'fallbackReason: "codex_workspace_runtime_not_required"',
    "non-workspace turns fall back from Codex to PolyNet",
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
  assertContains(
    resolution,
    "effectiveRequestedAgenticTools",
    "runtime execution mode uses the effective activation decision",
  );
  assertContains(
    resolution,
    "const effectiveRequestedAgenticTools = runtimeActivation.requestedAgenticTools;",
    "server activation classifier is authoritative for agentic mode",
  );
  assertNotContains(
    resolution,
    "requestedAgenticToolsFromInput ||",
    "client agentic flag must not force agentic mode for simple chat",
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
    "runtime_activation_reason: runtimeActivationReason",
    "runtime context evidence includes activation reason",
  );
  assertContains(
    handler,
    "workspace_runtime_required: workspaceRuntimeRequired",
    "runtime context evidence includes workspace runtime requirement",
  );
  assertContains(
    handler,
    "codex_worker_bridge_configured: codexWorkerBridgeConfigured",
    "runtime context evidence includes worker readiness",
  );
}

function proveClientRuntimeActivation(): void {
  const sendFlow = readText("shared/useWebSendFlowController.ts");
  assertContains(
    sendFlow,
    'import { resolveRuntimeActivationForTurn } from "./runtimeActivation";',
    "web send flow imports runtime activation classifier",
  );
  assertContains(
    sendFlow,
    "resolveRuntimeEngineForTurn",
    "web send flow resolves per-turn runtime engine",
  );
  assertContains(
    sendFlow,
    "RUNTIME_ENGINE_POLYNET",
    "web send flow can explicitly demote chat turns to PolyNet",
  );
  assertContains(
    sendFlow,
    "useWorkspaceRuntime: runtimeFlags.useWorkspaceRuntime",
    "web send flow uses activation decision for runtime engine",
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
proveRuntimeActivationClassifier();
proveRuntimeResolutionGate();
proveRuntimeHandlerEvidence();
proveClientRuntimeActivation();
provePackageScript();

console.log("codex_runtime_activation_gate_contract_proof: ok");
