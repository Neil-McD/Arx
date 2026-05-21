import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  WORKSPACE_SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "../shared/retrievalTools.ts";
import { normalizeToolArguments } from "../shared/toolRegistry.ts";
import { getFixedRuntimeToolPolicy } from "../shared/runtimeToolPolicy.ts";
import { buildCodexHarnessDynamicToolSpecs } from "../shared/codexHarnessDynamicTools.ts";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

async function proveWorkspaceCapabilityUsesCodexHandoffOnly() {
  const runtimeTurnResolution = await readRepoFile("convex/runtimeTurnResolution.ts");
  const workspaceToolsBlock = runtimeTurnResolution.match(
    /if \(params\.activeCapabilityFamilies\.includes\("workspace_tools"\)\) \{([\s\S]*?)\n  \}/,
  )?.[1] ?? "";
  assert.match(
    workspaceToolsBlock,
    /toolNames\.push\("codex_workspace"\);/,
    "workspace_tools should expose the Codex workspace handoff",
  );
  for (const toolName of WORKSPACE_SANDBOX_TOOL_NAMES) {
    assert.equal(
      workspaceToolsBlock.includes(`"${toolName}"`),
      false,
      `${toolName} must not be exposed on the default PolyNet-native workspace capability surface`,
    );
  }
}

function proveCodexWorkspaceToolContract() {
  const normalized = normalizeToolArguments("codex_workspace", {
    task: "List the workspace root and summarize what exists.",
  });
  assert.deepEqual(normalized, {
    task: "List the workspace root and summarize what exists.",
  });

  const policy = getFixedRuntimeToolPolicy("codex_workspace");
  assert.equal(policy.requiresWorkspace, true);
  assert.equal(policy.exclusive, true);
  assert.equal(policy.parallelSafe, false);
  assert.equal(policy.riskLevel, "sensitive");
}

async function proveCodexWorkspaceExecutionBridge() {
  const httpDaytona = await readRepoFile("convex/httpDaytona.ts");
  assert.match(
    httpDaytona,
    /toolName === "codex_workspace"/,
    "expected the runtime tool loop to handle the Codex workspace handoff tool",
  );
  assert.match(
    httpDaytona,
    /buildCodexAppServerRuntimeAgentHarness\(\{/,
    "expected codex_workspace to execute through the Codex app-server harness",
  );
  assert.match(
    httpDaytona,
    /eventType: "codex_workspace_handoff_started"/,
    "expected codex_workspace handoff start evidence",
  );
  assert.match(
    httpDaytona,
    /eventType: "codex_workspace_handoff_completed"/,
    "expected codex_workspace handoff completion evidence",
  );
}

async function proveRawWorkspaceToolsRemainCodexNativeExcludes() {
  const codexDynamicTools = await readRepoFile("shared/codexHarnessDynamicTools.ts");
  assert.match(
    codexDynamicTools,
    /const CODEX_APP_SERVER_NATIVE_TOOL_EXCLUDES = new Set<string>\(\[\s*\.\.\.WORKSPACE_SANDBOX_TOOL_NAMES/,
    "expected Codex app-server native tool excludes to include raw workspace sandbox tools",
  );

  const dynamicSpecs = buildCodexHarnessDynamicToolSpecs([
    "get_active_community_context",
    "community_search",
    "codex_workspace",
    ...WORKSPACE_SANDBOX_TOOL_NAMES,
  ]);
  const dynamicNames = new Set(dynamicSpecs.map((spec) => spec.name));
  for (const toolName of WORKSPACE_SANDBOX_TOOL_NAMES) {
    assert.equal(
      dynamicNames.has(toolName),
      false,
      `${toolName} must remain Codex-native, not a PolyNet dynamic tool projected into Codex`,
    );
  }
  assert.equal(
    dynamicNames.has("codex_workspace"),
    false,
    "codex_workspace is a PolyNet-native handoff tool and must not be projected back into Codex",
  );
}

await proveWorkspaceCapabilityUsesCodexHandoffOnly();
proveCodexWorkspaceToolContract();
await proveCodexWorkspaceExecutionBridge();
await proveRawWorkspaceToolsRemainCodexNativeExcludes();

console.log("PASS: workspace capability uses a Codex handoff instead of raw PolyNet Daytona tools");
