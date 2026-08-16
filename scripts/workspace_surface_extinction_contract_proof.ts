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
  "convex/projectResidueRetirement.ts",
  "convex/projectResidueRetirement.test.ts",
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
const runtimeContract = read("docs/native-agent-runtime-context-contract-v1.md");
const releaseWorkflow = read("docs/alpha-release-workflow.md");

assert.doesNotMatch(runtimeCorpus, /workspaceRuntime|runtimeExecutionSession|workspaceTerminals|daytonaCodexRuntime|blaxelWorkspace|PROJECT_CONTEXT|projectContext|projectLabel|projectDescription/, "the native runtime must not depend on retired Workspace or project context");
for (const table of [
  "cloudProjects",
  "workspaceTerminalSessions",
  "workspaceDirectorySnapshots",
  "workspaceFilePreviewSnapshots",
  "polynetCodexWorkerCapacityLeases",
  "daytonaCodexRuntimeTargets",
]) {
  assert.doesNotMatch(schema, new RegExp(`\\b${table}:`), `${table} must be absent after Release B`);
}
assert.doesNotMatch(generatedApi, /projectResidueRetirement/, "generated Convex APIs must not retain the temporary retirement operator");
for (const field of [
  "sandboxMode",
  "workspaceSessionState",
  "workspaceProviderSandboxId",
  "workspaceToolboxProxyUrl",
  "workspaceSessionRegion",
  "workspaceSessionUpdatedAt",
]) {
  assert.doesNotMatch(schema, new RegExp(`\\b${field}:`), `${field} must be absent after Release B`);
}
const diagnosticSchema = schema.match(/platformDiagnosticEvents: defineTable\([\s\S]*?checkoutSessions: defineTable/)?.[0] ?? "";
const threadSchema = schema.match(/threads: defineTable\([\s\S]*?runtimeRuns: defineTable/)?.[0] ?? "";
const runtimeRunSchema = schema.match(/runtimeRuns: defineTable\([\s\S]*?runtimeRunEvents: defineTable/)?.[0] ?? "";
assert.doesNotMatch(diagnosticSchema, /\bprojectId:|by_projectId/, "diagnostic project compatibility must be absent");
assert.doesNotMatch(threadSchema, /\bprojectId:|v\.literal\("codex"\)/, "thread project and Codex compatibility must be absent");
assert.doesNotMatch(threadSchema, /\bruntimeEngine\b|\bruntime_engine\b/, "thread runtime compatibility marker must be absent");
assert.doesNotMatch(runtimeRunSchema, /\bprojectId:|\bruntimeEngine:/, "runtime-run project compatibility must be absent");
for (const releaseContract of [runtimeContract, releaseWorkflow]) {
  assert.match(
    releaseContract,
    /zero\s+Polynet-owned sandboxes and volumes/,
    "provider cleanup must be scoped to Polynet-owned resources",
  );
  assert.match(
    releaseContract,
    /not owned by\s+Polynet are out of scope and must never be deleted/,
    "shared provider resources must be protected explicitly",
  );
}
assert.doesNotMatch(generatedApi, /projects:|blaxelWorkspace|providerResourcePointers|workspaceComputerProviderPolicy|previewProxySessionToken|workspaceTerminals|daytonaCodexRuntimeTarget|projectResidueRetirement/, "generated Convex APIs must not expose the retired Workspace substrate");
assert.doesNotMatch(webSource, /threads:(?:getCloudRuntimeRunComputerUseLiveSession|captureCloudRuntimeRunComputerUseScreenshot|getCloudRuntimeRunDaytonaPreviewSession|stopCloudRuntimeRunDaytonaPreview)/, "the browser must not call retired runtime actions");
assert.doesNotMatch(app, /WebWorkspaceSurfaceHost|useWebWorkspaceCoreController|activePage === "workspace"/, "App must not mount or own a general Workspace surface");
assert.doesNotMatch(routes, /page: "workspace"|buildWorkspaceThreadPath|buildWorkspaceDraftPath/, "routing must not produce a Workspace destination");
assert.match(mcp, /executePolynetCanonicalTool[\s\S]*POLYNET_CANONICAL_TOOL_NAMES/, "Workspace extinction must preserve the canonical external Polynet MCP");
assert.equal(existsSync("convex/communityCompilerDigest.ts"), true, "community compiler must remain");
assert.equal(existsSync("convex/communityResources.ts"), true, "community resources must remain");

console.log("workspace_surface_extinction_contract_proof: ok");
