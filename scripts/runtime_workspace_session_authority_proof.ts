import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

async function proveWorkspaceSessionAuthorityModel() {
  const threadsSource = await readRepoFile("convex/threads.ts");
  const executionSessionSource = await readRepoFile(
    "convex/runtimeExecutionSession.ts",
  );
  const daytonaSessionSource = await readRepoFile(
    "convex/daytonaWorkspaceSession.ts",
  );

  assert.match(
    threadsSource,
    /workspaceSessionState:\s*"none"/,
    "expected new runtime runs to start with explicit no-session state",
  );
  assert.match(
    threadsSource,
    /const hasAuthoritativeSessionState = persistedSessionState\.length > 0;/,
    "expected live desktop lookup to treat runtime-run workspace state as authoritative",
  );
  assert.match(
    threadsSource,
    /if \(!hasAuthoritativeSessionState\) \{/,
    "expected runtime-event fallback to remain legacy-only",
  );
  assert.match(
    threadsSource,
    /persistedSessionState !== "active"/,
    "expected non-active persisted session states to fail closed",
  );

  assert.match(
    executionSessionSource,
    /workspace_session_state_persist_failed/,
    "expected explicit evidence when workspace session state persistence fails",
  );
  const cleanupInvocationIndex = executionSessionSource.indexOf(
    "cleanupWorkspaceSandboxSession({",
  );
  const persistReleasedIndex = executionSessionSource.indexOf(
    'state: finalWorkspaceState',
  );
  assert.ok(
    cleanupInvocationIndex >= 0 && persistReleasedIndex > cleanupInvocationIndex,
    "expected runtime run state to be patched after cleanup is attempted",
  );

  assert.match(
    daytonaSessionSource,
    /return \{\s*ok: deleted\.ok,[\s\S]*stopStatus:[\s\S]*deleteStatus:[\s\S]*chargeRecorded,/,
    "expected workspace cleanup to return structured stop/delete/charge status",
  );

  console.log("PASS: workspace session authority model is wired correctly");
}

await proveWorkspaceSessionAuthorityModel();
