import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const resetSessionState = read("apps/web/src/auth/resetSessionState.ts");
const memberDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const mcp = read("convex/httpMcp.ts");

const sessionReadyBlock =
  app.match(/onSessionReady: async \(session\) => \{[\s\S]*?\n    \},\n    onSessionFocusReady:/)?.[0] ?? "";
const sessionFocusBlock =
  app.match(/onSessionFocusReady: async \(session\) => \{[\s\S]*?\n    \},\n    onDidJustSignIn:/)?.[0] ?? "";
const signedOutResetBlock =
  app.match(/onSessionLost: async \(\) => \{[\s\S]*?\n    \},\n    onSessionMissingAfterBootstrap:/)?.[0] ?? "";

assert.ok(sessionReadyBlock, "session-ready account hydration block must remain discoverable");
assert.ok(sessionFocusBlock, "session-focus account refresh block must remain discoverable");
assert.ok(signedOutResetBlock, "signed-out reset block must remain discoverable");

for (const [label, source] of [
  ["session ready", sessionReadyBlock],
  ["session focus", sessionFocusBlock],
] as const) {
  assert.doesNotMatch(
    source,
    /workspace\.actions\.(?:hydrate|resume)WorkspaceSurfaceState|loadWorkspaceProjects|loadThreads\(|loadModelRegistry\(/,
    `${label} must not hydrate retired Workspace data`,
  );
}

assert.match(
  sessionReadyBlock,
  /const criticalTasks: Array<Promise<void>> = \[\][\s\S]*shouldTreatCommunitiesAsCritical[\s\S]*runCommunitiesHydration\(session, "session_ready_critical"\)/,
  "only destination-critical community data may block authenticated readiness",
);
assert.match(
  sessionReadyBlock,
  /runBillingHydration\(session, "session_ready_secondary"\)[\s\S]*runSelfProfileHydration\(session, "session_ready_secondary"\)/,
  "billing and self profile must remain in secondary account hydration",
);
assert.match(
  sessionFocusBlock,
  /runBillingHydration\(session, "session_focus_ready_secondary"\)[\s\S]*runCommunitiesHydration\(session, "session_focus_ready_secondary"\)/,
  "focus refresh must retain billing and community freshness",
);
assert.doesNotMatch(
  sessionFocusBlock,
  /workspace_ready|workspaceResults|workspaceFailureCount/,
  "focus refresh telemetry must not preserve a fake Workspace-ready phase",
);

assert.match(
  signedOutResetBlock,
  /resetAgentThreadState: resetAgentThreadStateAfterSignOut/,
  "session loss must clear retained user-scoped agent thread state through the canonical reset owner",
);
assert.equal(
  app.match(/resetAgentThreadState: resetAgentThreadStateAfterSignOut/g)?.length,
  2,
  "both session-loss paths must use the same agent thread reset",
);
assert.match(
  resetSessionState,
  /deps\.resetAgentThreadState\(\);\s*await deps\.beginBrowserSignedOutState\(\);/,
  "the canonical session reset must clear agent thread state before awaiting browser sign-out work",
);
assert.match(
  app,
  /function resetAgentThreadStateAfterSignOut\(\): void \{[\s\S]*workspaceComposerDraftRef\.current = \{ text: "", attachments: \[\] \};[\s\S]*threadsHydratedRef\.current = false;[\s\S]*setThreads\(\[\]\);[\s\S]*setThreadErrorById\(\{\}\);[\s\S]*setActiveThreadId\(null\);[\s\S]*setThreadMessages\(\[\]\);[\s\S]*setThreadSendingStateById\(\{\}\);[\s\S]*setThreadStreamingStateById\(\{\}\);[\s\S]*setRuntimeEventsByRunId\(\{\}\);/,
  "the relocated reset must clear persisted, error, sending, streaming, and runtime-event projections",
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
assert.match(
  mcp,
  /community_context: "workspace_context"/,
  "MCP wire compatibility must remain unchanged during web lifecycle retirement",
);

console.log("workspace_account_lifecycle_retirement_contract_proof: ok");
