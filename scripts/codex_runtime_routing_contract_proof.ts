import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function assertOrdered(
  haystack: string,
  first: string,
  second: string,
  label: string,
): void {
  const firstIndex = haystack.indexOf(first);
  const secondIndex = haystack.indexOf(second);
  assert.notEqual(firstIndex, -1, `expected ${label} first marker`);
  assert.notEqual(secondIndex, -1, `expected ${label} second marker`);
  assert.ok(firstIndex < secondIndex, `expected ${label}`);
}

const webRunner = readText("shared/useWebTurnRunnerController.ts");
const resolution = readText("convex/runtimeTurnResolution.ts");
const handler = readText("convex/runtimeTurnHandlers.ts");
const state = readText("convex/httpRuntimeTurnState.ts");
const threads = readText("convex/threads.ts");
const schema = readText("convex/schema.ts");
const packageJson = readText("package.json");

assertContains(
  packageJson,
  '"check:codex-runtime-routing-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts/codex_runtime_routing_contract_proof.ts"',
  "package script for Codex runtime routing contract proof",
);

assertContains(
  webRunner,
  '...(params.runtimeEngine ? { runtime_engine: params.runtimeEngine } : null)',
  "web runtime turn payload carries runtime_engine",
);

assertContains(
  resolution,
  "runtime_engine?: string | null;",
  "runtime turn input accepts runtime_engine",
);
assertContains(
  resolution,
  "function resolveRuntimeEngineSelection",
  "runtime turn resolution normalizes runtime engine",
);
assertContains(
  resolution,
  "runtimeEngine: storedRuntimeEngine ?? RUNTIME_ENGINE_POLYNET",
  "runtime turn resolution preserves legacy PolyNet default when no runtime engine is requested or stored",
);
assertContains(
  resolution,
  'code: "unsupported_runtime_engine"',
  "unsupported runtime engines fail closed",
);
assertContains(
  resolution,
  "runtimeEngine: runtimeEngineSelection.runtimeEngine",
  "resolved runtime engine reaches runtime turn resolution",
);

assertContains(
  schema,
  'runtimeEngine: v.optional(v.union(v.literal("polynet"), v.literal("codex")))',
  "runtimeRuns schema stores runtimeEngine",
);
assertContains(
  threads,
  'runtimeEngine: v.optional(v.union(v.literal("polynet"), v.literal("codex")))',
  "ensureCloudRuntimeRunStarted accepts runtimeEngine",
);
assertContains(
  threads,
  "const runtimeEngine = normalizeOptionalRuntimeEngine(args.runtimeEngine);",
  "runtime run start normalizes runtimeEngine",
);
assertContains(
  threads,
  "runtimeEngine,",
  "runtime run row persists runtimeEngine",
);
assertContains(
  threads,
  "runtime_engine: runtimeEngine ?? null",
  "run_started event emits runtime_engine",
);

assertContains(
  handler,
  "runtimeEngine,",
  "runtime handler destructures resolved runtime engine",
);
assertContains(
  handler,
  "runtimeEngine,",
  "runtime handler passes runtime engine into run start args",
);
assertContains(
  handler,
  "runtime_engine: runtimeEngine",
  "runtime handler emits runtime_engine in evidence and responses",
);
assertContains(
  handler,
  "if (runtimeEngine === RUNTIME_ENGINE_CODEX)",
  "Codex runtime branch exists",
);
assertContains(
  handler,
  'eventType: "codex_runtime_route_selected"',
  "Codex routing branch emits route-selected evidence",
);
assertContains(
  handler,
  "startPolynetCodexWorkerRun({",
  "Codex routing branch calls the worker bridge boundary",
);
assertContains(
  handler,
  'eventType: "codex_harness_policy_resolved"',
  "Codex routing branch emits projected harness policy evidence",
);
assertContains(
  handler,
  "allowedToolNames: codexHarnessPolicy.polynetPlatformToolNames",
  "Codex routing branch passes filtered PolyNet platform tools to the worker bridge",
);
assertContains(
  handler,
  "communityResourceLane: codexCommunityResourceLane",
  "Codex routing branch preserves community resource lane for prompt projection",
);
assertContains(
  handler,
  'eventType: "codex_worker_bridge_unavailable"',
  "Codex routing branch fails closed through bridge-unavailable evidence until transport is attached",
);
assertOrdered(
  handler,
  "if (runtimeEngine === RUNTIME_ENGINE_CODEX)",
  "if (runtimeExecutionMode === \"agentic\")",
  "Codex runtime guard should happen before PolyNet agentic routing",
);
assertOrdered(
  handler,
  "if (runtimeEngine === RUNTIME_ENGINE_CODEX)",
  "executeChatToolsAgentLoop({",
  "Codex runtime guard should happen before PolyNet agent loop execution",
);
assertNotContains(
  handler,
  'code: "codex_runtime_not_configured"',
  "old Codex runtime placeholder error after bridge slice",
);

assertContains(
  state,
  "runtimeEngine: RuntimeEngine;",
  "success responder receives runtimeEngine",
);
assertContains(
  state,
  "runtime_engine: params.runtimeEngine",
  "success responder emits runtime_engine",
);

console.log("codex_runtime_routing_contract_proof: ok");
