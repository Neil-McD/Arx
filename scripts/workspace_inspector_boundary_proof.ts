import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const inspector = read("convex/workspaceInspector.ts");
const blaxelClient = read("convex/blaxelWorkspaceClient.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeExecutionSession = read("convex/runtimeExecutionSession.ts");
const schema = read("convex/schema.ts");
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
  schema,
  /workspaceDirectorySnapshots: defineTable[\s\S]*\.index\("by_project_path", \["projectId", "path"\]\)/,
  "workspace directory snapshots must be keyed by project and path",
);
assert.match(
  schema,
  /cloudProjects: defineTable[\s\S]*workspaceDirectorySnapshotInvalidatedAt[\s\S]*workspaceDirectorySnapshotInvalidationReason/,
  "directory cache invalidation must be project-level instead of patching every cached path",
);
assert.match(
  inspector,
  /getWorkspaceDirectorySnapshotInternal[\s\S]*upsertWorkspaceDirectorySnapshotInternal[\s\S]*markWorkspaceDirectorySnapshotsStaleInternal/,
  "workspace inspector must expose a server-side directory snapshot cache",
);
assert.match(
  inspector,
  /args\.refresh !== true[\s\S]*getWorkspaceDirectorySnapshotInternal[\s\S]*workspaceDirectorySnapshotInvalidatedAt[\s\S]*stale[\s\S]*cached: true[\s\S]*listBlaxelInspectorDirectory/,
  "workspace inspector must read cached directory snapshots before waking Blaxel and mark old snapshots stale",
);
assert.match(
  inspector,
  /upsertWorkspaceDirectorySnapshotInternal[\s\S]*entries[\s\S]*checkedAt/,
  "workspace inspector must cache successful provider directory listings",
);
assert.match(
  runtimeAgentLoop,
  /params\.toolName === "write"[\s\S]*params\.toolName === "edit"[\s\S]*params\.toolName === "bash"[\s\S]*markWorkspaceDirectorySnapshotsStaleBestEffort/,
  "successful mutating workspace tools must invalidate cached directory snapshots",
);
assert.match(
  runtimeExecutionSession,
  /paramsForTool\.toolName === "terminal_start"[\s\S]*paramsForTool\.toolName === "terminal_write"[\s\S]*markWorkspaceDirectorySnapshotsStaleBestEffort/,
  "successful terminal commands must invalidate cached directory snapshots because they can mutate files asynchronously",
);
assert.match(
  inspector,
  /readBlaxelInspectorFilePreview\(params: \{[\s\S]*readBlaxelWorkspaceFile/,
  "file preview must read through the canonical Blaxel workspace computer",
);
assert.match(
  inspector,
  /finalizeBillableBlaxelProjectWorkspaceLease[\s\S]*billableDurationSeconds: \(Date\.now\(\) - operationStartedAt\) \/ 1000[\s\S]*clearProjectAccounting: true/,
  "fresh file inspections must settle measured usage immediately instead of charging the whole idle window",
);
assert.match(
  inspector,
  /releaseBillableBlaxelProjectWorkspaceLeaseBestEffort[\s\S]*workspace_file_inspection_no_data_returned[\s\S]*clearProjectAccounting: true/,
  "failed or empty file inspections must release their reserved billing hold",
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
  /WORKSPACE_INSPECTOR_WAKE_RETRY_WINDOW_MS = 60_000[\s\S]*workspaceInspectorRetryDelayMs[\s\S]*setDirectoryRefreshNonce/,
  "Files panel wake retry must be time-bounded, provider-hint aware, and drive a canonical directory refresh",
);
assert.match(
  userDataPanel,
  /forceDirectoryRefreshRef[\s\S]*refresh: forceRefresh[\s\S]*directoryIndicator[\s\S]*workspace-files-refresh/,
  "Files panel must default to cached listings and require an explicit refresh for another provider read",
);
assert.match(
  inspector,
  /code: "blaxel_workspace_recreate_failed"[\s\S]*details:\s*\{[\s\S]*retryAfterMs: WORKSPACE_INSPECTOR_WAKE_RETRY_AFTER_MS/,
  "workspace inspector must return a bounded retry hint for transient Blaxel wake failures",
);

console.log("workspace_inspector_boundary_proof: ok");
