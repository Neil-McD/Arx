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
  const workspaceTerminalsSource = await readRepoFile(
    "convex/workspaceTerminals.ts",
  );
  const workspaceTerminalBackgroundServiceSource = await readRepoFile(
    "convex/workspaceTerminalBackgroundService.ts",
  );
  const workspaceTerminalReconciliationSource = await readRepoFile(
    "convex/workspaceTerminalReconciliation.ts",
  );
  const workspaceTerminalRuntimeAccessSource = await readRepoFile(
    "convex/workspaceTerminalRuntimeAccess.ts",
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
  const terminalStartIndex = terminalBlock.indexOf("startRuntimeSessionTerminal");
  assert.ok(
    terminalArgValidationIndex >= 0 &&
      terminalStartIndex > terminalArgValidationIndex,
    "expected terminal_start args to validate before runtime-session terminal creation",
  );
  assert.equal(
    terminalBlock.includes("ensureWorkspaceForTool"),
    true,
    "expected terminal_start to lazily create the execution-session workspace when needed",
  );
  assert.equal(
    terminalBlock.includes("startWorkspaceTerminalInternal"),
    false,
    "expected terminal_start not to use the project background-terminal Daytona path",
  );
  assert.equal(
    terminalBlock.includes("readWorkspaceTerminalInternal"),
    false,
    "expected terminal_read not to use the project background-terminal Daytona path",
  );
  assert.equal(
    terminalBlock.includes("writeWorkspaceTerminalInternal"),
    false,
    "expected terminal_write not to use the project background-terminal Daytona path",
  );
  assert.equal(
    terminalBlock.includes("stopWorkspaceTerminalInternal"),
    false,
    "expected terminal_stop not to use the project background-terminal Daytona path",
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
    terminalProcessCoreSource.includes("runIdStartedBy: params.runId"),
    true,
    "expected runtime terminal core to support tying rows back to an owning runtime run",
  );
  assert.equal(
    terminalProcessCoreSource.includes("RUNTIME_TERMINAL_START_READINESS_MS"),
    true,
    "expected runtime terminal starts to include a short readiness window",
  );
  assert.equal(
    terminalProcessCoreSource.includes("terminal_exited_before_ready"),
    true,
    "expected runtime terminal starts to fail closed when the process exits immediately",
  );
  assert.equal(
    terminalProcessCoreSource.includes("wrapTerminalCommandWithOutputLog"),
    true,
    "expected runtime terminal starts to mirror output into a durable fallback log",
  );
  assert.equal(
    terminalProcessCoreSource.includes("readTerminalFallbackOutputLog"),
    true,
    "expected runtime terminal reconciliation to read fallback logs when provider logs are empty",
  );
  assert.equal(
    terminalProcessCoreSource.includes("preview_preflight_failed"),
    true,
    "expected preview terminal starts to fail early with structured preflight errors",
  );
  assert.equal(
    terminalProcessCoreSource.includes("await reconcileRuntimeSessionTerminalRow({"),
    true,
    "expected runtime terminal starts to reconcile before reporting success",
  );
  assert.equal(
    terminalBlock.includes("startRuntimeSessionTerminal"),
    true,
    "expected agent terminal_start to create runtime-session-owned terminal rows",
  );
  assert.equal(
    terminalBlock.includes("requireRuntimeSessionOwnedTerminalRow"),
    true,
    "expected runtime terminal read/write/stop to enforce owning run identity directly",
  );
  assert.equal(
    terminalBlock.includes("reconcileRuntimeSessionTerminalRow"),
    true,
    "expected runtime terminal read to reconcile against the execution-session sandbox directly",
  );
  assert.equal(
    terminalBlock.includes("writeRuntimeSessionTerminalRow"),
    true,
    "expected runtime terminal write to use the runtime-session-owned terminal helper",
  );
  assert.equal(
    terminalBlock.includes("stopRuntimeSessionTerminalRow"),
    true,
    "expected runtime terminal stop to use the runtime-session-owned terminal helper",
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
    workspaceTerminalBackgroundServiceSource.includes(
      "export async function resolveTerminalSandboxContext",
    ),
    true,
    "expected background sandbox resolution to live in the dedicated background service module",
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
    true,
    "expected workspace terminal actions to depend on a dedicated runtime terminal access module",
  );
  assert.equal(
    workspaceTerminalRuntimeAccessSource.includes(
      "export async function isRuntimeSessionOwnedTerminalRow",
    ),
    true,
    "expected runtime terminal ownership detection to live in the dedicated runtime access module",
  );
  assert.equal(
    workspaceTerminalRuntimeAccessSource.includes(
      "export async function resolveRuntimeOwnedTerminalSession",
    ),
    true,
    "expected runtime preview session reconstruction to live in the dedicated runtime access module",
  );
  assert.equal(
    workspaceTerminalsSource.includes("requireRuntimeSessionOwnedTerminalRow"),
    true,
    "expected shared terminal actions to support strict runtime-session ownership checks",
  );
  assert.equal(
    workspaceTerminalsSource.includes("isRuntimeSessionOwnedTerminalRow"),
    true,
    "expected shared terminal actions to detect runtime-session-owned terminal rows",
  );
  assert.equal(
    workspaceTerminalsSource.includes('lifecycleOwner: "runtime_session"'),
    true,
    "expected shared terminal reconciliation to preserve runtime-session ownership",
  );
  assert.equal(
    workspaceTerminalsSource.includes("touchProjectBackground: !runtimeSessionOwned"),
    true,
    "expected shared terminal preview/read/write paths not to touch project background state for runtime terminals",
  );
  assert.equal(
    workspaceTerminalsSource.includes("resolveRuntimeOwnedTerminalSession"),
    true,
    "expected runtime preview lookup to reconstruct session-owned sandbox context from runtime run state",
  );
  assert.equal(
    workspaceTerminalsSource.includes("resolveRuntimeSessionTerminalPreview"),
    true,
    "expected runtime preview lookup to use the runtime-session preview helper",
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
    true,
    "expected shared terminal actions to fail closed for runtime-owned rows when the owning run id is missing",
  );
  assert.equal(
    workspaceTerminalsSource.includes("const backgroundRows: any[] = []"),
    true,
    "expected stop-all background terminal controls to exclude runtime-session-owned rows",
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
