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
const retirement = read("convex/projectResidueRetirement.ts");
const routes = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const webSource = readSourceCorpus("apps/web/src");
const mcp = read("convex/httpMcp.ts");

assert.doesNotMatch(runtimeCorpus, /workspaceRuntime|runtimeExecutionSession|workspaceTerminals|daytonaCodexRuntime|blaxelWorkspace|PROJECT_CONTEXT|projectContext|projectLabel|projectDescription/, "the native runtime must not depend on retired Workspace or project context");
for (const table of [
  "cloudProjects",
  "workspaceTerminalSessions",
  "workspaceDirectorySnapshots",
  "workspaceFilePreviewSnapshots",
  "polynetCodexWorkerCapacityLeases",
  "daytonaCodexRuntimeTargets",
]) {
  assert.match(
    schema,
    new RegExp(`${table}: defineTable\\(v\\.any\\(\\)\\)`),
    `${table} must be a Release-A compatibility tombstone only`,
  );
  assert.match(
    retirement,
    new RegExp(`"${table}"`),
    `${table} must be owned by the bounded retirement operator`,
  );
}
assert.match(retirement, /internalQuery\(\{/,
  "the retirement census must be internal-only");
assert.match(retirement, /internalMutation\(\{/,
  "the retirement writer must be internal-only");
assert.doesNotMatch(retirement, /\b(?:query|mutation|action)\(\{/,
  "the retirement operator must expose no public Convex function");
assert.match(retirement, /dryRun = args\.dryRun !== false/,
  "the retirement writer must default to dry-run");
assert.match(retirement, /project_residue_expected_documents_required/,
  "writes must be bound to the reviewed dry-run document IDs");
assert.match(retirement, /project_residue_dependency_blocked/,
  "cloud-project deletion must fail closed while dependencies remain");
assert.doesNotMatch(
  retirement,
  /workspaceComputeCharges|providerCostEntries|creditLedgerEntries/,
  "the retirement operator must not read or mutate accounting evidence",
);
assert.doesNotMatch(generatedApi, /projects:|blaxelWorkspace|providerResourcePointers|workspaceComputerProviderPolicy|previewProxySessionToken|workspaceTerminals|daytonaCodexRuntimeTarget/, "generated Convex APIs must not expose the retired Workspace substrate");
assert.doesNotMatch(webSource, /threads:(?:getCloudRuntimeRunComputerUseLiveSession|captureCloudRuntimeRunComputerUseScreenshot|getCloudRuntimeRunDaytonaPreviewSession|stopCloudRuntimeRunDaytonaPreview)/, "the browser must not call retired runtime actions");
assert.doesNotMatch(app, /WebWorkspaceSurfaceHost|useWebWorkspaceCoreController|activePage === "workspace"/, "App must not mount or own a general Workspace surface");
assert.doesNotMatch(routes, /page: "workspace"|buildWorkspaceThreadPath|buildWorkspaceDraftPath/, "routing must not produce a Workspace destination");
assert.match(mcp, /executePolynetCanonicalTool[\s\S]*POLYNET_CANONICAL_TOOL_NAMES/, "Workspace extinction must preserve the canonical external Polynet MCP");
assert.equal(existsSync("convex/communityCompilerDigest.ts"), true, "community compiler must remain");
assert.equal(existsSync("convex/communityResources.ts"), true, "community resources must remain");

console.log("workspace_surface_extinction_contract_proof: ok");
