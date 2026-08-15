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
  "convex/projects.ts",
  "convex/blaxelWorkspaceClient.ts",
  "convex/blaxelWorkspaceComputerProvider.ts",
  "convex/blaxelWorkspaceDiagnostics.ts",
  "convex/blaxelWorkspaceProjectNames.ts",
  "convex/blaxelWorkspaceResourceInventory.ts",
  "convex/blaxelWorkspaceVolumeQuota.ts",
  "convex/blaxelWorkspaceWake.ts",
  "convex/providerResourcePointers.ts",
  "convex/workspaceComputerProviderPolicy.ts",
  "convex/previewProxySessionToken.ts",
  "convex/runtimeExecutionSession.ts",
  "convex/runtimeWorkspaceSessionDisposal.ts",
  "convex/workspaceRuntimeSession.ts",
  "convex/workspaceRuntimeTools.ts",
  "convex/workspaceRuntimeWindowSignal.ts",
  "convex/workspaceInspector.ts",
  "convex/workspaceTerminals.ts",
  "convex/workspaceTerminalProcessCore.ts",
  "convex/daytonaCodexRuntimeTargetActions.ts",
  "convex/daytonaCodexRuntimeTargets.ts",
  "shared/projectContext.ts",
  "shared/workspaceComputerProvider.ts",
  "shared/workspaceProjectResources.ts",
  "shared/workspaceResourceAdmission.ts",
  "shared/workspacePreviewPort.ts",
  "apps/web/src/lib/workspacePreviewProxy.ts",
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

for (const toolName of [
  "list_dir", "read", "glob", "grep", "sha256", "write", "edit", "bash",
  "terminal_start", "terminal_read", "terminal_write", "terminal_stop",
  "computer_open_url", "computer_screenshot", "computer_click", "computer_type",
  "computer_keypress", "computer_scroll", "computer_stop",
]) {
  assert.ok(!RETRIEVAL_TOOL_NAMES.includes(toolName as never), `${toolName} must not be model-callable`);
}

const runtimeCorpus = [
  read("convex/runtimeAgentLoop.ts"),
  read("convex/runtimeTurnContext.ts"),
  read("convex/runtimeTurnHandlers.ts"),
  read("convex/runtimeTurnResolution.ts"),
  read("shared/runtimeTurnContextPacket.ts"),
  read("shared/runtimeContextFragments.ts"),
  read("shared/runtimePrompt.ts"),
  read("shared/runtimeTurnEnvelope.ts"),
  read("shared/runtimeContextManifest.ts"),
].join("\n");
const generatedApi = read("convex/_generated/api.d.ts");
const schema = read("convex/schema.ts");
const routes = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const webSource = readSourceCorpus("apps/web/src");
const mcp = read("convex/httpMcp.ts");

assert.doesNotMatch(runtimeCorpus, /workspaceRuntime|runtimeExecutionSession|workspaceTerminals|daytonaCodexRuntime|blaxelWorkspace|PROJECT_CONTEXT|projectContext|projectLabel|projectDescription/, "the native runtime must not depend on retired Workspace or project context");
assert.doesNotMatch(schema, /cloudProjects: defineTable|workspaceTerminalSessions: defineTable|workspaceDirectorySnapshots: defineTable|workspaceFilePreviewSnapshots: defineTable/, "the schema must not define retired Workspace project, terminal, directory, or preview tables");
assert.doesNotMatch(generatedApi, /projects:|blaxelWorkspace|providerResourcePointers|workspaceComputerProviderPolicy|previewProxySessionToken|workspaceTerminals|daytonaCodexRuntimeTarget/, "generated Convex APIs must not expose the retired Workspace substrate");
assert.doesNotMatch(webSource, /threads:(?:getCloudRuntimeRunComputerUseLiveSession|captureCloudRuntimeRunComputerUseScreenshot|getCloudRuntimeRunDaytonaPreviewSession|stopCloudRuntimeRunDaytonaPreview)/, "the browser must not call retired runtime actions");
assert.doesNotMatch(app, /WebWorkspaceSurfaceHost|useWebWorkspaceCoreController|activePage === "workspace"/, "App must not mount or own a general Workspace surface");
assert.doesNotMatch(routes, /page: "workspace"|buildWorkspaceThreadPath|buildWorkspaceDraftPath/, "routing must not produce a Workspace destination");
assert.match(mcp, /executePolynetCanonicalTool[\s\S]*POLYNET_CANONICAL_TOOL_NAMES/, "Workspace extinction must preserve the canonical external Polynet MCP");
assert.equal(existsSync("convex/communityCompilerDigest.ts"), true, "community compiler must remain");
assert.equal(existsSync("convex/communityResources.ts"), true, "community resources must remain");

console.log("workspace_surface_extinction_contract_proof: ok");

