import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getShellCommandAuditMetadataForToolCall } from "../shared/runtimeToolPolicy.ts";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function proveShellAuditMetadataHelper() {
  const readOnly = getShellCommandAuditMetadataForToolCall({
    toolName: "bash",
    normalizedArgs: { command: "rg communityId convex" },
  });
  assert.equal(readOnly?.shell_command_effect, "read_only");
  assert.equal(readOnly?.shell_command_audit_severity, "low");
  assert.deepEqual(readOnly?.shell_command_parsed_commands, ["rg communityId convex"]);

  const destructive = getShellCommandAuditMetadataForToolCall({
    toolName: "bash",
    normalizedArgs: { command: "rm -rf ." },
  });
  assert.equal(destructive?.shell_command_effect, "destructive");
  assert.equal(destructive?.shell_command_audit_severity, "high");

  assert.equal(
    getShellCommandAuditMetadataForToolCall({
      toolName: "read",
      normalizedArgs: { path: "convex/httpDaytona.ts" },
    }),
    null,
  );
  assert.equal(
    getShellCommandAuditMetadataForToolCall({
      toolName: "bash",
      normalizedArgs: {},
    }),
    null,
  );
  console.log("PASS: shell command audit metadata helper is conservative");
}

async function proveRuntimeEventsCarryShellAuditMetadata() {
  const runtimeToolPolicy = await readRepoFile("shared/runtimeToolPolicy.ts");
  const daytonaRuntimeEvents = await readRepoFile("convex/daytonaRuntimeEvents.ts");
  const httpDaytona = await readRepoFile("convex/httpDaytona.ts");
  const daytonaWorkspaceTools = await readRepoFile("convex/daytonaWorkspaceTools.ts");

  assert.match(
    runtimeToolPolicy,
    /shellCommandParsedCommands/,
    "expected schedule calls to include parsed shell commands",
  );
  assert.match(
    httpDaytona,
    /normalizedArgs: step\.normalizedArgs/,
    "expected scheduler inputs to receive normalized tool args",
  );
  assert.match(
    httpDaytona,
    /calls: schedule\.calls/,
    "expected tool_schedule_resolved to persist schedule calls",
  );
  assert.match(
    daytonaRuntimeEvents,
    /getShellCommandAuditMetadataForToolCall/,
    "expected runtime tool events to derive shell command audit metadata",
  );
  assert.match(
    daytonaRuntimeEvents,
    /\.\.\.\(shellCommandAuditMetadata \?\? \{\}\)/,
    "expected tool events to spread shell command audit metadata into payloads",
  );
  assert.match(
    daytonaRuntimeEvents,
    /eventType: "tool_call_started"/,
    "expected started event helper to remain wired",
  );
  assert.match(
    daytonaRuntimeEvents,
    /eventType: "tool_call_finished"/,
    "expected finished event helper to remain wired",
  );
  assert.match(
    daytonaWorkspaceTools,
    /result\.exitCode !== 0/,
    "expected bash workspace tool failures to treat nonzero exit codes as failed tool results",
  );
  assert.match(
    httpDaytona,
    /detailsExitCode/,
    "expected bash failure envelopes to preserve nonzero exit codes for runtime evidence",
  );
  console.log("PASS: runtime bash tool events carry shell audit metadata");
}

proveShellAuditMetadataHelper();
await proveRuntimeEventsCarryShellAuditMetadata();

console.log("runtime_shell_command_audit_proof: ok");
