import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const communityAgentDock = read("apps/web/src/components/WebCommunityAgentDock.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const resourcesLifecycle = read("shared/useCommunityResourcesTabLifecycle.ts");
const eventsLifecycle = read("shared/useCommunityEventsTabLifecycle.ts");

assert.doesNotMatch(
  app,
  /nextAppRoute\.threadId|nextAppRoute\.projectId|activeThreadId|workspaceWantsNewChat|threadMessages/,
  "browser route reconciliation and App state must remain independent from deleted Workspace conversation state",
);
assert.match(
  communityAgentDock,
  /activeThreadKeyRef[\s\S]*if \(activeThreadKeyRef\.current\) return;[\s\S]*ensureCloudCommunityAgentConversation/,
  "the mounted member-agent surface must own one explicit active channel without App-level auto-selection",
);
assert.doesNotMatch(
  app,
  /workspaceCommunityPreviewPanel|workspaceCommunityRecentChatPreview|handleOpenWorkspacePanelCommunity/,
  "App must not project the retired Workspace community preview",
);
assert.doesNotMatch(
  app,
  /buildWorkspaceRightPanelUserData/,
  "App must not assemble data for the retired Workspace right panel",
);
assert.doesNotMatch(
  app,
  /workspaceProject|resolveWorkspaceActiveProject|loadProjects|setActiveProjectId/,
  "App must not retain browser project-list, draft-selection, or default-project authority",
);
assert.doesNotMatch(
  app,
  /onProjectToggled|props\.onProjectToggled/,
  "retained App orchestration must not carry retired thread-browser folder toggles",
);
assert.doesNotMatch(
  app,
  /buildWebWorkspaceSurfaceProjection|buildWorkspaceRightPanelUserData|buildWebWorkspaceLandingProjection/,
  "the retired Workspace presentation must not be projected from App",
);
assert.doesNotMatch(
  resourcesPanel,
  /Refreshing knowledge/,
  "resources background refresh must not insert a grid row or move the editor",
);
assert.match(
  resourcesPanel,
  /className="knowledge-workspace(?: [^"]*)?" aria-busy=\{isRefreshingResources\}/,
  "resources background refresh must remain semantic without changing geometry",
);
assert.doesNotMatch(
  eventsPanel,
  /community-events-refreshing|Updating…/,
  "events background refresh must not change the month header height",
);
for (const [label, lifecycle] of [
  ["resources", resourcesLifecycle],
  ["events", eventsLifecycle],
] as const) {
  assert.match(
    lifecycle,
    /resolveAuthPresentationIdentity/,
    `${label} hydration must key presentation work by stable actor identity`,
  );
  assert.match(
    lifecycle,
    /const sessionRef = useRef\(params\.session\)/,
    `${label} hydration must use a ref for the latest transport credential`,
  );
  assert.doesNotMatch(
    lifecycle,
    /\[\s*params\.session,/,
    `${label} hydration must not reload when only the transport token rotates`,
  );
}
assert.match(
  eventsPanel,
  /className="community-events-content" aria-busy=\{state\.isLoadingEvents\}/,
  "events background refresh must remain semantic without changing geometry",
);

console.log("ui_stability_contract_proof: ok");
