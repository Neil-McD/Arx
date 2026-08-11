import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const communityMaintenance = read("convex/communityMaintenance.ts");
const recentContext = read("convex/communityRecentContext.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const httpMcp = read("convex/httpMcp.ts");
const attention = read("convex/communityAttention.ts");
const emailDigests = read("convex/emailDigests.ts");
const resourceDirectory = read("shared/communityResourceDirectory.ts");
const resourceModal = read("apps/web/src/components/WebCommunityResourceModal.tsx");
const resourceModuleModal = read("apps/web/src/components/WebCommunityResourceModuleModal.tsx");
const resourceCourseCatalog = read("apps/web/src/components/ResourceCourseCatalog.tsx");
const resourceViewer = read("apps/web/src/components/WebCommunityResourceViewerModal.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const knowledgeSourceIntake = read("apps/web/src/components/WebCommunityKnowledgeSourceIntake.tsx");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const resourceContracts = read("apps/web/src/components/communityResourcesContracts.ts");
const resourceController = read("shared/useCommunityResourceController.ts");
const resourceEditorController = read("shared/useCommunityResourceEditorController.ts");
const webResourceController = read("apps/web/src/controllers/useWebCommunityResourceUiController.ts");
const resourceGateway = read("shared/cloudCommunityAdminGateway.ts");

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
assert.doesNotMatch(
  resourceViewer,
  /document\.addEventListener\("pointerdown"/,
  "resource editing must not use a document-wide pointer handler that can discard dirty input before Save runs",
);
assert.match(
  resourceViewer,
  /resource-viewer-edit-actions[\s\S]*onClick=\{\(\) => editor\.onCancel\(\)\}[\s\S]*Cancel[\s\S]*onClick=\{\(\) => void editor\.onSave\(\)\}[\s\S]*Save changes/,
  "resource editing must expose explicit Cancel and Save actions that invoke the canonical editor callbacks",
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
  /backfillCommunityResourceModuleStatusesInternal[\s\S]*syncResourceMemoryProjectionsForModule/,
  "module status backfill must resync resource memory projections after canonicalizing visibility",
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
  /api\.communityResources\.createCommunityResourcePageDraftFromSource/,
  "web gateway must call the canonical source-to-page draft mutation",
);
assert.match(
  resourceGateway,
  /saveCloudCommunityResource<SessionT, TResult = unknown>[\s\S]*return payload as TResult/,
  "web gateway must return created resource rows from resource saves",
);
assert.match(
  resourceController,
  /handleCreatePageDraftFromSource[\s\S]*createCloudCommunityResourcePageDraftFromSource/,
  "web resource controller must expose source-to-page draft creation",
);
assert.match(
  resourceController,
  /handleCreateBlankPageDraft[\s\S]*resource_role: "page"[\s\S]*title: "Untitled page"[\s\S]*saveCloudCommunityResource<SessionT, ResourceT>/,
  "web resource controller must create blank page drafts without opening the add-page modal",
);
assert.match(
  resourceController,
  /canSaveEmptyPageDraft[\s\S]*current\.editingResourceId[\s\S]*current\.resourceRoleInput === "page"[\s\S]*!description && !rawUrl && !canSaveEmptyPageDraft/,
  "inline page draft edits must allow saving a title-only draft before body content is written",
);
assert.match(
  resourceContracts,
  /handleCreateBlankPageDraft: \(moduleId\?: string \| null\) => Promise<CommunityResource \| null>/,
  "resources panel contract must expose blank page draft creation",
);
assert.match(
  webResourceController,
  /handleCreateBlankPageDraft/,
  "web resource UI controller must pass through blank page draft creation",
);
assert.match(
  resourcesPanel,
  /handleAddPageDraft[\s\S]*runPageDraftCreation[\s\S]*handleCreateBlankPageDraft[\s\S]*beginInlineEditResource\(created\)[\s\S]*setActiveResourceEditField\("title"\)/,
  "add-page clicks must create an inline-editable draft page instead of opening the modal",
);
assert.match(
  resourcesPanel,
  /selectedResource \? getResourceRole\(selectedResource\) === "page" : false[\s\S]*actions\.resourceEditor\.bodyInput\.trim\(\)\.length > 0/,
  "inline page drafts must be saveable before body text exists",
);
assert.match(
  resourcesPanel,
  /knowledge-resource-inline-add[\s\S]*disabled=\{isCreatingPageDraft\}[\s\S]*handleAddPageDraft\(selectedModule\.id\)/,
  "add-page draft creation must guard duplicate clicks while the draft is being created",
);
assert.match(
  resourceViewer,
  /resource-viewer-empty-edit-trigger/,
  "inline editor must let creators move from title editing into the empty body editor without canceling",
);
assert.doesNotMatch(
  resourcesPanel,
  /onAddPage=\{\(\) => actions\.openNewResourceModal/,
  "resources rail add-page control must not route through the old modal",
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

assert.equal(existsSync("convex/communityArchive.ts"), false, "archive-named runtime wrapper must stay deleted");
assert.equal(existsSync("convex/communityArchiveRetrieval.ts"), false, "archive retrieval wrapper must stay deleted");
assert.match(recentContext, /retrieval_version: "recent_context_v2"/);
assert.match(runtimeAgentLoop, /communityRecentContext\.readCommunityRecentContextInternal/);
assert.match(
  httpMcp,
  /executePolynetCanonicalTool/,
  "official MCP resource access must execute through the canonical five-tool harness",
);
assert.doesNotMatch(
  httpMcp,
  /communityRecentContext|archive_context/,
  "official MCP must not restore the private prompt-context or retired archive wire models",
);
assert.equal(
  existsSync("convex/communityArchiveEmbeddingPipeline.ts"),
  false,
  "the embedding worker module must remain deleted",
);
assert.equal(
  existsSync("convex/communityArchiveShared.ts"),
  false,
  "embedding-only shared constants must remain deleted",
);
for (const surface of [communityMaintenance, resourceGateway]) {
  assert.doesNotMatch(
    surface,
    /getCommunityArchiveHealth|processCommunityArchivePending|retryCommunityArchiveFailures/,
    "embedding worker administration must not remain callable",
  );
}
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
  /Add page[\s\S]*Save a durable page for the community knowledge base[\s\S]*Save page/,
  "manual add-page modal must present as page-only",
);
assert.doesNotMatch(
  resourceModal,
  /resource-kind-segment|Knowledge item kind|onChangeRole|>\s*Page\s*<[\s\S]*>\s*Source\s*</,
  "manual add-page modal must not expose the retired page/source selector",
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
  /selectedModuleSection\?\.sourceResources[\s\S]*Source Inbox/,
  "selected courses must keep builder sources in a separate manager-only source inbox",
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
  /courseCatalogItems[\s\S]*!section\.module\.is_virtual/,
  "virtual unsorted cleanup must stay outside the normal course catalog",
);
assert.match(
  resourcesPanel,
  /maintenanceCatalogItem[\s\S]*module\.is_virtual/,
  "virtual unsorted cleanup must use a separate maintenance entry",
);
assert.match(
  resourcesPanel,
  /resources-add-course-action[\s\S]*openNewModuleModal[\s\S]*Add course/,
  "course creation must have one explicit Resources header action",
);
assert.doesNotMatch(
  resourcesPanel,
  /selectedModuleId \?\? selectedResource\?\.module_id/,
  "the Resources root must not infer a selected course from stale lesson state",
);
assert.match(
  resourcesPanel,
  /if \(!selectedModule\) \{[\s\S]*actions\.setOpenResourceEmbedId\(null\)[\s\S]*return/,
  "the Resources root must stay on the course catalog instead of auto-opening the first course",
);
assert.match(
  resourcesPanel,
  /selectedModuleSection\?\.pageResources\.map\(renderResourceRailItem\)[\s\S]*handleAddPageDraft\(selectedModule\.id\)/,
  "lesson creation and ordering must stay scoped to the selected course",
);
assert.match(
  webResourceController,
  /openNewResourceModal[\s\S]*setResourceRoleInput\("page"\)[\s\S]*setResourceStatusInput\("draft"\)/,
  "manual new-resource modal fallback must force page role and draft status",
);
assert.match(
  resourceModuleModal,
  /Add course[\s\S]*Course name[\s\S]*Description[\s\S]*Course cover[\s\S]*Save course/,
  "course authoring must expose the presentation metadata used by catalog cards",
);
assert.match(
  resourceModuleModal,
  /StableFramedMedia[\s\S]*WebCommunityBannerEditorModal/,
  "course cover authoring must reuse canonical framed media and focus controls",
);
assert.match(
  resourceController,
  /prepareCloudCommunityBrandingField[\s\S]*description_md: current\.moduleDescriptionInput\.trim\(\) \|\| null[\s\S]*banner_storage_id: bannerField\.storageId \?\? null/,
  "course saves must persist description and canonicalized cover metadata",
);
assert.match(
  resourcesPanel,
  /selectedModule\.description_md\?\.trim\(\)/,
  "selected course headers must surface the course description",
);
assert.match(
  resourcesPanel,
  />\s*No lessons yet\s*</,
  "empty courses must explain the next authoring action",
);
assert.match(
  resourcesPanel,
  /ResourceCourseCatalog[\s\S]*items=\{courseCatalogItems\}[\s\S]*maintenanceItem=\{maintenanceCatalogItem\}/,
  "the Resources root must render canonical course cards and a separate cleanup entry",
);
assert.match(
  resourceCourseCatalog,
  /<article[\s\S]*resource-course-card-menu-trigger[\s\S]*resource-course-card-main/,
  "course cards must use a semantic article with separate navigation and manager controls",
);
assert.doesNotMatch(
  resourceCourseCatalog,
  /<button[^>]*resource-course-card-main[\s\S]*resource-course-card-menu-trigger[\s\S]*<\/button>/,
  "course cards must not nest manager controls inside the navigation button",
);
assert.doesNotMatch(
  `${webResourceController}\n${resourceContracts}\n${resourcesPanel}`,
  /openNewSourceModal/,
  "resources must not keep the retired modal-based source intake path",
);
assert.match(
  resourceController,
  /handleAddCommunitySources[\s\S]*uploadCloudCommunityResourceSourceFile[\s\S]*saveCloudCommunityResource[\s\S]*ingestCloudCommunitySources/,
  "source intake must reuse the canonical upload, resource save, and ingestion gateways",
);
assert.match(
  resourcesPanel,
  /WebCommunityKnowledgeSourceIntake[\s\S]*onAddSources=\{actions\.handleAddCommunitySources\}/,
  "manager-empty resources must wire the canonical source intake to the resource controller",
);
assert.match(
  knowledgeSourceIntake,
  /Seed your knowledge[\s\S]*Add and read sources/,
  "manager-empty resources must expose one canonical link and file source intake",
);
assert.match(
  knowledgeSourceIntake,
  /readySources\.length > 0[\s\S]*Build my resources/,
  "ready sources must expose one explicit Resources Architect launch action",
);
assert.match(
  resourcesPanel,
  /readySources=\{readySources\}[\s\S]*onBuildResources=\{actions\.handleBuildCommunityResources\}/,
  "resource launch must receive only canonical ready source records",
);
assert.match(
  resourceContracts,
  /handleBuildCommunityResources:[\s\S]*communityId: string[\s\S]*readySources:/,
  "resource launch must stay bound to one community and an explicit ready-source set",
);
assert.match(
  resourceController,
  /sourceIntakeInFlightRef[\s\S]*if \(sourceIntakeInFlightRef\.current\) return null/,
  "source intake must reject duplicate in-flight submissions synchronously",
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
  "resources panel must expose course-level live/draft changes through the canonical module status action",
);
assert.match(
  resourcesPanel,
  /MODULE_DRAG_MIME[\s\S]*RESOURCE_DRAG_MIME[\s\S]*RESOURCE_ORIGIN_MODULE_DRAG_MIME/,
  "resources panel drag/drop must use explicit internal drag metadata, not only a generic text payload",
);
assert.match(
  resourcesPanel,
  /draggingModuleIdRef[\s\S]*draggingResourceIdRef[\s\S]*draggingResourceModuleIdRef/,
  "resources panel drag/drop must keep ref-backed drag state so owner reorder does not depend only on async React state",
);
assert.match(
  `${resourceCourseCatalog}\n${resourcesPanel}`,
  /resource-course-card-drag[\s\S]*GripVertical[\s\S]*knowledge-resource-drag-handle/,
  "resources must expose visible grab handles for course and lesson reordering",
);
assert.match(
  resourcesPanel,
  /function moveOrderedId\(ids: string\[\], id: string, direction: ReorderDirection\)/,
  "resources panel must provide non-drag reorder commands for touch and keyboard-adjacent owner workflows",
);
assert.match(
  resourcesPanel,
  /handleMoveModule[\s\S]*moveOrderedId\(reorderableModuleIds, moduleId, direction\)[\s\S]*actions\.handleReorderModules\(nextIds\)/,
  "course move commands must reuse the canonical shared module reorder action",
);
assert.match(
  resourcesPanel,
  /handleMoveResource[\s\S]*moveOrderedId\(reorderableIds, resourceId, direction\)[\s\S]*actions\.handleReorderResources\(moduleId, nextIds\)/,
  "page move commands must reuse the canonical shared page reorder action",
);
assert.match(
  resourcesPanel,
  />Move up<[\s\S]*>Move to top<[\s\S]*>Move down<[\s\S]*>Move to bottom</,
  "owner menus must expose reliable non-drag reorder controls",
);
assert.match(
  resourcesPanel,
  /reorderableResourceIdsByModule[\s\S]*moduleSections[\s\S]*section\.pageResources\.map\(\(resource\) => resource\.id\)/,
  "resources panel reorder payload must be page-only because sources are intake material, not member-facing page order",
);
assert.match(
  resources,
  /export const reorderCommunityResources[\s\S]*resourceModuleIdentity\(row\.moduleId\) === targetModuleIdentity[\s\S]*normalizeResourceRole\(row\.role\) === "page"[\s\S]*const existingIds = new Set\(scopedRows\.map/,
  "resource reorder validation must match the page-only UI payload and ignore source inbox rows",
);
assert.match(
  resources,
  /export const moveCommunityResourceToModule[\s\S]*normalizeResourceRole\(resource\.role\) !== "page"[\s\S]*community_resource_move_requires_page/,
  "cross-category resource moves must be page-only and must not move source inbox rows",
);
assert.match(
  resources,
  /export const moveCommunityResourceToModule[\s\S]*requireValidResourceModule[\s\S]*destinationRows[\s\S]*resourceModuleIdentity\(row\.moduleId\) === targetModuleIdentity[\s\S]*normalizeResourceRole\(row\.role\) === "page"[\s\S]*beforeResourceId/,
  "cross-category resource moves must validate the target module and insert only within the target page list",
);
assert.match(
  resourceGateway,
  /moveCloudCommunityResourceToModule[\s\S]*communityResources:moveCommunityResourceToModule[\s\S]*targetModuleId[\s\S]*beforeResourceId/,
  "web gateway must call the canonical cross-category resource move mutation",
);
assert.match(
  resourceController,
  /handleMoveCommunityResourceToModule[\s\S]*moveCloudCommunityResourceToModule[\s\S]*loadCommunityResources/,
  "shared resource controller must expose cross-category moves through the canonical reload path",
);
assert.match(
  resourceContracts,
  /handleMoveResourceToModule: \([\s\S]*resourceId: string[\s\S]*targetModuleId: string \| null[\s\S]*beforeResourceId\?: string \| null/,
  "resource panel action contract must include cross-category page moves",
);
assert.match(
  webResourceController,
  /handleMoveResourceToModule: handleMoveCommunityResourceToModule/,
  "web resource UI controller must wire cross-category page moves into panel actions",
);
assert.match(
  resourcesPanel,
  /handleResourceDrop[\s\S]*draggedResourceModuleId !== moduleSelectionId[\s\S]*actions\.handleMoveResourceToModule\(draggedId, moduleId, resource\.id\)/,
  "dropping a lesson on a lesson in another course must move it before that target lesson",
);
assert.match(
  resourcesPanel,
  /handleModuleDrop[\s\S]*draggedResourceId[\s\S]*actions\.handleMoveResourceToModule\(draggedResourceId, targetModuleId, null\)/,
  "dropping a lesson on a course must append it to that course",
);
assert.match(
  baseCss,
  /\.knowledge-resource-item\.can-reorder \{[\s\S]*grid-template-columns: 14px minmax\(0, 1fr\) auto/,
  "lesson reorder handles must have a stable outline column",
);
assert.match(
  resourceController,
  /handleSetCommunityResourceModuleStatus[\s\S]*module_status: status/,
  "web controller must patch module visibility through module_status",
);
assert.match(
  resourcesPanel,
  /const pageDraftCreationInFlightRef = useRef\(false\)/,
  "page draft creation must own one immediate ref-backed single-flight boundary",
);
assert.match(
  resourcesPanel,
  /runPageDraftCreation[\s\S]*pageDraftCreationInFlightRef\.current[\s\S]*setIsCreatingPageDraft\(true\)[\s\S]*finally[\s\S]*pageDraftCreationInFlightRef\.current = false[\s\S]*setIsCreatingPageDraft\(false\)/,
  "page draft creation must acquire immediately and release its UI boundary on every outcome",
);
assert.match(
  resourcesPanel,
  /PAGE_DRAFT_CREATION_GESTURE_LOCK_MS = 650[\s\S]*remainingGestureLockMs = Math\.max\([\s\S]*PAGE_DRAFT_CREATION_GESTURE_LOCK_MS - \(Date\.now\(\) - lockStartedAt\)[\s\S]*setTimeout\(resolve, remainingGestureLockMs\)[\s\S]*pageDraftCreationInFlightRef\.current = false/,
  "page draft creation must keep its lock through one full browser gesture even when the backend returns between clicks",
);
assert.match(
  resourcesPanel,
  /handleCreatePageDraftFromSource[\s\S]*runPageDraftCreation[\s\S]*actions\.handleCreatePageDraftFromSource\(resource\)/,
  "resources panel must expose source-to-page draft creation from the reader",
);
assert.match(
  resourcesPanel,
  /onClick=\{\(\) => void handleCreatePageDraftFromSource\(selectedResource\)\}[\s\S]*disabled=\{isCreatingPageDraft\}[\s\S]*isCreatingPageDraft \? "Creating\.\.\." : "Draft page"/,
  "source reader draft action must expose and enforce its single-flight state",
);

console.log("PASS: community resources knowledge contract is canonical.");
