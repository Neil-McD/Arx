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

const packageJson = readText("package.json");
const projection = readText("shared/runtimeCodexPromptProjection.ts");
const bridge = readText("convex/polynetCodexWorkerBridge.ts");
const handler = readText("convex/runtimeTurnHandlers.ts");
const worker = readText("services/polynet-codex-worker/src/server.ts");
const toolEndpoint = readText("convex/polynetCodexWorkerTool.ts");

assertContains(
  packageJson,
  '"check:codex-worker-bridge-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts/codex_worker_bridge_contract_proof.ts"',
  "package script for Codex worker bridge contract proof",
);

assertContains(
  projection,
  "buildPlatformHarnessRuntimePromptBundle",
  "Codex prompt projection reuses the PolyNet platform harness prompt bundle",
);
assertContains(
  projection,
  "POLYNET_CODEX_RUNTIME_AUTHORITY",
  "Codex prompt projection declares PolyNet authority mapping",
);
assertContains(
  projection,
  "runtimePromptSectionIds",
  "Codex prompt projection returns section receipt metadata",
);

assertContains(
  bridge,
  'POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker"',
  "Codex worker bridge declares the canonical engine id",
);
assertContains(
  bridge,
  'POLYNET_CODEX_WORKER_CONTRACT_NAME = "polynet_codex_runtime_daytona_v1"',
  "Codex worker bridge declares the Daytona runtime contract name",
);
assertContains(
  bridge,
  'type PolynetCodexWorkerTransportProvider = "daytona_direct"',
  "Codex worker bridge declares Daytona-direct transport",
);
assertContains(
  bridge,
  "streamPolynetCodexWorkerTurn",
  "Codex worker bridge exposes the streaming turn boundary",
);
assertContains(
  bridge,
  "cancelPolynetCodexWorkerTurn",
  "Codex worker bridge exposes cancel steering boundary",
);
assertContains(
  bridge,
  "steerPolynetCodexWorkerTurn",
  "Codex worker bridge exposes user steering boundary",
);
assertContains(
  bridge,
  "target?.workerUrl",
  "Codex worker bridge resolves the Daytona target worker URL",
);
assertContains(
  bridge,
  'fetch(`${config.baseUrl}/v1/codex/turn?stream=1`',
  "Codex worker bridge streams worker turns over the Daytona target",
);
assertContains(
  bridge,
  "WORKER_BUSY_RETRY_DELAYS_MS",
  "Codex worker bridge retries transient worker_busy responses",
);
assertContains(
  bridge,
  "parseSseBlock",
  "Codex worker bridge parses worker SSE events",
);
assertContains(
  bridge,
  "onEvent",
  "Codex worker bridge forwards stream events to the runtime handler",
);
assertNotContains(
  bridge,
  "POLYNET_CODEX_WORKER_URL",
  "legacy static worker URL transport",
);
assertNotContains(
  bridge,
  "OPENAI_API_KEY",
  "OpenAI API key coupling in worker bridge",
);

assertContains(
  handler,
  "getFreshChatgptAuthForUser",
  "runtime handler uses ChatGPT auth for Codex worker turns",
);
assertContains(
  handler,
  "tryAcquirePolynetCodexWorkerLease",
  "runtime handler admits worker turns through capacity leases",
);
assertContains(
  handler,
  "mintPolynetCodexWorkerRunTokenSet",
  "runtime handler mints run-scoped callback tokens",
);
assertContains(
  handler,
  "buildRuntimeTurnEnvelope",
  "runtime handler stores the canonical turn authority envelope",
);
assertContains(
  handler,
  "allowedToolNames: codexHarnessPolicy.polynetPlatformToolNames",
  "runtime handler stores filtered PolyNet platform tools in the turn envelope",
);
assertContains(
  handler,
  "ensureDaytonaCodexRuntimeTargetInternal",
  "runtime handler resolves a Daytona target before streaming",
);
assertContains(
  handler,
  "streamPolynetCodexWorkerTurn({",
  "runtime handler streams through the Codex worker bridge",
);
assertContains(
  handler,
  "engineId: POLYNET_CODEX_WORKER_ENGINE_ID",
  "runtime handler persists Codex worker assistant messages with the Codex engine id",
);
assertContains(
  handler,
  "releaseDaytonaCodexRuntimeTargetInternal",
  "runtime handler releases Daytona target state after the turn",
);
assertContains(
  handler,
  "teardownAndRecordDaytonaCodexRuntimeTargetInternal",
  "runtime handler schedules provider teardown after the turn",
);
assertContains(
  handler,
  "releasePolynetCodexWorkerLeaseBestEffort",
  "runtime handler releases capacity leases on terminal finalization",
);
assertNotContains(
  handler,
  "startPolynetCodexWorkerRun({",
  "legacy one-shot worker bridge call",
);
assertNotContains(
  handler,
  'code: "codex_runtime_not_configured"',
  "old Codex runtime placeholder error",
);

assertContains(
  toolEndpoint,
  "readRunAllowedToolNames",
  "worker tool endpoint authorizes platform tools from the stored run envelope",
);
assertContains(
  toolEndpoint,
  "community_tool_not_authorized_for_run",
  "worker tool endpoint fails closed for tools not projected into the turn",
);
assertContains(
  worker,
  "buildCodexDynamicTools",
  "worker builds Codex dynamic tools",
);
assertContains(
  worker,
  'namespace: "polynet"',
  "worker projects PolyNet platform tools under the polynet namespace",
);

assertOrdered(
  handler,
  "tryAcquirePolynetCodexWorkerLease",
  "ensureDaytonaCodexRuntimeTargetInternal",
  "capacity admission happens before Daytona target execution",
);
assertOrdered(
  handler,
  "mintPolynetCodexWorkerRunTokenSet",
  "streamPolynetCodexWorkerTurn({",
  "run tokens are minted before worker stream starts",
);
assertOrdered(
  handler,
  "ensureDaytonaCodexRuntimeTargetInternal",
  "streamPolynetCodexWorkerTurn({",
  "Daytona target is ready before worker stream starts",
);

console.log("codex_worker_bridge_contract_proof: ok");
