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
  assert.doesNotMatch(
    threadsSource,
    /runtime_event_fallback|workspace_session_created[\s\S]*sandbox_id/,
    "expected live desktop lookup not to fall back to runtime events for workspace authority",
  );
  assert.match(
    threadsSource,
    /!hasAuthoritativeSessionState \|\| persistedSessionState !== "active"/,
    "expected non-active persisted session states to fail closed",
  );

  assert.match(
    executionSessionSource,
    /workspace_session_state_persist_failed/,
    "expected explicit evidence when workspace session state persistence fails",
  );
  assert.match(
    executionSessionSource,
    /const persistWorkspaceSessionState = async/,
    "expected execution session to use a shared workspace-session persistence helper",
  );
  assert.match(
    executionSessionSource,
    /WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS = 3/,
    "expected workspace-session state persistence to retry before failing",
  );
  assert.match(
    executionSessionSource,
    /target_state: paramsForPersist\.state/,
    "expected persistence failure evidence to record the target workspace-session state",
  );
  const persistReleasedIndex = executionSessionSource.indexOf(
    'phase: "dispose"',
  );
  assert.ok(
    persistReleasedIndex >= 0,
    "expected runtime run state to be patched when borrowed workspace context is released",
  );
  assert.doesNotMatch(
    executionSessionSource,
    /cleanupWorkspaceSandboxSession|ownsWorkspaceSession/,
    "expected runtime execution not to own or clean up project background sandboxes",
  );

  assert.match(
    daytonaSessionSource,
    /return \{\s*ok: deleted\.ok,[\s\S]*stopStatus:[\s\S]*deleteStatus:[\s\S]*chargeRecorded,/,
    "expected workspace cleanup to return structured stop/delete/charge status",
  );

  console.log("PASS: workspace session authority model is wired correctly");
}

await proveWorkspaceSessionAuthorityModel();
