import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const inspector = read("convex/workspaceInspector.ts");
const blaxelClient = read("convex/blaxelWorkspaceClient.ts");
const userDataPanel = read("apps/web/src/components/WebWorkspaceUserDataPanel.tsx");

assert.match(
  inspector,
  /function normalizeWorkspacePath\(raw: unknown\): string[\s\S]*candidate\.startsWith\("\/"\)[\s\S]*path_outside_workspace[\s\S]*part === "\.\."/,
  "workspace inspector must reject absolute paths and parent traversal before provider calls",
);
assert.match(
  inspector,
  /function normalizeInspectorPath\(raw: unknown\):[\s\S]*WorkspaceInspectorFailure[\s\S]*normalizeWorkspacePath\(candidate \|\| "\."\)/,
  "workspace inspector must normalize user paths into a fail-closed result",
);
assert.match(
  inspector,
  /async function listBlaxelInspectorDirectory\(params: \{/,
  "directory listing must use the Blaxel inspector path",
);
assert.match(
  inspector,
  /async function ensureBlaxelInspectorWorkspace\(params: \{[\s\S]*ensureBillableBlaxelWorkspaceComputer[\s\S]*reuseExistingLease: true/,
  "workspace inspector must ensure the canonical reusable billable Blaxel workspace lease",
);
assert.match(
  inspector,
  /isBlaxelWorkspaceSandboxTerminalState[\s\S]*inspectBlaxelWorkspaceComputer[\s\S]*isBlaxelWorkspaceSandboxTerminalState\(inspected\.state\)[\s\S]*clearBlaxelInspectorWorkspaceState/,
  "workspace inspector must clear terminal Blaxel sandbox pointers before waking the files computer",
);
assert.doesNotMatch(
  inspector,
  /const result = await params\.operation\(workspace\);[\s\S]{0,500}clearBlaxelInspectorWorkspaceState/,
  "workspace inspector must not clear an active billable lease merely because a post-wake file operation is retryable",
);
assert.match(
  inspector,
  /listBlaxelWorkspaceDirectory\(\{/,
  "directory listing must use the Blaxel directory API",
);
assert.match(
  inspector,
  /readBlaxelInspectorFilePreview\(params: \{[\s\S]*readBlaxelWorkspaceFile/,
  "file preview must read through the canonical Blaxel workspace computer",
);
assert.doesNotMatch(
  inspector,
  /resolveProjectBackgroundSandboxIfReady|run[A-Z][A-Za-z]+WorkspaceBash/,
  "workspace inspector must not retain old provider fallback paths",
);
assert.match(
  blaxelClient,
  /total volume size\|maximum allowed total size\|exceeds maximum allowed[\s\S]*code: "blaxel_volume_quota_exceeded"/,
  "Blaxel total-storage quota errors must not collapse into generic provider failures",
);
assert.match(
  userDataPanel,
  /result\.code === "blaxel_volume_quota_exceeded"[\s\S]*Workspace storage quota is full/,
  "Files panel must render Blaxel storage quota failures as actionable user-facing text",
);
assert.match(
  userDataPanel,
  /isWorkspaceInspectorWakeRetryableCode[\s\S]*blaxel_sandbox_not_found[\s\S]*blaxel_sandbox_not_ready[\s\S]*blaxel_workspace_recreate_failed/,
  "Files panel must classify only Blaxel wake states as auto-retryable",
);
assert.match(
  userDataPanel,
  /directoryAutoRetryCountRef[\s\S]*< 5[\s\S]*setDirectoryRefreshNonce/,
  "Files panel wake retry must be bounded and drive a canonical directory refresh",
);

console.log("workspace_inspector_boundary_proof: ok");
