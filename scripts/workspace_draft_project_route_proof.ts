import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const routeState = read("shared/webAppRouteState.ts");
const routeController = read("apps/web/src/controllers/useWebWorkspaceRouteController.ts");
const coreController = read("apps/web/src/controllers/useWebWorkspaceCoreController.ts");
const projectStateController = read("apps/web/src/controllers/useWebWorkspaceProjectStateController.ts");
const cloudProjectsGateway = read("shared/cloudProjectsGateway.ts");
const app = read("apps/web/src/App.tsx");

const projectListStart = cloudProjectsGateway.indexOf(
  "async function fetchMappedCloudProjectsViaConvex",
);
const projectListEnd = cloudProjectsGateway.indexOf(
  "export async function fetchMappedCloudProjects",
  projectListStart,
);
assert.ok(projectListStart >= 0 && projectListEnd > projectListStart);
const projectListBody = cloudProjectsGateway.slice(projectListStart, projectListEnd);

assert.match(
  routeState,
  /export const WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM = "project";/,
  "workspace draft project id must use one canonical URL search parameter",
);
assert.match(
  routeState,
  /export function normalizeWorkspaceDraftProjectId[\s\S]*\/\^\[A-Za-z0-9_-\]\{1,160\}\$\/\.test\(normalized\)/,
  "draft project route ids must be tightly normalized before entering state or URLs",
);
assert.match(
  routeState,
  /function appendWorkspaceDraftProjectSearch\(path: string, projectId\?: string \| null\)[\s\S]*parsed\.searchParams\.set\(WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM, normalizedProjectId\)/,
  "draft routes must append the normalized project id as query state",
);
assert.match(
  routeState,
  /export function buildWorkspaceDraftPath\(projectId\?: string \| null\): string \{[\s\S]*return appendWorkspaceDraftProjectSearch\("\/workspace", projectId\);[\s\S]*\}/,
  "plain workspace drafts must be able to carry project route state",
);
assert.match(
  routeState,
  /export function buildWorkspaceCommunityDraftPath\([\s\S]*projectId\?: string \| null,[\s\S]*return appendWorkspaceDraftProjectSearch\(path, projectId\);[\s\S]*\}/,
  "community workspace drafts must be able to carry project route state",
);
assert.match(
  routeState,
  /fromPath\.page === "workspace" && fromPath\.view === "home" && !fromPath\.threadId[\s\S]*new URLSearchParams\(window\.location\.search\)\.get\(WORKSPACE_DRAFT_PROJECT_SEARCH_PARAM\)/,
  "only draft workspace routes should read project id from search params",
);
assert.match(
  routeState,
  /if \(state\.threadId\) \{[\s\S]*return buildWorkspaceThreadPath\(state\.threadId\);[\s\S]*\}[\s\S]*buildWorkspaceCommunityDraftPath\(state\.communitySlug, state\.projectId\)[\s\S]*buildWorkspaceDraftPath\(state\.projectId\)/,
  "thread routes must ignore draft project query state while draft routes preserve it",
);

assert.match(
  routeController,
  /activeProjectId\?: string \| null/,
  "draft route controller must receive the current explicit draft project id",
);
assert.match(
  routeController,
  /const requestedProjectId = normalizeWorkspaceDraftProjectId\([\s\S]*opts\?\.projectId !== undefined \? opts\.projectId : null,[\s\S]*current\.setActiveProjectId\?\.\(requestedProjectId\)/,
  "explicit draft project changes must be normalized before reaching project state",
);
assert.doesNotMatch(
  routeController,
  /opts\?\.projectId !== undefined \? opts\.projectId : current\.activeProjectId/,
  "workspace drafts must not implicitly reuse the previously selected project",
);
assert.match(
  routeController,
  /buildWorkspaceCommunityDraftPath\(requestedSlug, requestedProjectId\)[\s\S]*buildWorkspaceDraftPath\(requestedProjectId\)/,
  "opening a project draft must persist only the explicit project into the route",
);
assert.match(
  routeController,
  /current\.setActiveProjectId\?\.\(null\);[\s\S]*buildWorkspaceCommunityDraftPath\(current\.activeCommunitySlug, null\)[\s\S]*buildWorkspaceDraftPath\(null\)/,
  "global new chat must clear project intent instead of inheriting the current project",
);
assert.match(
  coreController,
  /activeProjectId: params\.project\.state\.activeProjectId/,
  "thread creation and draft routing must receive raw explicit project state, not the resolved default project",
);

assert.match(
  app,
  /initialActiveProjectId: initialAppRoute\?\.projectId \?\? null/,
  "initial draft project route state must seed the workspace project controller",
);
assert.match(
  projectStateController,
  /useState<string \| null>\(\(\) =>[\s\S]*normalizeWorkspaceDraftProjectId\(params\.initialActiveProjectId\)/,
  "workspace project controller must normalize initial project route state",
);
assert.match(
  projectStateController,
  /const resolvedActiveProjectId = useMemo\([\s\S]*resolveExistingCloudProjectId\(projects, activeProjectId\)/,
  "workspace project controller must resolve active project from explicit state only",
);
assert.doesNotMatch(
  projectStateController,
  /resolvePreferredCloudProjectId\(projects, activeProjectId\)/,
  "workspace project controller must not resolve active project by falling back to the first project",
);
assert.match(
  projectListBody,
  /client\.query\("projects:listCloudProjectsForOwner"/,
  "project list load must query existing projects",
);
assert.doesNotMatch(
  projectListBody,
  /ensureDefaultCloudProjectForOwner/,
  "project list load must not create a default project as a side effect",
);
assert.match(
  app,
  /if \(nextThreadId === null\) \{[\s\S]*workspaceProject\.actions\.setActiveProjectId\(nextAppRoute\.projectId \?\? null\);[\s\S]*\}/,
  "draft route reconciliation must apply the route-owned project id",
);
assert.match(
  app,
  /projectId:[\s\S]*activePage === "workspace" && activeView === "home" && !activeThreadId[\s\S]*workspaceProject\.state\.activeProjectId/,
  "navigation snapshots must preserve only explicit draft project identity",
);
assert.match(
  app,
  /if \(activePage !== "workspace" \|\| activeView !== "home" \|\| activeThreadId\) return;[\s\S]*const draftProjectId = workspaceProject\.state\.activeProjectId;[\s\S]*window\.history\.replaceState/,
  "draft route URLs must be reconciled from explicit draft project state only",
);

console.log("workspace_draft_project_route_proof: ok");
