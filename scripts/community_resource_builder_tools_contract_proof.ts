import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const resources = read("convex/communityResources.ts");
const community = read("convex/community.ts");
const experience = read("convex/communityExperience.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const launchModal = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const app = read("apps/web/src/App.tsx");

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
  /const role = kind === "source" \? "source" : "page"[\s\S]*defaultStatus: role === "source" \? "review" : "draft"/,
  "builder writes should default sources to review and pages to draft",
);
assert.match(
  resources,
  /if \(next === "published" && !args\.confirmPublish\)[\s\S]*community_resource_publish_confirmation_required/,
  "publishing through builder tools should require explicit confirmation",
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
  /communityResourceIsPublishedKnowledge/,
  "builder directory should not reuse member published-only filtering",
);

console.log("community_resource_builder_tools_contract_proof: ok");
