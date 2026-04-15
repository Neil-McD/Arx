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
    "async getTerminalPreview(",
  );
  const terminalArgValidationIndex = terminalBlock.indexOf(
    "normalizeWorkspaceTerminalStartArgs",
  );
  const terminalWorkspaceEnsureIndex = terminalBlock.indexOf(
    "ensureWorkspaceForTool",
  );
  assert.ok(
    terminalArgValidationIndex >= 0 &&
      terminalWorkspaceEnsureIndex > terminalArgValidationIndex,
    "expected terminal_start args to validate before workspace creation",
  );
  assert.equal(
    terminalBlock.includes("ensureWorkspaceForTool"),
    true,
    "expected terminal_start to lazily create the execution-session workspace",
  );
  assert.equal(
    terminalBlock.includes("startWorkspaceTerminalInternal"),
    false,
    "expected terminal tools not to use the project background-terminal Daytona path",
  );
  assert.equal(
    terminalBlock.includes("startRuntimeSessionTerminal"),
    true,
    "expected terminal tools to delegate process creation to the shared runtime terminal core",
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
    "expected runtime terminal rows to be tied back to the owning runtime run",
  );
  assert.equal(
    terminalBlock.includes("runtimeTerminalSessionIds.add"),
    true,
    "expected execution sessions to track owned terminal sessions for cleanup",
  );
  assert.equal(
    terminalBlock.includes("requireRuntimeSessionOwnedTerminalRow"),
    true,
    "expected terminal read/write/stop to require a run-owned terminal row",
  );

  const previewBlock = extractFunctionBlock(
    executionSessionSource,
    "async getTerminalPreview(",
    "async executeComputerTool(",
  );
  assert.equal(
    previewBlock.includes("requireRuntimeSessionOwnedTerminalRow"),
    true,
    "expected runtime preview lookup to require a run-owned terminal row",
  );
  assert.equal(
    previewBlock.includes("resolveRuntimeSessionTerminalPreview"),
    true,
    "expected runtime preview lookup to delegate preview resolution to the shared runtime terminal core",
  );
  assert.equal(
    previewBlock.includes("getDaytonaSignedPreviewUrl"),
    false,
    "expected execution session not to own low-level Daytona preview URL minting",
  );
  assert.equal(
    terminalProcessCoreSource.includes("getDaytonaSignedPreviewUrl"),
    true,
    "expected shared terminal core to own Daytona preview URL minting",
  );
  assert.equal(
    terminalProcessCoreSource.includes("workspace_session_mismatch"),
    true,
    "expected runtime preview lookup to fail closed when terminal and workspace sandbox differ",
  );

  assert.equal(
    workspaceTerminalsSource.includes("isRuntimeSessionOwnedTerminalRow"),
    true,
    "expected shared terminal actions to detect runtime-session-owned terminal rows",
  );
  assert.equal(
    workspaceTerminalsSource.includes(
      'lifecycleOwner: runtimeSessionOwned ? "runtime_session" : "project_background"',
    ),
    true,
    "expected shared terminal reconciliation to preserve runtime-session ownership",
  );
  assert.equal(
    workspaceTerminalsSource.includes("touchProjectBackground: !runtimeSessionOwned"),
    true,
    "expected shared terminal preview/read/write paths not to touch project background state for runtime terminals",
  );
  assert.equal(
    workspaceTerminalsSource.includes("startWorkspaceTerminalProcess"),
    true,
    "expected project-background terminal start to use the shared terminal process core",
  );
  assert.equal(
    workspaceTerminalsSource.includes("writeWorkspaceTerminalProcessInput"),
    true,
    "expected project-background terminal write to use the shared terminal process core",
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
