import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const resources = read("convex/communityResources.ts");
const schema = read("convex/schema.ts");
const community = read("convex/community.ts");
const experience = read("convex/communityExperience.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const launchModal = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const app = read("apps/web/src/App.tsx");
const runtimeTimeline = read("apps/web/src/components/RuntimeLiveTimeline.tsx");
const mutationEvents = read("shared/communityResourceMutationEvents.ts");
const toolRegistry = read("shared/toolRegistry.ts");

assert.match(
  packageJson,
  /"check:community-resource-builder-tools-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_resource_builder_tools_contract_proof\.ts"/,
  "builder resource tool contract proof should be wired into package scripts",
);

for (const exportName of [
  "listCommunityResourceBuilderDirectory",
  "readCommunityResourceBuilderResource",
  "writeCommunityResourceBuilderResource",
  "editCommunityResourceBuilderResource",
  "getCommunityResourceBuilderHealth",
  "ensureCommunityResourceWikiScaffold",
  "stageCommunityResourceBuilderChangeset",
  "getCommunityResourceBuilderChangesetStatus",
  "approveCommunityResourceBuilderChangeset",
  "rejectCommunityResourceBuilderChangeset",
  "applyCommunityResourceBuilderChangeset",
] as const) {
  assert.match(resources, new RegExp(`export const ${exportName} = (query|mutation)\\(`));
  assert.match(community, new RegExp(`export const ${exportName} = ${exportName}Impl`));
  assert.match(experience, new RegExp(`${exportName}`));
}

assert.match(
  resources,
  /listCommunityResourceBuilderDirectory[\s\S]*await requireCommunityManager/,
  "builder list must be owner/admin/manager gated",
);
assert.match(
  resources,
  /readCommunityResourceBuilderResource[\s\S]*await requireCommunityManager/,
  "builder read must be owner/admin/manager gated",
);
assert.match(
  resources,
  /writeCommunityResourceBuilderResource[\s\S]*await requireCommunityManager/,
  "builder write must be owner/admin/manager gated",
);
assert.match(
  resources,
  /editCommunityResourceBuilderResource[\s\S]*await requireCommunityManager/,
  "builder edit must be owner/admin/manager gated",
);
assert.match(
  resources,
  /getCommunityResourceBuilderHealth[\s\S]*await requireCommunityManager/,
  "builder health must be owner/admin/manager gated",
);
assert.match(
  resources,
  /stageCommunityResourceBuilderChangeset[\s\S]*await requireCommunityManager/,
  "changeset staging must be owner/admin/manager gated",
);
assert.match(
  resources,
  /approveCommunityResourceBuilderChangeset[\s\S]*await requireCommunityManager/,
  "changeset approval must be owner/admin/manager gated",
);
assert.match(
  resources,
  /rejectCommunityResourceBuilderChangeset[\s\S]*await requireCommunityManager/,
  "changeset rejection must be owner/admin/manager gated",
);
assert.match(
  resources,
  /applyCommunityResourceBuilderChangeset[\s\S]*await requireCommunityManager/,
  "changeset apply must be owner/admin/manager gated",
);

assert.match(
  schema,
  /communityResourceBuilderChangesets:[\s\S]*status: v\.union\([\s\S]*v\.literal\("staged"\)[\s\S]*v\.literal\("approved"\)[\s\S]*v\.literal\("applied"\)[\s\S]*operations: v\.array\(v\.any\(\)\)[\s\S]*preflight: v\.any\(\)[\s\S]*approvedAt: v\.optional\(v\.number\(\)\)[\s\S]*approvedByUserId: v\.optional\(v\.id\("users"\)\)[\s\S]*rejectedAt: v\.optional\(v\.number\(\)\)[\s\S]*rejectedByUserId: v\.optional\(v\.id\("users"\)\)/,
  "changesets should persist explicit approval/rejection state separately from resource rows",
);

assert.match(
  resources,
  /const role = kind === "source" \? "source" : "page"[\s\S]*defaultStatus: role === "source" \? "review" : "draft"/,
  "builder writes should default sources to review and pages to draft",
);
assert.match(
  resources,
  /if \(next === "published"\)[\s\S]*community_resource_page_status_deprecated/,
  "builder tools should reject page-level publish writes",
);
assert.match(
  resources,
  /normalizeChangesetPageStatus[\s\S]*community_resource_changeset_publish_deferred/,
  "changeset v1 should not allow publishing as part of the staged patch",
);
assert.match(
  resources,
  /requireExpectedUpdatedAt[\s\S]*community_resource_edit_conflict/,
  "builder edits should enforce optimistic concurrency",
);
assert.match(
  resources,
  /source_resource_id[\s\S]*community_source_resource_required/,
  "builder writes/edits should validate source lineage points to a source resource",
);

const builderEditBody = resources.slice(
  resources.indexOf("export const editCommunityResourceBuilderResource"),
  resources.indexOf("export const getCommunityResourceBuilderHealth"),
);
assert.ok(builderEditBody.length > 0, "builder edit body should be discoverable");
assert.doesNotMatch(
  builderEditBody,
  /resource_role/,
  "builder edit should not allow changing resource role identity",
);

for (const healthKey of [
  "emptyModules",
  "sparsePages",
  "pagesWithoutSourceLineage",
  "unreferencedSources",
  "staleDrafts",
] as const) {
  assert.match(
    resources,
    new RegExp(`${healthKey}:`),
    `health output should include ${healthKey}`,
  );
}
assert.match(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS/,
  "health check should have deterministic sparse page threshold",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS/,
  "health check should have deterministic stale draft threshold",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT = 50/,
  "builder list should default to a compact directory payload",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT = 250/,
  "builder list should have a hard max suited for context budgeting",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT = 50/,
  "builder health should cap per-bucket issue samples",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES/,
  "health check should know the default wiki modules",
);
assert.match(
  resources,
  /missing_default_modules: missingDefaultModules/,
  "health summary should expose missing default modules",
);
assert.match(
  resources,
  /missing_scaffold_pages: missingScaffoldPages/,
  "health summary should expose missing scaffold pages",
);
assert.match(
  resources,
  /issue_counts: issueTotals/,
  "health summary should preserve complete issue counts when issue arrays are capped",
);
assert.match(
  resources,
  /issues_truncated:/,
  "health summary should reveal when issue samples are capped",
);
assert.match(
  resources,
  /listCommunityResourceBuilderDirectory[\s\S]*health: await buildCommunityResourceBuilderHealthReport/,
  "builder list should include the deterministic health summary",
);
assert.match(
  resources,
  /getCommunityResourceBuilderScaffoldPageKey/,
  "health should use the shared scaffold page key helper",
);
assert.match(
  resources,
  /sparsePages:[\s\S]*!isBuilderScaffoldPageTitle\(page\.title\)/,
  "health check should not flag default scaffold pages as sparse placeholders",
);
assert.match(
  resources,
  /pagesWithoutSourceLineage:[\s\S]*!isBuilderScaffoldPageTitle\(page\.title\)/,
  "health check should not flag default scaffold pages as missing source lineage",
);
assert.match(
  resources,
  /emptyModules:[\s\S]*!isBuilderDefaultModuleName\(module\.name\)/,
  "health check should not flag intentionally empty default modules",
);
assert.match(
  resources,
  /ensureCommunityResourceWikiScaffold[\s\S]*COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES[\s\S]*COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES/,
  "scaffold creation should use shared default module/page constants",
);
assert.match(
  resources,
  /modules_created[\s\S]*pages_created[\s\S]*health: await buildCommunityResourceBuilderHealthReport/,
  "scaffold creation should return summary and fresh health",
);
assert.match(
  gateway,
  /getCloudCommunityResourceBuilderHealth[\s\S]*community:getCommunityResourceBuilderHealth/,
  "gateway should expose builder health to the launch modal",
);
assert.match(
  gateway,
  /ensureCloudCommunityResourceWikiScaffold[\s\S]*community:ensureCommunityResourceWikiScaffold/,
  "gateway should expose scaffold creation to the launch modal",
);
assert.doesNotMatch(
  gateway,
  /writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource/,
  "raw builder write/edit tools should not be exposed through the frontend gateway yet",
);
assert.match(
  app,
  /resource_role: "source"[\s\S]*resource_status: "review"[\s\S]*source_ingestion_status: "queued"[\s\S]*source_ingestion_kind: "url"/,
  "launch knowledge links should enter as reviewed URL sources queued for ingestion rather than published pages",
);
assert.doesNotMatch(
  launchModal,
  /Create drafts/,
  "knowledge modal should not expose a raw scaffold action on the collection screen",
);
assert.match(
  launchModal,
  /onEnsureKnowledgeScaffold[\s\S]*onGenerateKnowledgePlan/,
  "knowledge modal should run scaffold creation internally before generating a wiki plan",
);
assert.match(
  launchModal,
  /missing_scaffold_pages/,
  "knowledge modal should account for missing scaffold pages, not only missing modules",
);
assert.match(
  launchModal,
  /await onAddKnowledgeLink[\s\S]*await onIngestKnowledgeSources\(\)[\s\S]*await onLoadKnowledgeHealth/,
  "knowledge modal should ingest source links before refreshing health",
);

const builderListBody = resources.slice(
  resources.indexOf("export const listCommunityResourceBuilderDirectory"),
  resources.indexOf("export const readCommunityResourceBuilderResource"),
);
assert.ok(builderListBody.length > 0, "builder list body should be discoverable");
assert.doesNotMatch(
  builderListBody,
  /communityResourceIsLiveModulePage/,
  "builder directory should not reuse member live-only filtering",
);
assert.doesNotMatch(
  builderListBody,
  /mapCommunityResourceRow|body_md|bodyMd/,
  "builder directory list must stay compact and must not expose full resource bodies",
);
assert.match(
  builderListBody,
  /mapCompactCommunityResourceBuilderListRow/,
  "builder directory list should use the compact list-row mapper",
);
assert.match(
  builderListBody,
  /truncated: resources\.length > limit/,
  "builder directory list should report truncation",
);
assert.match(
  toolRegistry,
  /COMMUNITY_RESOURCE_BUILDER_LIST_TOOL_SCHEMA[\s\S]*maximum: 250/,
  "builder list tool schema should cap requested list size at 250",
);
assert.match(
  toolRegistry,
  /community_resource_builder_list limit", 1, 250/,
  "builder list argument normalization should cap list size at 250",
);
assert.match(
  toolRegistry,
  /community_resource_builder_stage_changeset[\s\S]*COMMUNITY_RESOURCE_BUILDER_STAGE_CHANGESET_TOOL_SCHEMA/,
  "stage changeset tool should be registered",
);
assert.match(
  toolRegistry,
  /COMMUNITY_RESOURCE_BUILDER_CHANGESET_OPERATION_TOOL_SCHEMA[\s\S]*additionalProperties: false[\s\S]*items: COMMUNITY_RESOURCE_BUILDER_CHANGESET_OPERATION_TOOL_SCHEMA/,
  "stage changeset operation items must stay strict-provider compatible",
);
assert.doesNotMatch(
  toolRegistry,
  /COMMUNITY_RESOURCE_BUILDER_STAGE_CHANGESET_TOOL_SCHEMA[\s\S]*additionalProperties: true[\s\S]*COMMUNITY_RESOURCE_BUILDER_APPLY_CHANGESET_TOOL_SCHEMA/,
  "stage changeset schema must not expose loose nested operation objects",
);
assert.match(
  toolRegistry,
  /community_resource_builder_apply_changeset[\s\S]*COMMUNITY_RESOURCE_BUILDER_APPLY_CHANGESET_TOOL_SCHEMA/,
  "apply changeset tool should be registered",
);
assert.match(
  resources,
  /stageCommunityResourceBuilderChangeset[\s\S]*buildCommunityResourceBuilderChangesetPreflight[\s\S]*ctx\.db\.insert\("communityResourceBuilderChangesets"/,
  "staging should validate and store a changeset without applying resource writes",
);
assert.match(
  resources,
  /getCommunityResourceBuilderChangesetStatus[\s\S]*await requireCommunityManager[\s\S]*community_resource_builder_changeset_status/,
  "changeset status lookup should hydrate approval UI from canonical server state",
);
assert.match(
  resources,
  /getCommunityResourceBuilderChangesetStatus[\s\S]*COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS[\s\S]*approved_by_current_user/,
  "changeset status lookup should expose effective expiry and current-user approval state",
);
assert.match(
  resources,
  /buildCommunityResourceBuilderChangesetPreview[\s\S]*preview_items[\s\S]*preview_total_count[\s\S]*warning_count/,
  "staging should return a bounded changeset preview for builder approval UI",
);
assert.match(
  resources,
  /approveCommunityResourceBuilderChangeset[\s\S]*changeset\.status !== "staged"[\s\S]*status: "approved"[\s\S]*approvedByUserId: userId/,
  "approval should be an explicit server-side state transition",
);
assert.match(
  resources,
  /rejectCommunityResourceBuilderChangeset[\s\S]*status: "rejected"[\s\S]*rejectedByUserId: userId/,
  "rejection should be an explicit server-side state transition",
);
assert.match(
  resources,
  /applyCommunityResourceBuilderChangeset[\s\S]*changeset\.status !== "approved"[\s\S]*community_resource_changeset_approval_required[\s\S]*applyCommunityResourceBuilderChangesetOperations[\s\S]*status: "applied"/,
  "apply should only execute an approved changeset and then mark it applied",
);
assert.match(
  resources,
  /!changeset\.approvedByUserId \|\| String\(changeset\.approvedByUserId\) !== String\(userId\)[\s\S]*community_resource_changeset_approved_manager_required/,
  "apply should require the approving manager identity",
);
assert.match(
  mutationEvents,
  /COMMUNITY_RESOURCES_MUTATED_EVENT = "polynet:community-resources-mutated"/,
  "resource mutation event should have one shared browser event name",
);
assert.match(
  mutationEvents,
  /readCommunityResourcesMutatedEventDetail[\s\S]*communityId[\s\S]*dispatchCommunityResourcesMutated/,
  "resource mutation event should validate community id before frontend refresh",
);
assert.match(
  runtimeTimeline,
  /applyCloudCommunityResourceBuilderChangeset[\s\S]*getCloudCommunityResourceBuilderChangesetStatus[\s\S]*status === "applied"[\s\S]*dispatchCommunityResourcesMutated/,
  "approval card should verify applied changeset state before dispatching resource refresh",
);
assert.match(
  app,
  /COMMUNITY_RESOURCES_MUTATED_EVENT[\s\S]*readCommunityResourcesMutatedEventDetail[\s\S]*loadCommunityResourceModules[\s\S]*loadCommunityResources/,
  "workspace should refresh modules and resources after a verified resource mutation",
);

console.log("community_resource_builder_tools_contract_proof: ok");
