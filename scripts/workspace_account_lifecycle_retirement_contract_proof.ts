import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const workspaceController = read(
  "apps/web/src/controllers/useWebWorkspaceSurfaceController.ts",
);
const workspaceLifecycle = read(
  "apps/web/src/controllers/workspaceSurfaceLifecycle.ts",
);
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
  /workspace\.actions\.resetWorkspaceSurfaceState\(\)/,
  "sign-out must still clear dormant user-scoped Workspace state until that state is deleted",
);

assert.doesNotMatch(
  workspaceController,
  /hydrateWorkspaceSurfaceState|resumeWorkspaceSurfaceState|loadThreads:|loadModelRegistry:/,
  "the Workspace controller must not expose dead automatic hydration APIs",
);
assert.doesNotMatch(
  workspaceLifecycle,
  /hydrateWorkspaceSurfaceState|resumeWorkspaceSurfaceState|loadWorkspaceProjects|loadThreads|loadModelRegistry/,
  "the Workspace lifecycle module must retain reset only",
);
assert.match(
  workspaceLifecycle,
  /export function resetWorkspaceSurfaceState/,
  "the security reset must remain until dormant state is removed",
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
