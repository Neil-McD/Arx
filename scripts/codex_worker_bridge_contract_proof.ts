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
  "startPolynetCodexWorkerRun",
  "Codex worker bridge exposes a start boundary",
);
assertContains(
  bridge,
  "buildRuntimeCodexPromptProjection",
  "Codex worker bridge builds prompt projection",
);
assertContains(
  bridge,
  'code: "codex_worker_unavailable"',
  "Codex worker bridge has a configured-unavailable failure",
);
assertContains(
  bridge,
  'code: "codex_worker_transport_failed"',
  "Codex worker bridge has a structured transport failure",
);
assertContains(
  bridge,
  'code: "codex_worker_invalid_response"',
  "Codex worker bridge rejects invalid worker responses",
);
assertContains(
  bridge,
  "POLYNET_CODEX_WORKER_URL",
  "Codex worker bridge requires a configured worker URL",
);
assertContains(
  bridge,
  "must be an https URL",
  "Codex worker bridge requires HTTPS worker URLs",
);
assertContains(
  bridge,
  "POLYNET_CODEX_WORKER_TIMEOUT_MS",
  "Codex worker bridge has a configurable bounded timeout",
);
assertContains(
  bridge,
  "new AbortController()",
  "Codex worker bridge uses AbortController for bounded transport",
);
assertContains(
  bridge,
  "await fetchFn(config.url",
  "Codex worker bridge performs a feature-gated worker POST",
);
assertContains(
  bridge,
  'eventType: "codex_worker_transport_started"',
  "Codex worker bridge emits transport-started evidence",
);
assertContains(
  bridge,
  'eventType: result.ok',
  "Codex worker bridge emits finished or failed transport evidence",
);
assertContains(
  bridge,
  '"x-polynet-worker-contract"',
  "Codex worker bridge sends worker contract header",
);
assertContains(
  bridge,
  "developer_instructions",
  "Codex worker transport payload carries developer instructions",
);
assertContains(
  bridge,
  "max_tokens",
  "Codex worker transport payload carries the bounded output token budget",
);
assertContains(
  bridge,
  "polynet_platform_tool_names",
  "Codex worker transport payload carries filtered PolyNet platform tools",
);
assertNotContains(bridge, "Daytona", "Daytona substrate coupling in bridge slice");
assertNotContains(bridge, "daytona", "Daytona env coupling in bridge slice");
assertNotContains(bridge, "OPENAI_API_KEY", "OpenAI API key coupling in worker bridge");
assertNotContains(
  bridge,
  "polynetCodexWorkerAdmission",
  "capacity admission import in bridge slice",
);
assertNotContains(
  bridge,
  "polynetCodexWorkerRunToken",
  "run token import in bridge slice",
);
assertNotContains(
  bridge,
  "polynetCodexWorkerTerminal",
  "terminal bridge import in bridge slice",
);
assertNotContains(
  bridge,
  "polynetCodexWorkerTool",
  "tool bridge import in bridge slice",
);

assertContains(
  handler,
  "POLYNET_CODEX_WORKER_ENGINE_ID",
  "runtime handler imports Codex worker engine id",
);
assertContains(
  handler,
  "const runtimeEngineId =",
  "runtime handler derives runtime engine id before run start",
);
assertContains(
  handler,
  "engineId: runtimeEngineId",
  "runtime run start uses derived runtime engine id",
);
assertContains(
  handler,
  "contractName: runtimeContractName",
  "runtime run start uses derived contract name",
);
assertContains(
  handler,
  "startPolynetCodexWorkerRun({",
  "runtime handler calls the Codex worker bridge",
);
assertContains(
  handler,
  "appendRunEvent,",
  "runtime handler passes run-event persistence into the Codex worker bridge",
);
assertContains(
  handler,
  "resolveCodexHarnessToolPolicy({",
  "runtime handler resolves Codex harness policy before bridge start",
);
assertContains(
  handler,
  "buildCodexHarnessToolPolicyReceipt(codexHarnessPolicy)",
  "runtime handler emits Codex harness policy receipt",
);
assertContains(
  handler,
  'eventType: "codex_harness_policy_resolved"',
  "runtime handler emits Codex harness policy evidence",
);
assertContains(
  handler,
  "normalizeRuntimeSkillResolution(",
  "runtime handler normalizes runtime skill resolution for Codex resource lane",
);
assertContains(
  handler,
  "internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal",
  "runtime handler reuses runtime skill resolver for Codex resource lane",
);
assertContains(
  handler,
  "communityResourceLane: codexCommunityResourceLane",
  "Codex prompt projection receives the resolved community resource lane",
);
assertContains(
  handler,
  "allowedToolNames: codexHarnessPolicy.polynetPlatformToolNames",
  "Codex prompt projection receives filtered PolyNet platform tools",
);
assertContains(
  handler,
  'eventType: "codex_worker_bridge_unavailable"',
  "runtime handler emits bridge-unavailable evidence",
);
assertContains(
  handler,
  "prompt_projection_receipt",
  "runtime handler stores prompt projection receipt without raw prompt text",
);
assertNotContains(
  handler,
  'code: "codex_runtime_not_configured"',
  "old Codex runtime placeholder error after bridge slice",
);
assertNotContains(
  handler,
  "communityResourceLane: null",
  "Codex bridge prompt projection should not drop the community resource lane",
);
assertOrdered(
  handler,
  "if (runtimeEngine === RUNTIME_ENGINE_CODEX)",
  "resolveCodexHarnessToolPolicy({",
  "Codex harness policy resolves inside Codex branch",
);
assertOrdered(
  handler,
  "resolveCodexHarnessToolPolicy({",
  "executeChatToolsAgentLoop({",
  "Codex harness policy resolves before any PolyNet agent-loop execution",
);
assertOrdered(
  handler,
  'eventType: "codex_harness_policy_resolved"',
  "startPolynetCodexWorkerRun({",
  "Codex harness policy evidence is emitted before bridge start",
);
assertOrdered(
  handler,
  "startPolynetCodexWorkerRun({",
  "if (!codexBridgeResult.ok)",
  "Codex bridge result is handled after bridge start",
);

console.log("codex_worker_bridge_contract_proof: ok");
