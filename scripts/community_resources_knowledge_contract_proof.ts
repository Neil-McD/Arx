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
const resourceModuleModal = read("apps/web/src/components/WebCommunityResourceModuleModal.tsx");
const resourceViewer = read("apps/web/src/components/WebCommunityResourceViewerModal.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const resourceContracts = read("apps/web/src/components/communityResourcesContracts.ts");
const resourceController = read("shared/useCommunityResourceController.ts");
const resourceEditorController = read("shared/useCommunityResourceEditorController.ts");
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
  "archive documents must preserve legacy resource lifecycle status",
);
assert.match(
  schema,
  /communityResourceModules:[\s\S]*status: v\.optional\(v\.union\(v\.literal\("draft"\), v\.literal\("live"\)\)\)/,
  "community resource modules must own the member visibility state",
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
  /community_resource_page_status_deprecated/,
  "page-level publish writes must fail closed",
);
assert.match(
  communityCore,
  /export function communityResourceModuleIsLive/,
  "module live state must have one shared predicate",
);
assert.match(
  communityCore,
  /export function communityResourceIsLiveModulePage/,
  "member-visible pages must be derived from live modules",
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
  /if \(!rawStatus\) return "live"/,
  "legacy modules with missing status must remain live until the module status backfill canonicalizes them",
);
assert.match(
  communityCore,
  /module_status: normalizeResourceModuleStatus\(row\.status\)/,
  "module API rows must expose normalized draft/live status",
);
assert.match(
  communityCore,
  /source_resource_id: row\.sourceResourceId \? String\(row\.sourceResourceId\) : null/,
  "resource API rows must expose source lineage for drafts",
);

