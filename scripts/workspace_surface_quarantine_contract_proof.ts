import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { RETRIEVAL_TOOL_NAMES } from "../shared/retrievalTools.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readSourceCorpus(path: string): string {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) return [readSourceCorpus(child)];
      return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [read(child)] : [];
    })
    .join("\n");
}

const retiredFiles = [
  "convex/runtimeExecutionSession.ts",
  "convex/runtimeWorkspaceSessionDisposal.ts",
  "convex/workspaceRuntimeSession.ts",
  "convex/workspaceRuntimeTools.ts",
  "convex/workspaceRuntimeWindowSignal.ts",
  "convex/workspaceInspector.ts",
  "convex/workspaceTerminals.ts",
  "convex/workspaceTerminalProcessCore.ts",
  "convex/blaxelWorkspaceSandboxSmoke.ts",
  "convex/blaxelWorkspaceVolumeSmoke.ts",
  "convex/daytonaCodexRuntimeTargetActions.ts",
  "convex/daytonaCodexRuntimeTargets.ts",
  "apps/web/src/components/DaytonaRuntimeAppPreview.tsx",
  "apps/web/src/components/RuntimeComputerUseViewer.tsx",
  "shared/runtimeComputerUseViewerUi.ts",
  "shared/runtimePreviewDiagnostics.ts",
  "shared/daytonaRuntimePolicy.ts",
  "shared/shellCommandPolicy.ts",
];
for (const path of retiredFiles) {
  assert.equal(existsSync(path), false, `${path} must remain deleted`);
}

const retiredTools = [
  "list_dir",
  "read",
  "glob",
  "grep",
  "sha256",
  "write",
  "edit",
  "bash",
  "terminal_start",
  "terminal_read",
  "terminal_write",
  "terminal_stop",
  "computer_open_url",
  "computer_screenshot",
  "computer_click",
  "computer_type",
  "computer_keypress",
  "computer_scroll",
  "computer_stop",
];
for (const toolName of retiredTools) {
  assert.ok(
    !RETRIEVAL_TOOL_NAMES.includes(toolName as never),
    `${toolName} must not be model-callable`,
  );
}

const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnContext = read("convex/runtimeTurnContext.ts");
const runtimeContextPacket = read("shared/runtimeTurnContextPacket.ts");
const runtimeContextFragments = read("shared/runtimeContextFragments.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const harnessPolicy = read("shared/harnessToolPolicy.ts");
const toolRegistry = read("shared/toolRegistry.ts");
const generatedApi = read("convex/_generated/api.d.ts");
const routes = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const webSource = readSourceCorpus("apps/web/src");
const mcp = read("convex/httpMcp.ts");

for (const [label, source] of [
  ["runtime agent loop", runtimeAgentLoop],
  ["turn context loader", runtimeTurnContext],
  ["turn context packet", runtimeContextPacket],
  ["context fragments", runtimeContextFragments],
  ["runtime prompt", runtimePrompt],
  ["harness policy", harnessPolicy],
  ["tool registry", toolRegistry],
] as const) {
  assert.doesNotMatch(
    source,
    /workspaceRuntime|runtimeExecutionSession|workspaceTerminals|daytonaCodexRuntime|activeBackgroundTerminals|recentBackgroundProcessEvents|RuntimeWorkspaceTerminalPrompt/,
    `${label} must not depend on the retired Workspace runtime`,
  );
}

assert.doesNotMatch(
  generatedApi,
  /workspaceTerminals|getCloudRuntimeRunComputerUseLiveSession|captureCloudRuntimeRunComputerUseScreenshot|getCloudRuntimeRunDaytonaPreviewSession|stopCloudRuntimeRunDaytonaPreview|daytonaCodexRuntimeTarget|blaxelWorkspaceSandboxSmoke|blaxelWorkspaceVolumeSmoke|smokeBlaxelConvexSandbox|smokeBlaxelConvexVolume/,
  "generated Convex APIs must not expose the retired execution substrate",
);
assert.doesNotMatch(
  webSource,
  /threads:(?:getCloudRuntimeRunComputerUseLiveSession|captureCloudRuntimeRunComputerUseScreenshot|getCloudRuntimeRunDaytonaPreviewSession|stopCloudRuntimeRunDaytonaPreview)/,
  "the browser must not call retired runtime actions",
);
assert.doesNotMatch(
  app,
  /WebWorkspaceSurfaceHost|useWebWorkspaceCoreController|activePage === "workspace"/,
  "App must not mount or own a general Workspace surface",
);
assert.doesNotMatch(
  routes,
  /page: "workspace"|buildWorkspaceThreadPath|buildWorkspaceDraftPath/,
  "routing must not produce a Workspace destination",
);

const providerPointers = read("convex/providerResourcePointers.ts");
assert.match(providerPointers, /Migration-only pointer ownership/);
assert.doesNotMatch(
  providerPointers,
  /executeBlaxelWorkspaceCommand|ensureBillableBlaxelWorkspaceComputer|create.*Sandbox|start.*Sandbox/i,
  "migration pointer ownership must never allocate or execute provider resources",
);
assert.match(
  mcp,
  /executePolynetCanonicalTool[\s\S]*POLYNET_CANONICAL_TOOL_NAMES/,
  "runtime extinction must preserve the canonical external Polynet MCP",
);

console.log("workspace_surface_quarantine_contract_proof: ok");
