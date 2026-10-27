import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const accountGraphLifecycle = read(
  "apps/web/src/controllers/useWebAccountGraphLifecycle.ts",
);
const resetSessionState = read("apps/web/src/auth/resetSessionState.ts");
const memberDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const mcp = read("convex/httpMcp.ts");

const sessionReadyBlock =
  accountGraphLifecycle.match(/const onSessionReady = useCallback[\s\S]*?\n  \}, \[runInstrumentedLoad\]\);/)?.[0] ?? "";
const sessionResumeBlock =
  accountGraphLifecycle.match(/const onSessionResumeReady = useCallback[\s\S]*?\n  \}, \[runInstrumentedLoad\]\);/)?.[0] ?? "";
const signedOutResetBlock =
  accountGraphLifecycle.match(/const onSignedOut = useCallback[\s\S]*?\n  \}, \[\]\);/)?.[0] ?? "";

assert.ok(sessionReadyBlock, "session-ready account hydration block must remain discoverable");
assert.ok(sessionResumeBlock, "session-resume account refresh block must remain discoverable");
assert.ok(signedOutResetBlock, "signed-out reset block must remain discoverable");

for (const [label, source] of [
  ["session ready", sessionReadyBlock],
  ["session resume", sessionResumeBlock],
] as const) {
  assert.doesNotMatch(
    source,
    /workspace\.actions\.(?:hydrate|resume)WorkspaceSurfaceState|loadWorkspaceProjects|loadThreads\(|loadModelRegistry\(/,
    `${label} must not hydrate retired Workspace data`,
  );
}

assert.match(
  sessionReadyBlock,
  /const criticalTasks: Array<Promise<void>> = \[\][\s\S]*communitiesAreCritical[\s\S]*"session_ready_critical"[\s\S]*actions\.loadCommunities/,
  "only destination-critical community data may block authenticated readiness",
);
assert.match(
  sessionReadyBlock,
  /"session_ready_secondary"[\s\S]*actions\.loadBilling[\s\S]*"session_ready_secondary"[\s\S]*actions\.loadSelfProfile/,
  "billing and self profile must remain in secondary account hydration",
);
assert.match(
  sessionResumeBlock,
  /"session_resume_ready_secondary"[\s\S]*actions\.loadBilling[\s\S]*"session_resume_ready_secondary"[\s\S]*actions\.loadCommunities/,
  "resume refresh must retain billing and community freshness",
);
assert.doesNotMatch(
  sessionResumeBlock,
  /workspace_ready|workspaceResults|workspaceFailureCount/,
  "resume refresh telemetry must not preserve a fake Workspace-ready phase",
);

assert.match(
  signedOutResetBlock,
  /await actionsRef\.current\.resetSessionState\(\)[\s\S]*await actionsRef\.current\.onSignedOut\(reason\)/,
  "session loss must still use the canonical browser and account reset owner",
);
assert.equal(
  app.match(/return resetWebSessionStateAfterSignOut\(\{/g)?.length,
  1,
  "all session-loss paths must share one canonical account reset binding",
);
assert.match(
  app,
  /resetSessionState: \(\) => resetWebSessionStateRef\.current\(\)/,
  "the account graph lifecycle must receive the canonical account reset binding",
);
assert.doesNotMatch(
  resetSessionState,
  /resetAgentThreadState|threadMessages|threadStreaming|runtimeEvents/,
  "the canonical account reset must not own deleted App conversation projections",
);
assert.match(
  resetSessionState,
  /await deps\.beginBrowserSignedOutState\(\);[\s\S]*deps\.setCommunities\(\[\]\);[\s\S]*deps\.resetCommunityContentState\(\);/,
  "the canonical session reset must retain browser auth, community, and resource cleanup",
);
assert.match(
  memberDock,
  /previousThreadKey[\s\S]*stopStreamingTurn\(previousThreadKey\)[\s\S]*setThreadKey\(null\)[\s\S]*setMessages\(\[\]\)[\s\S]*setStreamingByThread\(\{\}\)[\s\S]*setInferenceIssue\(null\)[\s\S]*props\.session\?\.user\.id/,
  "the mounted member-agent dock must clear its own live conversation state when the session identity changes",
);
assert.doesNotMatch(
  app,
  /useWebWorkspaceSurfaceController|workspaceSurfaceLifecycle|resetWorkspaceSurfaceState/,
  "App must not retain the deleted Workspace surface lifecycle wrapper",
);

assert.doesNotMatch(
  memberDock,
  /useWebWorkspaceSurfaceController|workspaceSurfaceLifecycle/,
  "the member-agent dock must remain independent from retired Workspace hydration",
);
assert.doesNotMatch(
  mcp,
  /workspace_context/,
  "the retired workspace_context MCP alias stays removed now that the lifecycle retirement is complete",
);

console.log("workspace_account_lifecycle_retirement_contract_proof: ok");