assert.match(
  resources,
  /canManageResources \|\| communityResourceIsLiveModulePage\(row, liveModuleIds\)/,
  "non-manager resource listing must only return pages from live modules",
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
  /export const backfillCommunityResourceModuleStatusesInternal = internalMutation/,
  "legacy module visibility must have an idempotent internal status backfill",
);
assert.match(
  resources,
  /hasPersistedResourceModuleStatus/,
  "module status backfill must only patch modules without explicit draft/live status",
);
assert.match(
  resources,
  /normalizeResourceRole\(row\.role\) === "page"[\s\S]*normalizeResourceStatus\(row\.status\) === "published"[\s\S]*communityResourceHasUsableKnowledgeContent\(row\)/,
  "module status backfill must infer live only from usable legacy-published pages",
);
assert.match(
  resources,
  /backfillCommunityResourceModuleStatusesInternal[\s\S]*syncArchiveDocumentsForModule/,
  "module status backfill must resync archive documents after canonicalizing visibility",
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
  "source-to-page draft creation must create page drafts",
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
  "source-to-page draft creation must include operator editing guidance",
);
assert.match(
  resourceController,
  /resource_role: current\.resourceRoleInput/,
  "web saves must send resource role to the backend",
);
assert.doesNotMatch(
  resourceController,
  /resource_status: current\.resourceStatusInput,/,
  "web saves must not blindly send hidden legacy page-level publish state",
);
assert.match(
  resourceController,
  /if \(current\.resourceRoleInput === "source"\)[\s\S]*basePayload\.resource_status = current\.resourceStatusInput === "published"[\s\S]*\? "review"[\s\S]*: current\.resourceStatusInput/,
  "web saves may only send source lifecycle status and must coerce legacy published sources back to review",
);
assert.match(
  resourceEditorController,
  /resource\.resource_status === "published"[\s\S]*resourceRole === "source" \? "review" : "draft"/,
  "resource editor state must not retain hidden legacy published status",
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
  /communityResourceIsLiveModulePage\(hydratedResource, liveModuleIds\)/,
  "only pages inside live modules must be archived for community search",
);
assert.match(
  archiveDocuments,
  /deleteArchiveDocumentBySource\([\s\S]*sourceType: "resource"/,
  "moving a page out of live module visibility must remove stale archive documents",
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
  /query\("communityResourceModules"[\s\S]*communityResourceIsLiveModulePage/,
  "recent context must filter resources through live modules",
);
assert.match(
  recentContext,
  /communityResourceIsLiveModulePage\(row, liveModuleIds\)/,
  "recent context must exclude draft modules and unusable resources",
);
assert.match(
  attention,
  /query\("communityResourceModules"[\s\S]*communityResourceIsLiveModulePage/,
  "resource attention must filter resources through live modules",
);
assert.match(
  attention,
  /communityResourceIsLiveModulePage\(row, liveModuleIds\)/,
  "resource attention must not be triggered by draft modules or unusable resources",
);
assert.match(
  emailDigests,
  /communityResourceIsLiveModulePage\(row as any, liveModuleIds\)/,
  "weekly digests must not include draft modules or unusable resources",
);

assert.match(
  resourceModal,
  /resourceRoleInput === "source"/,
  "resource modal must expose source-specific authoring behavior",
);
assert.doesNotMatch(
  resourceModal,
  /Only published items are visible to members and available to community search/,
  "resource modal must not expose page-level publication controls",
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
assert.doesNotMatch(
  resourceViewer,
  /resource\.directory_uri/,
  "resource viewer must not expose stable internal directory URIs in the reader UI",
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
  /knowledge-source-inbox-section[\s\S]*Source Inbox[\s\S]*allSourceResources/,
  "resources panel must keep builder sources in a separate source inbox",
);
assert.match(
  resourcesPanel,
  /return \[\s*\.\.\.modules,[\s\S]*id: LEGACY_RESOURCE_MODULE_ID/,
  "virtual unsorted cleanup bucket must render after real modules",
);
assert.match(
  resourcesPanel,
  /name: "Needs sorting"[\s\S]*is_virtual: true/,
  "virtual unsorted cleanup bucket must not present as a normal module",
);
assert.match(
  resourcesPanel,
  /module\.is_virtual \? \([\s\S]*Cleanup/,
  "virtual unsorted cleanup bucket must use cleanup labeling instead of live/draft category labeling",
);
assert.match(
  resourcesPanel,
  /canManage && !module\.is_virtual \? \([\s\S]*knowledge-resource-inline-add/,
  "page creation controls must live inside real category sections and never inside the virtual cleanup bucket",
);
assert.match(
  resourcesPanel,
  /onAddPage=\{\(\) => actions\.openNewResourceModal\(section\.module\.id\)\}/,
  "inline page creation must target the category that owns the add-page row",
);
assert.match(
  resourceModuleModal,
  /Add category[\s\S]*Category name[\s\S]*Save category/,
  "resource category modal should use category terminology and only ask for a name",
);
assert.doesNotMatch(
  resourceModuleModal,
  /Description|Banner|moduleDescriptionInput|moduleBanner|Upload banner|Drop a banner image|WebCommunityBannerEditorModal/,
  "resource category modal must not expose retired module description or banner fields",
);
assert.doesNotMatch(
  resourceController,
  /moduleDescriptionInput|moduleBannerUrlInput|prepareCloudCommunityBrandingField|description_md: current\.moduleDescriptionInput|banner_storage_id: bannerField/,
  "manual resource category saves must not write retired module description or banner fields",
);
assert.doesNotMatch(
  resourcesPanel,
  /selectedModule\?\.description_md/,
  "resources header must not surface retired module descriptions",
);
assert.doesNotMatch(
  resourcesPanel,
  />\s*No pages yet\s*</,
  "empty categories should collapse to the inline add-page action instead of rendering a duplicate empty-state row",
);
assert.match(
  webResourceController,
  /openNewSourceModal[\s\S]*setResourceRoleInput\("source"\)[\s\S]*setResourceStatusInput\("review"\)/,
  "web resources controller must make new source intake land in review status",
);
assert.doesNotMatch(
  resourcesPanel,
  /actions\.openNewSourceModal/,
  "resources panel must not expose a separate source intake button in the reader header",
);
assert.doesNotMatch(
  resourcesPanel,
  /actions\.handlePublishResource\(selectedResource\)/,
  "resources panel must not expose page-level publishing from the reader",
);
assert.doesNotMatch(
  resourcesPanel,
  />\s*Publish\s*</,
  "source reader must not expose a page-level Publish action",
);
assert.match(
  resourcesPanel,
  /actions\.handleSetModuleStatus\(selectedModule, selectedModuleNextStatus\)/,
  "resources panel must expose category-level live/draft changes through the canonical module status action",
);
assert.match(
  resourceController,
  /handleSetCommunityResourceModuleStatus[\s\S]*module_status: status/,
  "web controller must patch module visibility through module_status",
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
