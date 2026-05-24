import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
} from "../shared/communityResourceDirectory.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const communityCore = read("convex/communityCore.ts");
const resources = read("convex/communityResources.ts");
const archiveDocuments = read("convex/communityArchiveDocuments.ts");
const archiveRetrieval = read("convex/communityArchiveRetrieval.ts");
const recentContext = read("convex/communityRecentContext.ts");
const attention = read("convex/communityAttention.ts");
const emailDigests = read("convex/emailDigests.ts");
const resourceDirectory = read("shared/communityResourceDirectory.ts");
const resourceModal = read("apps/web/src/components/WebCommunityResourceModal.tsx");
const resourceViewer = read("apps/web/src/components/WebCommunityResourceViewerModal.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const resourceContracts = read("apps/web/src/components/communityResourcesContracts.ts");
const resourceController = read("shared/useCommunityResourceController.ts");
const webResourceController = read("apps/web/src/controllers/useWebCommunityResourceUiController.ts");
const resourceGateway = read("shared/cloudCommunityAdminGateway.ts");
const communityExperience = read("convex/communityExperience.ts");
const communityBarrel = read("convex/community.ts");

assert.match(
  schema,
  /role: v\.optional\(v\.union\(v\.literal\("page"\), v\.literal\("source"\)\)\)/,
  "community resources must distinguish authored pages from source inbox items",
);
assert.match(
  schema,
  /status: v\.optional\([\s\S]*v\.literal\("draft"\)[\s\S]*v\.literal\("review"\)[\s\S]*v\.literal\("published"\)[\s\S]*v\.literal\("processing"\)[\s\S]*v\.literal\("failed"\)/,
  "community resources must have explicit lifecycle status",
);
assert.match(
  schema,
  /sourceResourceId: v\.optional\(v\.id\("communityResources"\)\)/,
  "community resource drafts must be able to preserve source lineage",
);
assert.match(
  schema,
  /resourceRole: v\.optional\(v\.union\(v\.literal\("page"\), v\.literal\("source"\)\)\)/,
  "archive documents must preserve resource role for agent-facing citations",
);
assert.match(
  schema,
  /resourceStatus: v\.optional\([\s\S]*v\.literal\("published"\)/,
  "archive documents must preserve resource publication status",
);
assert.match(
  schema,
  /by_community_status_createdAt/,
  "published resource reads must have a direct status/time index",
);
assert.doesNotMatch(
  schema,
  /directoryUri|directoryPath/,
  "resource directory paths must remain derived fields until a persisted slug model is explicitly needed",
);

assert.match(
  resourceDirectory,
  /resources:\/\/community\/\$\{encodeResourceDirectoryUriPart\(args\.communityId\)\}\/modules/,
  "resource directory URIs must be stable ID-based locators",
);
assert.match(
  resourceDirectory,
  /COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT = "source-inbox"/,
  "source resources must have a dedicated source inbox path segment",
);
assert.match(
  resourceDirectory,
  /buildCommunityResourceModuleDirectoryFields/,
  "resource modules must expose directory fields",
);
assert.match(
  resourceDirectory,
  /buildCommunityResourceDirectoryFields/,
  "resources must expose directory fields",
);
assert.deepEqual(
  buildCommunityResourceModuleDirectoryFields({
    communityId: "community 1",
    moduleId: "module 1",
    moduleName: "The Methodology",
  }),
  {
    directory_uri: "resources://community/community%201/modules/module%201",
    directory_path: "/the-methodology",
  },
  "module directory fields must be stable by ID and readable by name",
);
assert.deepEqual(
  buildCommunityResourceDirectoryFields({
    communityId: "community 1",
    moduleId: "module 1",
    moduleName: "The Methodology",
    resourceId: "resource 1",
    resourceTitle: "Process Swim Lanes",
    resourceRole: "page",
  }),
  {
    directory_uri: "resources://community/community%201/modules/module%201/resources/resource%201",
    directory_path: "/the-methodology/process-swim-lanes",
  },
  "page resources must derive stable URI and readable module path",
);
assert.deepEqual(
  buildCommunityResourceDirectoryFields({
    communityId: "community 1",
    moduleId: "module 1",
    moduleName: "The Methodology",
    resourceId: "source 1",
    resourceTitle: "Workshop Recording",
    resourceRole: "source",
  }),
  {
    directory_uri: "resources://community/community%201/modules/module%201/resources/source%201",
    directory_path: "/the-methodology/source-inbox/workshop-recording",
  },
  "source resources must derive under the source inbox path",
);

assert.match(
  communityCore,
  /export function normalizeResourceRole/,
  "resource role normalization must be centralized",
);
assert.match(
  communityCore,
  /export function normalizeResourceStatus/,
  "resource status normalization must be centralized",
);
assert.match(
  communityCore,
  /if \(!status\) return "published"/,
  "legacy resources with missing status must remain readable as published",
);
assert.match(
  communityCore,
  /parseResourceStatusForWrite\(status\) \?\? "draft"/,
  "unknown existing resource statuses must fail closed as draft",
);
assert.match(
  communityCore,
  /export function requireResourceStatusForWrite/,
  "resource write status must fail closed instead of normalizing unknown values to published",
);
assert.match(
  communityCore,
  /community_resource_status_invalid/,
  "invalid resource status writes must use a stable backend error",
);
assert.match(
  communityCore,
  /export function communityResourceIsPublishedKnowledge/,
  "published usable knowledge must have one shared predicate",
);
assert.match(
  communityCore,
  /resource_role: normalizeResourceRole\(row\.role\)/,
  "resource API rows must expose normalized role",
);
assert.match(
  communityCore,
  /resource_status: normalizeResourceStatus\(row\.status\)/,
  "resource API rows must expose normalized status",
);
assert.match(
  communityCore,
  /buildCommunityResourceDirectoryFields/,
  "resource API rows must derive resource directory fields",
);
assert.match(
  communityCore,
  /directory_uri: resourceDirectory\.directory_uri/,
  "resource API rows must expose stable directory URI",
);
assert.match(
  communityCore,
  /directory_path: resourceDirectory\.directory_path/,
  "resource API rows must expose human-readable directory path",
);
assert.match(
  communityCore,
  /buildCommunityResourceModuleDirectoryFields/,
  "module API rows must derive module directory fields",
);
assert.match(
  communityCore,
  /source_resource_id: row\.sourceResourceId \? String\(row\.sourceResourceId\) : null/,
  "resource API rows must expose source lineage for drafts",
);

assert.match(
  resources,
  /canManageResources \|\| communityResourceIsPublishedKnowledge\(row\)/,
  "non-manager resource listing must only return usable published knowledge",
);
assert.match(
  resources,
  /const nextRole = normalizeResourceRole\(nextRoleRaw\)[\s\S]*role: nextRole/,
  "resource updates must persist normalized role",
);
assert.match(
  resources,
  /status: nextStatus/,
  "resource updates must persist a write-validated status",
);
assert.match(
  resources,
  /requireResourceStatusForWrite\(nextStatusRaw\)/,
  "resource updates with explicit status must fail closed on invalid values",
);
assert.match(
  resources,
  /createCommunityResourcePageDraftFromSource/,
  "source inbox must be able to create a reviewed page draft",
);
assert.match(
  resources,
  /createCommunityResourcePageDraftFromSource[\s\S]*requireCommunityManager/,
  "source-to-page draft creation must be manager-gated",
);
assert.match(
  resources,
  /normalizeResourceRole\(source\.role\) !== "source"/,
  "source-to-page draft creation must only accept source resources",
);
assert.match(
  resources,
  /role: "page"[\s\S]*status: "draft"/,
  "source-to-page draft creation must create unpublished page drafts",
);
assert.match(
  resources,
  /sourceResourceId: source\._id/,
  "source-to-page draft creation must persist lineage back to the source item",
);
assert.match(
  resources,
  /buildPageDraftBodyFromSource/,
  "source-to-page draft creation must preserve source citation context",
);
assert.match(
  resources,
  /extractDraftSummary/,
  "source-to-page draft creation must seed the draft summary from source material",
);
assert.match(
  resources,
  /extractDraftKeyIdeas/,
  "source-to-page draft creation must seed useful draft bullets from source material",
);
assert.match(
  resources,
  /## How Members Should Use This/,
  "source-to-page draft creation must include an operator editing/publishing guidance section",
);
assert.match(
  resourceController,
  /resource_role: current\.resourceRoleInput/,
  "web saves must send resource role to the backend",
);
assert.match(
  resourceController,
  /resource_status: current\.resourceStatusInput/,
  "web saves must send resource status to the backend",
);
assert.match(
  resourceGateway,
  /community:createCommunityResourcePageDraftFromSource/,
  "web gateway must call the canonical source-to-page draft mutation",
);
assert.match(
  resourceController,
  /handleCreatePageDraftFromSource[\s\S]*createCloudCommunityResourcePageDraftFromSource/,
  "web resource controller must expose source-to-page draft creation",
);
assert.match(
  communityExperience,
  /createCommunityResourcePageDraftFromSource/,
  "community experience barrel must expose source-to-page draft creation",
);
assert.match(
  communityBarrel,
  /createCommunityResourcePageDraftFromSource/,
  "community Convex barrel must expose source-to-page draft creation",
);
assert.match(
  resourceContracts,
  /source_resource_id\?: string \| null/,
  "web resource contracts must carry source lineage",
);
assert.match(
  resourceContracts,
  /directory_uri: string/,
  "web resource contracts must carry stable directory URIs",
);
assert.match(
  resourceContracts,
  /directory_path: string/,
  "web resource contracts must carry readable directory paths",
);
assert.match(
  resourceContracts,
  /file_key\?: string \| null/,
  "web resource contracts must carry uploaded source references",
);

assert.match(
  archiveDocuments,
  /communityResourceIsPublishedKnowledge\(params\.resource\)/,
  "only usable published resources must be archived for community search",
);
assert.match(
  archiveDocuments,
  /deleteArchiveDocumentBySource\([\s\S]*sourceType: "resource"/,
  "moving a resource out of published state must remove stale archive documents",
);
assert.match(
  archiveRetrieval,
  /resource_role: doc\.resourceRole/,
  "archive retrieval must expose resource role to agents",
);
assert.match(
  archiveRetrieval,
  /resource_status: doc\.resourceStatus/,
  "archive retrieval must expose resource status to agents",
);
assert.match(
  recentContext,
  /by_community_status_createdAt/,
  "recent context must query the published resource index",
);
assert.match(
  recentContext,
  /communityResourceIsPublishedKnowledge\(row\)/,
  "recent context must exclude staged and unusable resources",
);
assert.match(
  attention,
  /by_community_status_createdAt/,
  "resource attention must query the published resource index",
);
assert.match(
  attention,
  /communityResourceIsPublishedKnowledge\(row\)/,
  "resource attention must not be triggered by staged or unusable resources",
);
assert.match(
  emailDigests,
  /communityResourceIsPublishedKnowledge\(row as any\)/,
  "weekly digests must not include staged or unusable resources",
);

assert.match(
  resourceModal,
  /resourceRoleInput === "source"/,
  "resource modal must expose source-specific authoring behavior",
);
assert.match(
  resourceModal,
  /Only published items are visible to members and available to community search/,
  "resource modal must explain the publication boundary",
);
assert.match(
  resourceViewer,
  /resource\.source_resource_id/,
  "resource viewer must surface source lineage when a page was drafted from source material",
);
assert.match(
  resourceViewer,
  /sourceLineage\?\.title/,
  "resource viewer must show the source title when lineage can be resolved",
);
assert.match(
  resourceViewer,
  /Original source unavailable/,
  "resource viewer must fail softly when source lineage is missing or hidden",
);
assert.match(
  resourceViewer,
  /sourceLineage\.onOpen/,
  "resource viewer must support opening the original source when available",
);
assert.match(
  resourceViewer,
  /Open source/,
  "resource viewer must expose a clear open-source action for resolved lineage",
);
assert.match(
  resourceViewer,
  /resource\.directory_path/,
  "resource viewer must show the readable directory path",
);
assert.match(
  resourceViewer,
  /resource\.directory_uri/,
  "resource viewer must keep the stable directory URI visible",
);
assert.match(
  resourcesPanel,
  /resourcesById/,
  "resources panel must resolve source lineage from the loaded resource directory",
);
assert.match(
  resourcesPanel,
  /selectedSourceLineage/,
  "resources panel must pass resolved source lineage into the reader",
);
assert.match(
  resourcesPanel,
  /handleOpenSelectedSourceResource/,
  "resources panel must let operators jump from a drafted page back to its source",
);
assert.match(
  resourcesPanel,
  /Source Inbox/,
  "resources panel must show the source inbox inside each module",
);
assert.match(
  webResourceController,
  /openNewSourceModal[\s\S]*setResourceRoleInput\("source"\)[\s\S]*setResourceStatusInput\("review"\)/,
  "web resources controller must make new source intake land in review status",
);
assert.match(
  resourceController,
  /handlePublishResource[\s\S]*payload:\s*{\s*resource_status: "published"/,
  "source publishing must be a status-only backend patch",
);
assert.match(
  resourcesPanel,
  /actions\.openNewSourceModal/,
  "resources panel must expose source intake from a selected module",
);
assert.match(
  resourcesPanel,
  /actions\.handlePublishResource\(selectedResource\)/,
  "resources panel must expose manual source publishing from the reader",
);
assert.match(
  resourcesPanel,
  />\s*Publish\s*</,
  "source reader publish action must be visible to community operators",
);
assert.match(
  resourcesPanel,
  /actions\.handleCreatePageDraftFromSource\(selectedResource\)/,
  "resources panel must expose source-to-page draft creation from the reader",
);
assert.match(
  resourcesPanel,
  />\s*Draft page\s*</,
  "source reader draft action must be visible to community operators",
);

console.log("PASS: community resources knowledge contract is canonical.");
