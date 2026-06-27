import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CODEX_RUNTIME_ADAPTER_TOOL_NAMES,
  POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES,
  POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES,
  buildCodexHarnessToolPolicyReceipt,
  buildPolynetHarnessToolPolicyReceipt,
  resolveCodexHarnessToolPolicy,
  resolvePolynetHarnessToolPolicy,
} from "../shared/harnessToolPolicy.ts";
import {
  NON_SANDBOX_TOOL_NAMES,
  PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES,
  SANDBOX_FILE_SHELL_TOOL_NAMES,
  SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "../shared/retrievalTools.ts";
import {
  ACTIVE_WORKSPACE_RUNTIME_ENGINES,
  DEFAULT_ACTIVE_RUNTIME_ENGINE,
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  normalizeActiveWorkspaceRuntimeEngine,
} from "../shared/runtimeEngine.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const app = read("apps/web/src/App.tsx");
const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
const workspaceCoreController = read("apps/web/src/controllers/useWebWorkspaceCoreController.ts");
const workspaceRouteController = read("apps/web/src/controllers/useWebWorkspaceRouteController.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const runtimeEngine = read("shared/runtimeEngine.ts");
const webSendFlowCore = read("shared/webSendFlowCore.ts");
const webThreadMutationController = read("shared/useWebThreadMutationController.ts");
const threads = read("convex/threads.ts");
const codexWorkerBridge = read("convex/polynetCodexWorkerBridge.ts");
const harnessToolPolicy = read("shared/harnessToolPolicy.ts");

assert.match(
  packageJson,
  /"check:polynet-harness-isolation-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/polynet_harness_isolation_contract_proof\.ts"/,
  "package.json must expose the PolyNet harness isolation proof",
);
assert.match(
  app,
  /ACTIVE_RUNTIME_ENGINE_POLYNET_DEFAULT_RESTORE_KEY[\s\S]*shouldRestorePolynetDefault[\s\S]*RUNTIME_ENGINE_POLYNET/,
  "web startup must restore the workspace runtime default back to PolyNet after the Codex-only migration",
);
assert.match(
  app,
  /resetDraftRuntimeEngine[\s\S]*setActiveRuntimeEngine\(DEFAULT_ACTIVE_RUNTIME_ENGINE\)[\s\S]*resetDraftRuntimeEngine/,
  "fresh workspace drafts must reset the composer runtime to the shared default",
);
assert.match(
  workspaceCoreController,
  /resetDraftRuntimeEngine\?: \(\) => void[\s\S]*resetDraftRuntimeEngine: params\.resetDraftRuntimeEngine/,
  "workspace core must forward the draft-runtime reset callback to route actions",
);
assert.match(
  workspaceRouteController,
  /resetDraftRuntimeEngine\?: \(\) => void[\s\S]*openWorkspaceDraft[\s\S]*current\.resetDraftRuntimeEngine\?\.\(\)[\s\S]*handleNewWorkspaceThread[\s\S]*current\.resetDraftRuntimeEngine\?\.\(\)/,
  "workspace route actions must reset runtime on fresh draft/new-thread entry",
);
assert.match(
  app,
  /const normalized = normalizeActiveWorkspaceRuntimeEngine\(next\)/,
  "runtime engine state updates must normalize explicit PolyNet or Codex selections",
);
assert.match(
  app,
  /normalizeActiveWorkspaceRuntimeEngine\([\s\S]*runtime_engine[\s\S]*activeRuntimeEngine/,
  "thread runtime metadata must normalize through the active runtime allowlist",
);
assert.match(
  workspaceHost,
  /runtimeEngineLabels[\s\S]*polynet: "Polynet"[\s\S]*codex: "Codex"/,
  "the workspace composer must label both Polynet and Codex runtime options",
);
assert.match(
  workspaceHost,
  /RUNTIME_ENGINE_POLYNET/,
  "the workspace composer must render PolyNet as an active runtime option",
);
assert.deepEqual(
  [...ACTIVE_WORKSPACE_RUNTIME_ENGINES],
  [RUNTIME_ENGINE_POLYNET, RUNTIME_ENGINE_CODEX],
  "PolyNet and Codex must both be active selectable runtime harnesses",
);
assert.equal(
  DEFAULT_ACTIVE_RUNTIME_ENGINE,
  RUNTIME_ENGINE_POLYNET,
  "PolyNet must be the default active workspace runtime",
);
assert.equal(
  normalizeActiveWorkspaceRuntimeEngine(RUNTIME_ENGINE_POLYNET),
  RUNTIME_ENGINE_POLYNET,
  "PolyNet runtime selections must remain PolyNet",
);
assert.equal(
  normalizeActiveWorkspaceRuntimeEngine("unknown"),
  RUNTIME_ENGINE_POLYNET,
  "invalid runtime selections must fall back to PolyNet",
);
assert.match(
  runtimeEngine,
  /DEFAULT_ACTIVE_RUNTIME_ENGINE = RUNTIME_ENGINE_POLYNET[\s\S]*ACTIVE_WORKSPACE_RUNTIME_ENGINES = \[\s*RUNTIME_ENGINE_POLYNET,\s*RUNTIME_ENGINE_CODEX,\s*\]/,
  "shared runtime-engine state must default to PolyNet and expose Codex as the second selectable harness",
);
assert.match(
  webSendFlowCore,
  /resolvePreferredRuntimeEngineFromArgs[\s\S]*normalizeActiveWorkspaceRuntimeEngine\(threadEngine \?\? args\.activeRuntimeEngine\)/,
  "send flow must honor normalized thread or active runtime-engine selection",
);
assert.match(
  webThreadMutationController,
  /preferredRuntimeEngine = normalizeActiveWorkspaceRuntimeEngine[\s\S]*runtimeEngine: preferredRuntimeEngine/,
  "new thread creation must persist the active runtime engine, defaulting to PolyNet",
);
assert.match(
  threads,
  /normalizeOptionalRuntimeEngine[\s\S]*normalizeActiveWorkspaceRuntimeEngine\(engine\)/,
  "cloud thread writes must normalize explicit PolyNet or Codex runtime values",
);

assert.match(
  codexWorkerBridge,
  /requestedRuntimeEngine === RUNTIME_ENGINE_POLYNET[\s\S]*resolvedRuntimeEngine: RUNTIME_ENGINE_POLYNET[\s\S]*engineId: POLYNET_RUNTIME_ENGINE_ID[\s\S]*usePolynetCodexWorkerBridge: false/,
  "explicit PolyNet runtime requests must resolve through the PolyNet agent loop",
);
assert.match(
  codexWorkerBridge,
  /requestedRuntimeEngine === RUNTIME_ENGINE_CODEX[\s\S]*resolvedRuntimeEngine: RUNTIME_ENGINE_CODEX[\s\S]*engineId: POLYNET_CODEX_WORKER_ENGINE_ID[\s\S]*usePolynetCodexWorkerBridge: true/,
  "explicit Codex runtime requests must resolve through the Codex worker bridge",
);
assert.match(
  codexWorkerBridge,
  /requestedRuntimeEngine: null[\s\S]*resolvedRuntimeEngine: RUNTIME_ENGINE_POLYNET[\s\S]*engineId: POLYNET_RUNTIME_ENGINE_ID[\s\S]*usePolynetCodexWorkerBridge: false/,
  "missing runtime-engine requests must default to the PolyNet agent loop",
);

assert.deepEqual(
  [...POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES],
  [...PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES],
  "PolyNet must defer preview, terminal, and computer tools in the first shared-Daytona slice",
);
assert.deepEqual(
  [...POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES],
  [...SANDBOX_FILE_SHELL_TOOL_NAMES],
  "PolyNet must expose Daytona-backed filesystem and shell tools",
);

const mixedPolyNetPolicy = resolvePolynetHarnessToolPolicy({
  allowedToolNames: [
    "get_active_community_context",
    "community_resources_search",
    "web_research",
    ...SANDBOX_TOOL_NAMES,
  ] as RetrievalToolName[],
});
assert.deepEqual(
  mixedPolyNetPolicy.fixedRuntimeToolNames,
  [
    "get_active_community_context",
    "community_resources_search",
    "web_research",
    ...SANDBOX_FILE_SHELL_TOOL_NAMES,
  ],
  "PolyNet policy must keep community tools plus Daytona-backed filesystem and shell tools",
);
assert.deepEqual(
  mixedPolyNetPolicy.runtimeCapabilities.map((capability) => capability.name),
  ["workspace_files", "workspace_shell"],
  "PolyNet policy must advertise the shared Daytona workspace capabilities it exposes",
);
const mixedPolyNetReceipt = buildPolynetHarnessToolPolicyReceipt(mixedPolyNetPolicy);
assert.deepEqual(
  (mixedPolyNetReceipt["runtime_capabilities"] as Array<{ name: string }>).map(
    (capability) => capability.name,
  ),
  ["workspace_files", "workspace_shell"],
  "PolyNet policy receipts must include shared Daytona workspace capabilities",
);
for (const toolName of SANDBOX_FILE_SHELL_TOOL_NAMES) {
  assert.equal(
    mixedPolyNetPolicy.fixedRuntimeToolNames.includes(toolName),
    true,
    `${toolName} must remain available to PolyNet through the shared Daytona workspace substrate`,
  );
}
for (const toolName of PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES) {
  assert.equal(
    mixedPolyNetPolicy.fixedRuntimeToolNames.includes(toolName),
    false,
    `${toolName} must remain deferred from the first PolyNet Daytona workspace slice`,
  );
}

const codexPolicy = resolveCodexHarnessToolPolicy({
  polynetPlatformToolProjection: {
    hasCommunity: true,
    communityLensAuthority: null,
    communityResourceLane: null,
  },
  workspaceServeAvailable: true,
  computerAdaptersAvailable: true,
});
const codexCapabilityNames = (
  buildCodexHarnessToolPolicyReceipt(codexPolicy)[
    "runtime_capabilities"
  ] as Array<{ name: string }>
).map((capability) => capability.name);
assert.deepEqual(
  codexCapabilityNames,
  ["workspace_files", "workspace_shell", "app_preview", "computer_use"],
  "Codex must remain the coding harness with native workspace, shell, preview, and computer capabilities",
);
assert.deepEqual(
  codexPolicy.runtimeAdapterToolNames,
  [...CODEX_RUNTIME_ADAPTER_TOOL_NAMES],
  "Codex must keep the Daytona preview/computer adapter tools",
);

for (const toolName of NON_SANDBOX_TOOL_NAMES) {
  if (
    toolName === "get_active_community_context" ||
    toolName === "community_resources_search" ||
    toolName === "web_research"
  ) {
    assert.equal(
      mixedPolyNetPolicy.fixedRuntimeToolNames.includes(toolName),
      true,
      `${toolName} must remain available to PolyNet when granted upstream`,
    );
  }
}

assert.match(
  harnessToolPolicy,
  /POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES[\s\S]*PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES[\s\S]*POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES[\s\S]*SANDBOX_FILE_SHELL_TOOL_NAMES[\s\S]*resolvePolynetHarnessToolPolicy/,
  "shared harness policy must expose Daytona workspace tools while deferring preview/computer tools",
);
assert.match(
  handlers,
  /POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES[\s\S]*POLYNET_DEFERRED_RUNTIME_TOOL_NAMES[\s\S]*POLYNET_DAYTONA_WORKSPACE_TOOL_NAME_SET[\s\S]*function isolatePolynetHarnessToolNames/,
  "runtime handler must split shared Daytona workspace tools from deferred runtime tools",
);
assert.match(
  handlers,
  /polynetDaytonaWorkspaceEnabled[\s\S]*provider:[\s\S]*"daytona"[\s\S]*"polynet_daytona_workspace"[\s\S]*polynet_workspace_tools_suppressed[\s\S]*suppressed_tool_names/,
  "runtime handler must emit explicit PolyNet shared-Daytona substrate telemetry",
);
assert.match(
  handlers,
  /const activeDaytonaRuntimeSubstrateForPolynetTools =[\s\S]*polynetDaytonaWorkspaceEnabled \? normalizedDaytonaRuntimeSubstrate : null;/,
  "runtime handler must pass the Daytona substrate into PolyNet only when workspace tools are active",
);
assert.match(
  handlers,
  /allowedToolNames: polynetAllowedToolNamesForRun[\s\S]*activeDaytonaRuntimeSubstrate:\s*activeDaytonaRuntimeSubstrateForPolynetTools/,
  "PolyNet agent-loop calls must use the filtered tool list and shared Daytona substrate",
);
assert.doesNotMatch(
  handlers,
  /POLYNET_DAYTONA_POLYNET_PREVIEW_ENABLED|daytona_preview_available|includePolynetDaytonaPreviewToolNames|polynetDaytonaPreviewSubstrateEnabled|allowDaytonaPreviewStop/,
  "runtime handler must not retain the deleted PolyNet Daytona preview substrate path",
);

console.log("polynet_harness_isolation_contract_proof: ok");
