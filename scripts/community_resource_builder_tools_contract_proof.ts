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
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const app = read("apps/web/src/App.tsx");
const turnRunner = read("shared/useWebTurnRunnerController.ts");
const communityAgentDock = read("apps/web/src/components/WebCommunityAgentDock.tsx");
const communityContentController = read("apps/web/src/controllers/useWebCommunityContentController.ts");
// One reload refreshes both courses and lessons (modules and resources).
assert.match(
  read("shared/useCommunityResourceController.ts"),
  /collections: ResourceCollection\[\] = \["modules", "resources"\][\s\S]*const loadCommunityResources = useCallback\(\(communityId: string, session: SessionT\) =>\s*refreshCommunityResources\(communityId, session\)/,
  "a resource mutation reload refreshes both modules and resources",
);
const runtimeTimeline = read("apps/web/src/components/RuntimeLiveTimeline.tsx");
const changesetApprovalCards = read("apps/web/src/components/RuntimeResourceChangesetApprovalCards.tsx");
const mutationEvents = read("shared/communityResourceMutationEvents.ts");
const toolRegistry = read("shared/toolRegistry.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");

assert.match(
  packageJson,
  /"check:community-resource-builder-tools-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_resource_builder_tools_contract_proof\.ts && vitest run scripts\/runtime_resource_changeset_cards\.test\.ts"/,
  "builder resource tool contract proof should be wired into package scripts",
);

for (const exportName of [
  "listCommunityResourceBuilderDirectory",
  "readCommunityResourceBuilderResource",
  "getCommunityResourceBuilderChangesetStatus",
  "listPendingCommunityResourceBuilderChangesets",
  "rejectCommunityResourceBuilderChangeset",
  "applyCommunityResourceBuilderChangeset",
] as const) {
  assert.match(resources, new RegExp(`export const ${exportName} = (query|mutation)\\(`));
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
assert.doesNotMatch(
  resources,
  /export const (?:write|edit)CommunityResourceBuilderResource/,
  "agents must not retain direct resource write mutations beside canonical changesets",
);
assert.doesNotMatch(
  resources,
  /export const stageCommunityResourceBuilderChangeset = mutation/,
  "changeset staging must not expose a parallel public mutation",
);
assert.match(
  resources,
  /stageCommunityResourceBuilderChangesetCore[\s\S]*await requireCommunityManager[\s\S]*stageCommunityResourceBuilderChangesetInternal = internalMutation/,
  "internal changeset staging must remain owner/admin/manager gated",
);
assert.doesNotMatch(
  resources,
  /export const approveCommunityResourceBuilderChangeset\b/,
  "a separate approve step stays deleted: Apply accepts staged changesets directly",
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
  "changesets should retain legacy approval state for cached-client and stored-row compatibility",
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
assert.doesNotMatch(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES|missing_default_modules|missing_scaffold_pages/,
  "builder health should not require fixed default modules or scaffold pages",
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
  /listCommunityResourceBuilderDirectory[\s\S]*health: buildCommunityResourceBuilderHealthReportFromRows/,
  "builder list should include the deterministic health summary",
);
assert.doesNotMatch(
  resources,
  /COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES|isBuilderScaffoldPageTitle/,
  "health should not exempt source-less fallback pages from quality checks",
);
assert.match(
  resources,
  /sparsePages:[\s\S]*communityResourceBodyChars\(page\) < COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS/,
  "health check should flag sparse pages without default scaffold exemptions",
);
assert.match(
  resources,
  /pagesWithoutSourceLineage:[\s\S]*!normalizeIdValue\(page\.sourceResourceId \?\? ""\)/,
  "health check should flag pages without source lineage without default scaffold exemptions",
);
assert.doesNotMatch(
  resources,
  /isBuilderDefaultModuleName/,
  "health check should flag empty categories instead of exempting default modules",
);
assert.doesNotMatch(
  resources,
  /export const ensureCommunityResourceWikiScaffold/,
  "builder surface should not expose a direct scaffold mutation",
);
assert.doesNotMatch(
  gateway,
  /getCloudCommunityResourceBuilderHealth|community:getCommunityResourceBuilderHealth/,
  "standalone builder health should not be exposed through the frontend gateway",
);
assert.doesNotMatch(
  gateway,
  /ensureCloudCommunityResourceWikiScaffold|community:ensureCommunityResourceWikiScaffold/,
  "frontend gateway should not expose direct scaffold creation",
);
assert.doesNotMatch(
  gateway,
  /writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource/,
  "raw builder write/edit tools should not be exposed through the frontend gateway yet",
);
const builderListBody = resources.slice(
  resources.indexOf("async function listCommunityResourceBuilderDirectoryCore"),
  resources.indexOf("export const listCommunityResourceBuilderDirectoryInternal"),
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
  /truncated: resources\.length > (?:offset \+ )?limit/,
  "builder directory list should report truncation",
);
assert.match(
  resources,
  /readCommunityResourceBuilderResourceCore[\s\S]*ref\?: string[\s\S]*resolveCommunityResourceBuilderRef[\s\S]*readCommunityResourceBuilderResource[\s\S]*ref: v\.optional\(v\.string\(\)\)/,
  "builder read backend should accept and resolve semantic refs",
);
assert.match(
  resources,
  /ambiguous_resource_builder_ref[\s\S]*resource_builder_ref_not_found/,
  "builder read backend should return recoverable ambiguity and not-found outputs",
);
for (const retiredToolName of [
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
]) {
  assert.ok(!toolRegistry.includes(retiredToolName), `${retiredToolName} must not be registered`);
  assert.ok(!runtimeAgentLoop.includes(retiredToolName), `${retiredToolName} must not be dispatched`);
}
for (const canonicalToolName of [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
]) {
  assert.match(toolRegistry, new RegExp(`${canonicalToolName}: \\{`));
}
assert.doesNotMatch(
  toolRegistry,
  /community_resource_builder_apply_changeset|COMMUNITY_RESOURCE_BUILDER_APPLY_CHANGESET_TOOL_SCHEMA/,
  "agent runtime must not register a resource changeset apply tool",
);
assert.doesNotMatch(
  runtimeAgentLoop,
  /community_resource_builder_apply_changeset/,
  "agent runtime must not dispatch resource changeset apply",
);
assert.match(
  resources,
  /stageCommunityResourceBuilderChangesetCore[\s\S]*buildCommunityResourceBuilderChangesetPreflight[\s\S]*ctx\.db\.insert\("communityResourceBuilderChangesets"/,
  "staging should validate and store a changeset without applying resource writes",
);
assert.match(
  canonicalExecutor,
  /POLYNET_BUILDER_RESOURCES_DIRECTORY_PATH[\s\S]*toolName: "polynet_write"[\s\S]*stageCommunityResourceBuilderChangesetInternal/,
  "canonical polynet_write should be the only agent path into internal changeset staging",
);
assert.match(
  resources,
  /getCommunityResourceBuilderChangesetStatus[\s\S]*await requireCommunityManager[\s\S]*community_resource_builder_changeset_status/,
  "changeset status lookup should hydrate approval UI from canonical server state",
);
assert.match(
  resources,
  /getCommunityResourceBuilderChangesetStatus[\s\S]*communityResourceBuilderChangesetIsExpired[\s\S]*approved_by_current_user/,
  "changeset status lookup should expose effective expiry and current-user approval state",
);
assert.match(
  resources,
  /listPendingCommunityResourceBuilderChangesets[\s\S]*await requireCommunityManager[\s\S]*readLatestCommunityResourceBuilderActionableRows[\s\S]*communityResourceBuilderChangesetIsExpired/,
  "pending changeset recovery must be manager-authorized, indexed, and TTL-aware",
);
assert.match(
  resources,
  /readLatestCommunityResourceBuilderActionableRows[\s\S]*by_community_status_createdAt/,
  "active changeset lookup should use the existing community and status index",
);
assert.match(
  resources,
  /stageCommunityResourceBuilderChangesetCore[\s\S]*readLatestCommunityResourceBuilderActionableRows[\s\S]*community_resource_changeset_already_pending[\s\S]*ctx\.db\.insert\("communityResourceBuilderChangesets"/,
  "changeset staging should enforce one live proposal per community before insert",
);
assert.match(
  resources,
  /stageCommunityResourceBuilderChangesetCore[\s\S]*ctx\.scheduler\.runAt\([\s\S]*expireCommunityResourceBuilderChangesetInternal/,
  "every staged changeset should schedule its canonical expiry mutation",
);
assert.match(
  resources,
  /expireCommunityResourceBuilderChangesetInternal = internalMutation[\s\S]*expireCommunityResourceBuilderChangesetIfNeeded/,
  "changeset expiry should have one private idempotent mutation",
);
assert.doesNotMatch(
  resources,
  /throw new Error\("community_resource_changeset_expired"\)/,
  "expected expiry must commit as a typed terminal result instead of rolling back by throwing",
);
assert.match(
  resources,
  /listPendingCommunityResourceBuilderChangesets[\s\S]*\.slice\(0, 1\)/,
  "pending changeset recovery should expose only the canonical live proposal",
);
assert.match(
  changesetApprovalCards,
  /CHANGESET_CARD_LIMIT = 1/,
  "runtime changeset rendering should expose at most one active proposal",
);
assert.match(
  communityAgentDock,
  /member_agent_resource_build[\s\S]*limit: 1[\s\S]*member_agent_resource_changeset_recovery[\s\S]*limit: 1/,
  "resource-build launch and recovery should request one canonical proposal",
);
assert.match(
  gateway,
  /listCloudPendingCommunityResourceBuilderChangesets[\s\S]*communityResources:listPendingCommunityResourceBuilderChangesets/,
  "web recovery must use one canonical pending changeset gateway",
);
assert.match(
  resources,
  /buildCommunityResourceBuilderChangesetPreview[\s\S]*preview_items[\s\S]*preview_total_count[\s\S]*warning_count/,
  "staging should return a bounded changeset preview for builder approval UI",
);
assert.match(
  resources,
  /op === "delete_page"[\s\S]*resource_id: normalizeRequiredResourceRef[\s\S]*expected_updated_at: normalizeExpectedUpdatedAtForChangeset/,
  "delete_page changeset operations should require resource id and optimistic timestamp",
);
assert.match(
  resources,
  /op === "delete_category"[\s\S]*module_id: normalizeRequiredResourceRef[\s\S]*expected_updated_at: normalizeExpectedUpdatedAtForChangeset/,
  "delete_category changeset operations should require category id and optimistic timestamp",
);
assert.match(
  resources,
  /requireChangesetEmptyModuleRef[\s\S]*community_resource_changeset_category_not_empty/,
  "delete_category should reject non-empty categories",
);
assert.match(
  resources,
  /operation\.op === "delete_page"[\s\S]*role: "page"[\s\S]*deletePageFromChangesetOperation[\s\S]*revokeCommunityResourceMemoryProjection[\s\S]*deleteCommunityResourceBodyContent[\s\S]*ctx\.db\.delete/,
  "delete_page should only delete page resources and should revoke memory before source truth",
);
assert.match(
  resources,
  /operation\.op === "delete_category"[\s\S]*deleteCategoryFromChangesetOperation[\s\S]*requireChangesetEmptyModuleRef[\s\S]*maybeDeleteStorageAsset[\s\S]*ctx\.db\.delete/,
  "delete_category should delete only empty categories and clean banner storage",
);
assert.match(
  resources,
  /rejectCommunityResourceBuilderChangeset[\s\S]*status: "rejected"[\s\S]*rejectedByUserId: userId/,
  "rejection should be an explicit server-side state transition",
);
assert.match(
  resources,
  /applyCommunityResourceBuilderChangeset[\s\S]*changeset\.status !== "staged" && changeset\.status !== "approved"[\s\S]*community_resource_changeset_not_applicable[\s\S]*applyCommunityResourceBuilderChangesetOperations[\s\S]*status: "applied"/,
  "product Apply should atomically accept staged and legacy-approved changesets",
);
assert.doesNotMatch(
  resources,
  /community_resource_changeset_approval_required|community_resource_changeset_approved_manager_required/,
  "product Apply must not depend on a browser-coordinated approval transition or one approving manager",
);
assert.doesNotMatch(
  changesetApprovalCards,
  /approveCloudCommunityResourceBuilderChangeset|approvedByCurrentUser|canApply/,
  "approval card must issue one atomic Apply request without client-owned approval state",
);
assert.doesNotMatch(
  gateway,
  /export async function approveCloudCommunityResourceBuilderChangeset/,
  "new web clients must not expose the legacy approval gateway",
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
  changesetApprovalCards,
  /finishVerifiedApply[\s\S]*setActionState\("applied"\)[\s\S]*dispatchCommunityResourcesMutated[\s\S]*applyCloudCommunityResourceBuilderChangeset[\s\S]*readAuthoritativeStatus[\s\S]*status !== "applied"[\s\S]*finishVerifiedApply/,
  "approval card should verify applied changeset state before dispatching resource refresh",
);
assert.match(
  changesetApprovalCards,
  /rejectCloudCommunityResourceBuilderChangeset[\s\S]*readAuthoritativeStatus[\s\S]*status !== "rejected"[\s\S]*setActionState\("rejected"\)/,
  "rejection card should verify rejected changeset state before presenting success",
);
assert.doesNotMatch(
  changesetApprovalCards,
  /setServerStatus\("applied"\)|setServerStatus\("rejected"\)/,
  "the browser must not manufacture terminal changeset state when confirmation fails",
);
assert.match(
  changesetApprovalCards,
  /findChangesetOutputRecord[\s\S]*"result"[\s\S]*toolName !== "polynet_write"[\s\S]*community_resource_builder_changeset_staged/,
  "approval extraction must unwrap canonical polynet_write staging receipts",
);
assert.match(
  runtimeTimeline,
  /RuntimeResourceChangesetApprovalCards/,
  "runtime timeline should delegate resource approval cards to the dedicated component",
);
assert.match(
  communityAgentDock,
  /useWebTurnRunnerController[\s\S]*setRuntimeEventsByRunId/,
  "mounted member-agent dock should receive the live runtime event cache setter",
);
assert.match(
  turnRunner,
  /eventName === "runtime_event"[\s\S]*current\.setRuntimeEventsByRunId[\s\S]*runtimeEventRunId[\s\S]*runtimeEvent[\s\S]*setThreadStreamingState/,
  "live runtime events should be copied into the per-run cache before the streaming message is cleared",
);
assert.match(
  communityAgentDock,
  /runtimeEvents\.length > 0[\s\S]*<RuntimeLiveTimeline[\s\S]*events=\{runtimeEvents\}/,
  "mounted member-agent dock should render live resource changeset events through the retained timeline",
);
assert.match(
  communityAgentDock,
  /startResourceBuild[\s\S]*listCloudPendingCommunityResourceBuilderChangesets[\s\S]*pendingResourceBuildRef[\s\S]*composerFormRef\.current\?\.requestSubmit/,
  "resource launch must check durable pending state and reuse the mounted dock submit path",
);
assert.match(
  communityAgentDock,
  /member_agent_resource_changeset_recovery[\s\S]*listCloudPendingCommunityResourceBuilderChangesets[\s\S]*setRecoveredResourceChangesetCards/,
  "mounted member-agent dock must recover staged proposals after a reload",
);
assert.match(
  changesetApprovalCards,
  /actionInFlightRef[\s\S]*readAuthoritativeStatus[\s\S]*status === "applied"[\s\S]*finishVerifiedApply/,
  "resource changeset application must suppress duplicate requests and recover authoritative applied state",
);
assert.doesNotMatch(
  `${resources}\n${changesetApprovalCards}\n${app}`,
  /initial_community_resources|initial-community-resources|onInitialResourcesApplied|resource-changeset-next-action/,
  "generic resource changesets must not retain initial-launch presentation branching",
);
assert.doesNotMatch(
  app,
  /buildWebCommunityResourceBuildHandler|handleBuildCommunityResources/,
  "App must not retain the retired agent-prompt onboarding resource launcher",
);
assert.match(
  communityContentController,
  /COMMUNITY_RESOURCES_MUTATED_EVENT[\s\S]*readCommunityResourcesMutatedEventDetail[\s\S]*loadCommunityResources\(detail\.communityId/,
  "workspace should refresh modules and resources after a verified resource mutation",
);

console.log("community_resource_builder_tools_contract_proof: ok");
