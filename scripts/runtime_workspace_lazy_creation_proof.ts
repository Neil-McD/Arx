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
  assert.equal(
    terminalBlock.includes("ensureWorkspaceForTool"),
    false,
    "expected terminal tools not to create the interactive workspace session",
  );
  assert.equal(
    terminalBlock.includes("createWorkspaceSession"),
    false,
    "expected terminal tools to stay on the background-terminal Daytona path",
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
