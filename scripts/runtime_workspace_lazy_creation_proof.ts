import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function extractFunctionBlock(source: string, marker: string, nextMarker: string): string {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing marker ${marker}`);
  const end = source.indexOf(nextMarker, start);
  assert.ok(end > start, `missing next marker ${nextMarker}`);
  return source.slice(start, end);
}

async function proveLazyWorkspaceCreationRules() {
  const daytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const executionSessionSource = await readRepoFile(
    "convex/runtimeExecutionSession.ts",
  );
  const terminalProcessCoreSource = await readRepoFile(
    "convex/workspaceTerminalProcessCore.ts",
  );
  const daytonaProcessSessionsSource = await readRepoFile(
    "convex/daytonaProcessSessions.ts",
  );
  const workspaceTerminalsSource = await readRepoFile(
    "convex/workspaceTerminals.ts",
  );
  const workspaceTerminalBackgroundServiceSource = await readRepoFile(
    "convex/workspaceTerminalBackgroundService.ts",
  );
  const workspaceTerminalReconciliationSource = await readRepoFile(
    "convex/workspaceTerminalReconciliation.ts",
  );
  const schemaSource = await readRepoFile("convex/schema.ts");
  const webWorkspaceHostSource = await readRepoFile(
    "apps/web/src/components/WebWorkspaceHost.tsx",
  );
  const daytonaWorkspaceTerminalsSource = await readRepoFile(
    "shared/daytonaWorkspaceTerminals.ts",
  );

  const mountedToolBranchIndex = daytonaSource.indexOf(
    "const mountedTool = executionSession.getMountedTool(toolName);",
  );
  const terminalBranchIndex = daytonaSource.indexOf(
    'toolName === "terminal_start" ||',
  );
  const computerBranchIndex = daytonaSource.indexOf(
    "if (isComputerUseToolName(toolName as RetrievalToolName)) {",
  );
  const workspaceBranchIndex = daytonaSource.indexOf(
    "const needsWorkspaceSession = requiresWorkspaceSandbox(",
  );

  assert.ok(
    mountedToolBranchIndex >= 0 && mountedToolBranchIndex < workspaceBranchIndex,
    "expected mounted MCP/community tools to execute before interactive workspace creation logic",
  );
  assert.ok(
    terminalBranchIndex >= 0 && terminalBranchIndex < workspaceBranchIndex,
    "expected terminal tools to route before interactive workspace creation logic",
  );
  assert.ok(
    computerBranchIndex >= 0 && computerBranchIndex < workspaceBranchIndex,
    "expected computer-use tools to route before generic workspace-tool creation logic",
  );

  const terminalBlock = extractFunctionBlock(
    executionSessionSource,
    "async executeTerminalTool(",
    "async executeComputerTool(",
  );
  const terminalArgValidationIndex = terminalBlock.indexOf(
    "normalizeWorkspaceTerminalStartArgs",
  );
  const terminalStartIndex = terminalBlock.indexOf("startWorkspaceTerminalProcess");
  assert.ok(
    terminalArgValidationIndex >= 0 &&
      terminalStartIndex > terminalArgValidationIndex,
    "expected terminal_start args to validate before project background terminal creation",
  );
  assert.equal(
    terminalBlock.includes("ensureWorkspaceForTool"),
    false,
    "expected terminal_start not to create a run-owned workspace just to launch a background terminal",
  );
  assert.equal(
    terminalBlock.includes("ensureProjectBackgroundSandbox"),
    true,
    "expected terminal_start to use the durable project background sandbox",
  );
  assert.equal(
    terminalBlock.includes("readWorkspaceTerminalInternal"),
    false,
    "expected terminal_read not to bounce through project terminal public actions",
  );
  assert.equal(
    terminalBlock.includes("writeWorkspaceTerminalInternal"),
    false,
    "expected terminal_write not to bounce through project terminal public actions",
  );
  assert.equal(
    terminalBlock.includes("stopWorkspaceTerminalInternal"),
    false,
    "expected terminal_stop not to bounce through project terminal public actions",
  );
  assert.equal(
    terminalBlock.includes("createDaytonaProcessSession"),
    false,
    "expected execution session not to own low-level Daytona process creation",
  );
  assert.equal(
    terminalProcessCoreSource.includes("createDaytonaProcessSession"),
    true,
    "expected shared terminal core to own low-level Daytona process creation",
  );
  assert.equal(
    terminalProcessCoreSource.includes("export async function startRuntimeSessionTerminal"),
    false,
    "expected the dead runtime-owned terminal start wrapper to stay removed",
  );
  assert.equal(
    terminalProcessCoreSource.includes("RUNTIME_TERMINAL_START_READINESS_MS"),
    false,
    "expected obsolete runtime-owned terminal start readiness polling to stay removed",
  );
  assert.equal(
    terminalProcessCoreSource.includes("terminal_exited_before_ready"),
    false,
    "expected immediate-start failure handling to live on the project background terminal path, not a dead runtime wrapper",
  );
  assert.equal(
    terminalProcessCoreSource.includes("wrapTerminalCommandWithOutputLog"),
    true,
    "expected terminal starts to mirror output into a durable fallback log",
  );
  assert.equal(
    terminalProcessCoreSource.includes("readTerminalFallbackOutputLog"),
    true,
    "expected runtime terminal reconciliation to read fallback logs when provider logs are empty",
  );
  assert.equal(
    workspaceTerminalReconciliationSource.includes(
      "readDaytonaProcessSessionCommandExitCode(command)",
    ),
    true,
    "expected terminal reconciliation to delegate provider command exit semantics",
  );
  assert.equal(
    daytonaProcessSessionsSource.includes("function isCommandStatusActive"),
    true,
    "expected Daytona command status to be checked before trusting exitCode",
  );
  assert.equal(
    daytonaProcessSessionsSource.includes("if (isCommandStatusActive(status))"),
    true,
    "expected running Daytona commands not to be treated as exited",
  );
  assert.equal(
    daytonaProcessSessionsSource.includes("exitCode === 254"),
    true,
    "expected Daytona exit 254 without terminal status not to kill preview terminals",
  );
  assert.equal(
    daytonaProcessSessionsSource.includes("function isCommandStatusTerminal"),
    true,
    "expected completed Daytona process-session commands to preserve real failures",
  );
  assert.equal(
    terminalProcessCoreSource.includes("preview_preflight_failed"),
    true,
    "expected preview terminal starts to fail early with structured preflight errors",
  );
  assert.equal(
    terminalBlock.includes("runIdStartedBy"),
    false,
    "expected agent terminal_start not to write legacy runIdStartedBy terminal ownership",
  );
  assert.equal(
    terminalBlock.includes("requireRuntimeAccessibleTerminalRow"),
    true,
    "expected terminal read/write/stop to use the project terminal access helper",
  );
  assert.equal(
    terminalBlock.includes("reconcileRuntimeSessionTerminalRow"),
    false,
    "expected runtime-session terminal reconciliation to be deleted",
  );
  assert.equal(
    terminalBlock.includes("writeRuntimeSessionTerminalRow"),
    false,
    "expected dead runtime terminal write wrapper to stay removed",
  );
  assert.equal(
    terminalBlock.includes("stopRuntimeSessionTerminalRow"),
    false,
    "expected dead runtime terminal stop wrapper to stay removed",
  );
  assert.equal(
    terminalBlock.includes("writeWorkspaceTerminalProcessInput"),
    true,
    "expected project background terminal writes to use the shared process helper",
  );
  assert.equal(
    terminalBlock.includes("stopWorkspaceTerminalProcess"),
    true,
    "expected project background terminal stops to use the shared process helper",
  );
  assert.equal(
    webWorkspaceHostSource.includes("function resolveTerminalAccessRunId"),
    true,
    "expected web preview access to distinguish render anchoring from terminal ownership",
  );
  assert.equal(
    webWorkspaceHostSource.includes("runId: accessRunId"),
    true,
    "expected preview URL lookup to pass only the persisted run-owned terminal scope",
  );
  assert.equal(
    terminalProcessCoreSource.includes("getDaytonaSignedPreviewUrl"),
    true,
    "expected shared terminal core to own Daytona preview URL minting",
  );
  assert.equal(
    terminalProcessCoreSource.includes("workspace_session_mismatch"),
    true,
    "expected shared preview lookup to fail closed when terminal and workspace sandbox differ",
  );

  assert.equal(
    workspaceTerminalsSource.includes("./workspaceTerminalReconciliation"),
    true,
    "expected workspace terminal actions to depend on a dedicated reconciliation module",
  );
  assert.equal(
    workspaceTerminalReconciliationSource.includes(
      "export async function reconcileWorkspaceTerminalRow",
    ),
    true,
    "expected terminal row reconciliation to live in the dedicated reconciliation module",
  );
  assert.equal(
    workspaceTerminalReconciliationSource.includes(
      "export function isConfirmedSandboxGoneFailure",
    ),
    true,
    "expected sandbox failure classification to live in the dedicated reconciliation module",
  );
  assert.equal(
    workspaceTerminalReconciliationSource.includes(
      "export function isConfirmedSessionGoneFailure",
    ),
    true,
    "expected session failure classification to live in the dedicated reconciliation module",
  );
  assert.equal(
    workspaceTerminalReconciliationSource.includes(
      "export function findDaytonaProcessSessionById",
    ),
    true,
    "expected background process-session lookup helper to live in the dedicated reconciliation module",
  );
  assert.equal(
    workspaceTerminalsSource.includes("async function reconcileWorkspaceTerminalRow("),
    false,
    "expected workspace terminal actions not to inline terminal row reconciliation",
  );
  assert.equal(
    workspaceTerminalsSource.includes("function isConfirmedSandboxGoneFailure("),
    false,
    "expected workspace terminal actions not to inline sandbox failure classification",
  );
  assert.equal(
    workspaceTerminalsSource.includes("function isConfirmedSessionGoneFailure("),
    false,
    "expected workspace terminal actions not to inline session failure classification",
  );
  assert.equal(
    workspaceTerminalsSource.includes("function findDaytonaProcessSessionById("),
    false,
    "expected workspace terminal actions not to inline background process-session lookup",
  );
  assert.equal(
    workspaceTerminalsSource.includes("./workspaceTerminalBackgroundService"),
    true,
    "expected workspace terminal actions to depend on a dedicated background sandbox service module",
  );
  assert.equal(
    workspaceTerminalBackgroundServiceSource.includes(
      "export async function ensureProjectBackgroundSandbox",
    ),
    true,
    "expected background sandbox creation to live in the dedicated background service module",
  );
  assert.equal(
    workspaceTerminalsSource.includes(
      "export const acquireProjectBackgroundSandboxLeaseInternal",
    ),
    true,
    "expected project background sandbox creation to use an atomic acquisition lease",
  );
  assert.equal(
    workspaceTerminalsSource.includes(
      "export const clearProjectBackgroundSandboxLeaseInternal",
    ),
    true,
    "expected failed project background sandbox creation to clear its lease",
  );
  assert.equal(
    workspaceTerminalBackgroundServiceSource.includes(
      "acquireProjectBackgroundSandboxLeaseInternal",
    ),
    true,
    "expected background sandbox service to acquire a lease before creating Daytona compute",
  );
  assert.equal(
    workspaceTerminalBackgroundServiceSource.includes(
      "waitForProjectBackgroundSandboxRegistration",
    ),
    true,
    "expected competing background sandbox starts to wait for the in-flight registration instead of creating another sandbox",
  );
  const ensureProjectBackgroundSandboxBlock = extractFunctionBlock(
    workspaceTerminalBackgroundServiceSource,
    "export async function ensureProjectBackgroundSandbox",
    "export async function resolveProjectBackgroundSandboxIfReady",
  );
  assert.ok(
    ensureProjectBackgroundSandboxBlock.indexOf(
      "acquireProjectBackgroundSandboxLeaseInternal",
    ) >= 0 &&
      ensureProjectBackgroundSandboxBlock.indexOf(
        "acquireProjectBackgroundSandboxLeaseInternal",
      ) < ensureProjectBackgroundSandboxBlock.indexOf("createDaytonaSandbox"),
    "expected background sandbox lease acquisition to happen before Daytona sandbox creation",
  );
  assert.equal(
    workspaceTerminalBackgroundServiceSource.includes(
      "export async function resolveTerminalSandboxContext",
    ),
    true,
    "expected background sandbox resolution to live in the dedicated background service module",
  );
  assert.equal(
    workspaceTerminalBackgroundServiceSource.includes(
      "export async function resolveProjectBackgroundSandboxIfReady",
    ),
    true,
    "expected reusable project background sandbox resolution to be explicit",
  );
  assert.equal(
    executionSessionSource.includes("ensureProjectBackgroundSandbox"),
    true,
    "expected regular workspace tools to adopt or create the project background sandbox through the shared lifecycle service",
  );
  assert.equal(
    executionSessionSource.includes("createWorkspaceSandboxSession"),
    false,
    "expected regular workspace tools not to create separate run-owned Daytona sandboxes",
  );
  assert.equal(
    executionSessionSource.includes("resolveProjectBackgroundSandboxIfReady"),
    false,
    "expected regular workspace tools to wait/adopt through ensureProjectBackgroundSandbox instead of one-shot ready checks",
  );
  assert.equal(
    executionSessionSource.includes("ownsWorkspaceSession"),
    false,
    "expected runtime execution not to preserve run-owned workspace session cleanup state",
  );
  assert.equal(
    executionSessionSource.includes("cleanupWorkspaceSandboxSession"),
    false,
    "expected runtime execution not to clean up project background sandboxes as run-owned sandboxes",
  );
  assert.equal(
    executionSessionSource.includes("workspace_session_adopted"),
    true,
    "expected background sandbox adoption to leave runtime evidence",
  );
  assert.equal(
    workspaceTerminalBackgroundServiceSource.includes(
      "export async function releaseProjectBackgroundSandboxIfIdle",
    ),
    true,
    "expected background sandbox cleanup to live in the dedicated background service module",
  );
  assert.equal(
    workspaceTerminalsSource.includes("async function ensureProjectBackgroundSandbox("),
    false,
    "expected workspace terminal actions not to inline background sandbox creation",
  );
  assert.equal(
    workspaceTerminalsSource.includes("async function resolveTerminalSandboxContext("),
    false,
    "expected workspace terminal actions not to inline background sandbox resolution",
  );
  assert.equal(
    workspaceTerminalsSource.includes("async function releaseProjectBackgroundSandboxIfIdle("),
    false,
    "expected workspace terminal actions not to inline background sandbox cleanup",
  );
  assert.equal(
    workspaceTerminalsSource.includes('./workspaceTerminalRuntimeAccess'),
    false,
    "expected obsolete runtime terminal access module to stay removed",
  );
  assert.equal(
    terminalProcessCoreSource.includes("export type WorkspaceTerminalLifecycleOwner = \"project_background\""),
    true,
    "expected project background to be the only terminal lifecycle owner",
  );
  assert.equal(
    workspaceTerminalsSource.includes("requireRuntimeSessionOwnedTerminalRow"),
    false,
    "expected shared terminal actions not to support run-owned terminal checks",
  );
  assert.equal(
    workspaceTerminalsSource.includes("isRuntimeSessionOwnedTerminalRow"),
    false,
    "expected shared terminal actions not to detect runtime-session-owned rows",
  );
  assert.equal(
    workspaceTerminalsSource.includes("getWorkspaceTerminalLifecycleOwner"),
    false,
    "expected shared terminal reconciliation not to classify runtime-owned rows",
  );
  assert.equal(
    executionSessionSource.includes("getWorkspaceTerminalLifecycleOwner"),
    false,
    "expected runtime execution not to branch on runtime-owned terminal lifecycle",
  );
  assert.equal(
    workspaceTerminalsSource.includes('lifecycleOwner: "runtime_ephemeral"') ||
      schemaSource.includes('v.literal("runtime_ephemeral")') ||
      terminalProcessCoreSource.includes("runtime_ephemeral") ||
      executionSessionSource.includes("runtime_ephemeral") ||
      webWorkspaceHostSource.includes("runtime_ephemeral") ||
      daytonaWorkspaceTerminalsSource.includes("runtime_ephemeral"),
    false,
    "expected runtime_ephemeral to be deleted from the active terminal model",
  );
  assert.equal(
    schemaSource.includes("lifecycleOwner: v.optional(") &&
      schemaSource.includes('v.literal("project_background")') &&
      schemaSource.includes("healthStatus: v.optional(") &&
      schemaSource.includes("previewStatus: v.optional(") &&
      schemaSource.includes("lastBrowserObservationSummary"),
    true,
    "expected workspace terminal rows to store durable lifecycle, health, preview, and observation ledger fields",
  );
  assert.equal(
    terminalProcessCoreSource.includes("lifecycle_owner: normalizeWorkspaceTerminalLifecycleOwner") &&
      terminalProcessCoreSource.includes("health_status: deriveWorkspaceTerminalHealthStatus") &&
      terminalProcessCoreSource.includes("preview_status: deriveWorkspaceTerminalPreviewStatus") &&
      terminalProcessCoreSource.includes("last_browser_observation_summary"),
    true,
    "expected terminal summaries to expose safe process ledger fields",
  );
  assert.equal(
    terminalProcessCoreSource.includes("runIdStartedBy") ||
      workspaceTerminalsSource.includes("runIdStartedBy") ||
      webWorkspaceHostSource.includes("run_id_started_by") ||
      daytonaWorkspaceTerminalsSource.includes("run_id_started_by"),
    false,
    "expected runtime terminal ownership to use startedByRunId without active legacy runIdStartedBy usage",
  );
  assert.equal(
    schemaSource.includes("runIdStartedBy: v.optional(v.string())"),
    true,
    "expected schema to keep the runIdStartedBy compatibility tombstone for old production terminal rows",
  );
  assert.equal(
    workspaceTerminalsSource.includes("touchProjectBackground: !runtimeSessionOwned"),
    false,
    "expected shared terminal preview/read/write paths to always touch project background state",
  );
  assert.equal(
    workspaceTerminalsSource.includes("resolveRuntimeOwnedTerminalSession"),
    false,
    "expected runtime-owned preview reconstruction to be deleted",
  );
  assert.equal(
    workspaceTerminalsSource.includes("resolveRuntimeSessionTerminalPreview"),
    false,
    "expected runtime-session preview helper to be deleted",
  );
  assert.equal(
    workspaceTerminalsSource.includes("recent: WorkspaceTerminalSummary[]"),
    true,
    "expected terminal snapshots to expose recent non-active terminal attempts",
  );
  assert.equal(
    workspaceTerminalsSource.includes("RECENT_TERMINAL_FAILURE_VISIBLE_MS"),
    true,
    "expected failed preview terminals to remain visible briefly for debugging",
  );
  assert.equal(
    workspaceTerminalsSource.includes("run_id_required"),
    false,
    "expected runtime-owned run id requirement to be deleted",
  );
  assert.equal(
    workspaceTerminalsSource.includes("const backgroundRows: any[] = []"),
    false,
    "expected stop-all controls to operate on the single project-background lifecycle",
  );
  assert.equal(
    workspaceTerminalsSource.includes("startWorkspaceTerminalProcess"),
    false,
    "expected dead project-background terminal start bridge to be removed",
  );
  assert.equal(
    workspaceTerminalsSource.includes("writeWorkspaceTerminalProcessInput"),
    false,
    "expected dead project-background terminal write bridge to be removed",
  );
  assert.equal(
    workspaceTerminalsSource.includes("stopWorkspaceTerminalProcess"),
    true,
    "expected project-background terminal stop to use the shared terminal process core",
  );
  assert.equal(
    workspaceTerminalsSource.includes("resolveWorkspaceTerminalPreview"),
    true,
    "expected project-background terminal preview to use the shared terminal process core",
  );
  assert.equal(
    workspaceTerminalsSource.includes("createDaytonaProcessSession"),
    false,
    "expected project-background terminal start not to own low-level Daytona process creation",
  );
  assert.equal(
    workspaceTerminalsSource.includes("sendDaytonaProcessSessionCommandInput"),
    false,
    "expected project-background terminal write not to own low-level Daytona stdin sending",
  );
  assert.equal(
    workspaceTerminalsSource.includes("getDaytonaSignedPreviewUrl"),
    false,
    "expected project-background terminal preview not to own low-level Daytona preview URL minting",
  );

  const computerBlock = extractFunctionBlock(
    executionSessionSource,
    "async executeComputerTool(",
    "},\n  };",
  );
  assert.equal(
    computerBlock.includes("ensureWorkspaceForTool"),
    true,
    "expected computer-use tools to lazily create the interactive workspace session",
  );

  console.log("PASS: workspace creation stays lazy and tool-scoped");
}

await proveLazyWorkspaceCreationRules();
