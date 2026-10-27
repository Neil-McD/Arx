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
const resourceEvidence = read("convex/communityResourceEvidence.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const httpMcp = read("convex/httpMcp.ts");
const attention = read("convex/communityAttention.ts");
const resourceDirectory = read("shared/communityResourceDirectory.ts");
const resourceModuleModal = read("apps/web/src/components/WebCommunityResourceModuleModal.tsx");
const resourceCourseCatalog = read("apps/web/src/components/ResourceCourseCatalog.tsx");
const resourceViewer = read("apps/web/src/components/WebCommunityResourceViewerContent.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const webCss = read("apps/web/src/index.css");
const knowledgeSourceIntake = read("apps/web/src/components/WebCommunityKnowledgeSourceIntake.tsx");
const builderKnowledgeSetup = read("apps/web/src/components/WebBuilderKnowledgeSetup.tsx");
const builderKnowledgeSetupController = read("apps/web/src/controllers/useWebBuilderKnowledgeSetupController.ts");
const builderKnowledgeSetupBackend = read("convex/communityBuilderKnowledgeSetup.ts");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const resourceContracts = read("apps/web/src/components/communityResourcesContracts.ts");
const app = read("apps/web/src/App.tsx");
const webContentController = read("apps/web/src/controllers/useWebCommunityContentController.ts");
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
assert.doesNotMatch(
  resources,
  /buildPageDraftBodyFromSource|extractDraftSummary|extractDraftKeyIdeas/,
  "the obsolete one-source page copier must remain deleted",
);
assert.doesNotMatch(
  resources,
  /createCommunityResourcePageDraftFromSource|community_resource_page_draft_from_source_retired/,
  "the retired one-source copier address must stay deleted",
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
  /saveCloudCommunityResource<SessionT, TResult = unknown>[\s\S]*return payload as TResult/,
  "web gateway must return created resource rows from resource saves",
);
assert.match(
  resourceController,
  /handleCreateBlankPageDraft[\s\S]*resource_role: "page"[\s\S]*title: "Untitled lesson"[\s\S]*module_id: moduleId[\s\S]*saveCloudCommunityResource<SessionT, ResourceT>/,
  "web resource controller must create course-owned blank lesson drafts",
);
assert.match(
  resourceController,
  /canSaveEmptyPageDraft[\s\S]*current\.editingResourceId[\s\S]*current\.resourceRoleInput === "page"[\s\S]*!description && !rawUrl && !canSaveEmptyPageDraft/,
  "inline page draft edits must allow saving a title-only draft before body content is written",
);
assert.match(
  resourceContracts,
  /handleCreateBlankPageDraft: \(moduleId: string\) => Promise<CommunityResource \| null>/,
  "resources panel contract must require a course for blank lesson creation",
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
assert.equal(existsSync("convex/communityRecentContext.ts"), false);
assert.match(
  runtimeAgentLoop,
  /executePolynetCanonicalTool/,
  "native resource access must execute through the canonical five-tool harness",
);
assert.doesNotMatch(
  runtimeAgentLoop,
  /communityRecentContext\.readCommunityRecentContextInternal/,
  "native resource access must not restore the retired community_search wrapper",
);
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
  resourceEvidence,
  /query\("communityResourceModules"[\s\S]*communityResourceIsLiveModulePage/,
  "resource evidence must filter resources through live modules",
);
assert.match(
  resourceEvidence,
  /communityResourceIsLiveModulePage\(row, new Set\(moduleById.keys\(\)\)\)/,
  "resource evidence must exclude draft modules and unusable resources",
);
assert.match(
  attention,
  /MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES = 50/,
  "resource attention must keep its recent-resource read bounded",
);
assert.match(
  attention,
  /referencedModuleIds[\s\S]*ctx\.db\.get\(moduleId[\s\S]*communityResourceIsLiveModulePage/,
  "resource attention must resolve only referenced modules before applying live-module visibility",
);
assert.doesNotMatch(
  attention,
  /query\("communityResourceModules"/,
  "resource attention must not restore the broad community-module scan",
);
assert.match(
  attention,
  /communityResourceIsLiveModulePage\(row, liveModuleIds\)/,
  "resource attention must not be triggered by draft modules or unusable resources",
);
assert.doesNotMatch(
  resourceViewer,
  /Drafted from|Original source unavailable|Open source|sourceLineage/,
  "lesson reader must not expose ingestion sources as a product category",
);
assert.doesNotMatch(
  resourceViewer,
  /resource\.directory_uri/,
  "resource viewer must not expose stable internal directory URIs in the reader UI",
);
assert.doesNotMatch(
  resourcesPanel,
  /Source Inbox|sourceResources|LEGACY_RESOURCE_MODULE_ID|Needs sorting|maintenanceCatalogItem|is_virtual/,
  "Resources must expose only real courses and their lessons",
);
assert.match(
  resourcesPanel,
  /getResourceRole\(resource\) !== "page"[\s\S]*!resource\.module_id[\s\S]*realModuleIdLookup/,
  "course navigation must omit ingestion sources and unowned legacy records",
);
assert.match(
  resourceCourseCatalog,
  /resource-course-grid[\s\S]*resource-course-create-card[\s\S]*aria-label="Add course"/,
  "manager course creation must appear as a peer card inside the course grid",
);
assert.match(
  resourcesPanel,
  /onCreate=\{canManageResources \? actions\.openNewModuleModal : null\}/,
  "the Resources catalog must gate course creation through manager mode",
);
assert.doesNotMatch(
  resourcesPanel,
  /resources-add-course-action|resources-course-edit-action|resources-module-status-action|feed-header-badge/,
  "the Resources header must not duplicate catalog or course management actions",
);
assert.doesNotMatch(
  resourcesPanel,
  /selectedModuleId \?\? selectedResource\?\.module_id/,
  "the Resources root must not infer a selected course from stale lesson state",
);
assert.match(
  resourcesPanel,
  /const \[selectedLessonId, setSelectedLessonId\] = useState<string \| null>\(null\)[\s\S]*if \(!selectedModuleSection\) return null;[\s\S]*return selectedModuleSection\.lessonResources\[0\] \?\? null/,
  "lesson selection must stay local and derive a deterministic first-lesson fallback without synchronization effects",
);
assert.doesNotMatch(
  [app, resourceContracts, webContentController].join("\n"),
  /openResourceEmbedId|setOpenResourceEmbedId/,
  "transient lesson selection must stay inside Resources instead of rerendering the application root",
);
assert.match(
  resourcesPanel,
  /handleSelectResource[\s\S]*selectedModuleId !== resource\.module_id[\s\S]*actions\.handleSelectModule\(resource\.module_id\)[\s\S]*setSelectedLessonId\(resource\.id\)/,
  "ordinary lesson switches must avoid dispatching unchanged course state to the application root",
);
assert.doesNotMatch(
  resourcesPanel,
  /pendingOpenResourceId|knowledge-resource-item-summary/,
  "Resources must not retain modal-era selection reconciliation or hidden lesson summaries",
);
assert.doesNotMatch(
  baseCss,
  /knowledge-resource-item-meta|knowledge-resource-item-summary/,
  "unused lesson metadata and hidden summary styles must be deleted",
);
assert.match(
  resourcesPanel,
  /selectedModuleSection\?\.lessonResources\.map\(renderResourceRailItem\)[\s\S]*handleAddPageDraft\(selectedModule\.id\)/,
  "lesson creation and ordering must stay scoped to the selected course",
);
assert.doesNotMatch(
  [resourcesPanel, resourceContracts, webResourceController].join("\n"),
  /openNewResourceModal|WebCommunityResourceModal|resourceModalProps/,
  "the retired resource modal must not remain reachable from the Resources product surface",
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
assert.doesNotMatch(
  resourcesPanel,
  /selectedModule\.description_md\?\.trim\(\)/,
  "selected course headers must not repeat catalog description copy above the lesson workspace",
);
assert.doesNotMatch(
  resourcesPanel,
  /Courses and durable knowledge for|resources-course-context|resource-module-status-line/,
  "Resources must not repeat catalog explanation, course identity, or status in the shell utility row",
);
assert.match(
  resourcesPanel,
  /selectedModule \? \([\s\S]*resources-back-btn[\s\S]*<span>Resources<\/span>[\s\S]*\) : \([\s\S]*resources-header">Resources<\/div>/,
  "the Resources utility row must contain only Resources context before preview controls",
);
assert.match(
  resourcesPanel,
  /resource-course-outline-header[\s\S]*resource-course-outline-title[\s\S]*\{selectedModule\.name\}[\s\S]*resource-course-outline-count/,
  "the course name must replace the generic Lessons label in the outline heading",
);
assert.match(
  baseCss,
  /\.resource-course-outline-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*overflow:\s*hidden;[\s\S]*\.resource-course-outline-title\s*\{[^}]*width:\s*100%;[^}]*text-overflow:\s*ellipsis;/,
  "long course names must stay contained inside the lesson outline",
);
assert.match(
  webCss,
  /\.community-utility-panel\s*\{[^}]*gap:\s*10px;[^}]*padding:\s*0 24px 24px;/,
  "desktop Resources must reuse the shell top band instead of stacking blanket top padding",
);
assert.match(
  read("apps/web/src/components/CommunityResourcesPanel.tsx"),
  /className="community-panel community-utility-panel resources-panel"/,
  "Resources must use the shared utility-panel spacing",
);
assert.match(
  webCss,
  /\.community-utility-panel > \.feed-header-row\s*\{[^}]*min-height:\s*var\(--web-topbar-height\);[^}]*padding-right:\s*var\(--web-topbar-right-action-safe-inset\);/,
  "the Resources utility row must reserve the canonical floating DM action inset",
);
assert.match(
  baseCss,
  /\.resource-course-catalog\s*\{[^}]*margin:\s*0;[^}]*padding:\s*8px 0 34px;/,
  "the course catalog must align to the Resources heading without redundant nested gutters",
);
assert.match(
  resourcesPanel,
  /"No lessons yet"/,
  "empty courses must explain the next authoring action",
);
assert.match(
  resourcesPanel,
  /ResourceCourseCatalog[\s\S]*items=\{courseCatalogItems\}/,
  "the Resources root must render canonical course cards",
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
  resourceCourseCatalog,
  /Move to top|Move to bottom|ChevronsUp|ChevronsDown/,
  "course ordering must not retain redundant top and bottom accelerators",
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
assert.doesNotMatch(
  resourcesPanel,
  /WebCommunityKnowledgeSourceIntake|showSourceIntake|resources-source-intake-action/,
  "the course presentation must not expose source intake as a primary Resources action",
);
assert.match(
  builderKnowledgeSetup,
  /WebCommunityKnowledgeSourceIntake[\s\S]*onAddSources=\{props\.onAddSources\}/,
  "builder onboarding must retain the canonical source intake path",
);
assert.match(
  knowledgeSourceIntake,
  /Seed your knowledge[\s\S]*Add and read sources/,
  "builder onboarding source intake must support canonical links and files",
);
assert.doesNotMatch(
  knowledgeSourceIntake,
  /Build my resources|onBuildResources|isBuildingResources/,
  "source intake must not retain the retired agent-prompt resource launcher",
);
assert.doesNotMatch(
  builderKnowledgeSetup,
  /later from Resources/,
  "builder onboarding must not promise a source intake action removed from Resources",
);
assert.doesNotMatch(
  resourceContracts,
  /handleBuildCommunityResources/,
  "resource contracts must expose no parallel onboarding build path",
);
assert.match(
  builderKnowledgeSetupController,
  /mode === "build"[\s\S]*buildCloudBuilderKnowledgeResources[\s\S]*completeCloudBuilderKnowledgeSetup/,
  "Builder Next must use the canonical server build while Skip remains inference-free",
);
assert.match(
  builderKnowledgeSetupBackend,
  /claimBuilderKnowledgeBuildInternal[\s\S]*builderKnowledgeBuildLeaseToken[\s\S]*builder_knowledge_build_in_progress/,
  "Builder resource generation must have one durable community-scoped lease",
);
assert.match(
  builderKnowledgeSetupBackend,
  /buildBuilderKnowledgeResources[\s\S]*runCommunityWikiArchitectProposal[\s\S]*applyBuilderKnowledgeArchitectureInternal[\s\S]*draftCommunityResourceContentFromSources[\s\S]*completeBuilderKnowledgeBuildInternal/,
  "Builder Next must sequence the canonical Architect and Writer before completing onboarding",
);
assert.doesNotMatch(
  builderKnowledgeSetupBackend,
  /communityResourceBuilderChangesets|polynet_write|memberAgent/,
  "canonical onboarding generation must not retain the agent changeset detour",
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
  resourceCourseCatalog,
  /onSetStatus\(isDraft \? "live" : "draft"\)[\s\S]*Make live[\s\S]*Move to draft/,
  "the course card menu must own the canonical module status action",
);
assert.match(
  baseCss,
  /\.resource-course-outline \.knowledge-resource-item\.is-active[\s\S]*var\(--stroke-selected\)[\s\S]*var\(--surface-selected\)[\s\S]*var\(--text-selected\)/,
  "selected lessons must reuse the canonical navigation selection tokens",
);
assert.match(
  resourcesPanel,
  /resource-course-outline-scroll[\s\S]*knowledge-resource-list[\s\S]*lessonResources\.map\(renderResourceRailItem\)/,
  "course lessons must remain inside one bounded outline scroller",
);
assert.match(
  baseCss,
  /\.resource-course-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(196px,\s*232px\)\s*minmax\(0,\s*1fr\)/,
  "desktop course layout must prioritize lesson content over outline width",
);
assert.match(
  baseCss,
  /\.resource-course-outline\s*\{[^}]*position:\s*sticky;[^}]*top:\s*12px;[^}]*max-height:\s*calc\(100dvh - 24px\)/,
  "desktop course outline must remain reachable through native sticky positioning",
);
assert.match(
  baseCss,
  /\.resource-course-outline-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain/,
  "long course outlines must scroll within their bounded sticky rail",
);
assert.match(
  baseCss,
  /@media \(max-width:\s*900px\)[\s\S]*\.resource-course-outline\s*\{[^}]*position:\s*static;[^}]*max-height:\s*none;[\s\S]*\.resource-course-outline-scroll\s*\{[^}]*overflow:\s*visible;/,
  "mobile course outlines must preserve the existing static single-column flow",
);
assert.doesNotMatch(
  resourcesPanel,
  /addEventListener\(["']scroll["']|onscroll\s*=|position:\s*fixed/,
  "course outline reachability must not introduce JavaScript scroll state or fixed positioning",
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
  /handleMoveResource[\s\S]*moveOrderedId\(reorderableIds, resourceId, direction\)[\s\S]*actions\.handleReorderResources\(moduleSelectionId, nextIds\)/,
  "lesson move commands must reuse the canonical shared lesson reorder action",
);
assert.match(
  resourcesPanel,
  />Move up<[\s\S]*>Move to top<[\s\S]*>Move down<[\s\S]*>Move to bottom</,
  "owner menus must expose reliable non-drag reorder controls",
);
assert.doesNotMatch(
  resourcesPanel,
  /knowledge-resource-item-icon|function PlayIcon|function ResourceKindIcon/,
  "lesson rows must stay irreducibly simple without decorative media-kind icons",
);
assert.doesNotMatch(
  baseCss,
  /\.knowledge-resource-item-icon/,
  "lesson-row styles must not reserve a hidden icon column",
);
assert.match(
  baseCss,
  /\.knowledge-resource-item-main \{[\s\S]*display: block/,
  "lesson-row main controls must collapse to a single copy column after icon removal",
);
assert.match(
  resourcesPanel,
  /reorderableResourceIdsByModule[\s\S]*moduleSections[\s\S]*section\.lessonResources\.map\(\(resource\) => resource\.id\)/,
  "resources panel reorder payload must contain only course lessons",
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
  /export const moveCommunityResourceToModule[\s\S]*requireResourceModuleForRole[\s\S]*destinationRows[\s\S]*resourceModuleIdentity\(row\.moduleId\) === targetModuleIdentity[\s\S]*normalizeResourceRole\(row\.role\) === "page"[\s\S]*beforeResourceId/,
  "cross-category resource moves must validate the target module and insert only within the target page list",
);
assert.match(
  resources,
  /requireResourceModuleForRole[\s\S]*args\.role === "page" && !moduleId[\s\S]*community_resource_course_required/,
  "every lesson write must fail closed without a real course",
);
assert.match(
  resources,
  /export const deleteCommunityResourceModule[\s\S]*const lessons = resources\.filter[\s\S]*revokeCommunityResourceMemoryProjection[\s\S]*deleteCommunityResourceBodyContent[\s\S]*ctx\.db\.delete\(lesson\._id[\s\S]*detachedIngestionSources/,
  "course deletion must delete lessons while preserving hidden ingestion evidence",
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
assert.doesNotMatch(
  resourcesPanel,
  /PAGE_DRAFT_CREATION_GESTURE_LOCK_MS|remainingGestureLockMs|setTimeout\(resolve/,
  "page draft creation must not retain an artificial delay after acquiring its immediate single-flight boundary",
);
assert.doesNotMatch(
  `${resourcesPanel}\n${resourceContracts}\n${webResourceController}`,
  /handleCreatePageDraftFromSource/,
  "the web Resources surface must not retain source-to-lesson controls",
);

console.log("PASS: community resources knowledge contract is canonical.");
