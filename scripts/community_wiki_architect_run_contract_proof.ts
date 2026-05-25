import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const architect = read("convex/communityWikiArchitect.ts");
const community = read("convex/community.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const app = read("apps/web/src/App.tsx");
const modal = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const applyStart = architect.indexOf("export const applyCommunityWikiArchitectProposal");
assert.notEqual(applyStart, -1, "architect apply mutation should exist");
const runStart = architect.indexOf("export const runCommunityWikiArchitectProposal");
assert.notEqual(runStart, -1, "architect proposal action should exist");
const runBody = architect.slice(runStart, applyStart);
const applyBody = architect.slice(applyStart);
const prepareStart = modal.indexOf("const handlePrepareKnowledgeResources");
assert.notEqual(prepareStart, -1, "knowledge prepare handler should exist");
const prepareEnd = modal.indexOf("const handleSaveAgent", prepareStart);
assert.notEqual(prepareEnd, -1, "knowledge prepare handler boundary should exist");
const prepareBody = modal.slice(prepareStart, prepareEnd);

assert.match(
  packageJson,
  /"check:community-wiki-architect-run-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_wiki_architect_run_contract_proof\.ts"/,
  "wiki architect run proof should be wired into package scripts",
);

assert.match(
  architect,
  /export const buildCommunityWikiArchitectRunContextInternal = internalQuery\(/,
  "architect context builder should be an internal query",
);
assert.match(
  architect,
  /export const runCommunityWikiArchitectProposal(?:: any)? = action\(/,
  "architect proposal runner should be a Convex action",
);
assert.match(
  architect,
  /export const applyCommunityWikiArchitectProposal(?:: any)? = mutation\(/,
  "architect apply should be a deterministic Convex mutation",
);
assert.match(
  architect,
  /COMMUNITY_WIKI_ARCHITECT_PROMPT/,
  "architect action should use the shared prompt",
);
assert.match(
  architect,
  /resolveWikiArchitectModelId/,
  "architect action should resolve an explicit OpenAI Responses model id",
);
assert.doesNotMatch(
  architect,
  /COMMUNITY_WIKI_ARCHITECT_DEFAULT_MODEL\s*=\s*"gpt-5\.5"/,
  "architect should not use a raw hardcoded PolyNet catalog model id as direct OpenAI fallback",
);
assert.match(
  architect,
  /validateCommunityWikiArchitectProposal/,
  "architect action should validate model output before returning it",
);
assert.match(
  architect,
  /await requireCommunityManager/,
  "architect context should be owner-admin-manager gated",
);
assert.match(
  architect,
  /COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS\s*=\s*80[\s\S]*COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS\s*=\s*40_000[\s\S]*COMMUNITY_WIKI_ARCHITECT_SOURCE_CARD_EXCERPT_CHARS\s*=\s*600/,
  "architect source context should have a hard visible-card and character budget",
);
assert.match(
  architect,
  /function buildArchitectSourceWindow[\s\S]*sourceCards[\s\S]*visibleSourceIds[\s\S]*sourcesOmitted[\s\S]*sourceCards\.length >= COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS[\s\S]*usedChars \+ cardChars > COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS/,
  "architect context should build a bounded visible source window",
);
assert.match(
  architect,
  /const readySourceRows = allSources\.filter\(communityResourceSourceHasReadyText\)[\s\S]*COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_HYDRATION_CANDIDATES[\s\S]*const readySources = await Promise\.all\([\s\S]*readySourceCandidates[\s\S]*hydrateCommunityResourceBody[\s\S]*const sourceWindow = buildArchitectSourceWindow[\s\S]*source_inbox: sourceWindow\.sourceCards/,
  "architect context should expose only ready hydrated source text through a bounded candidate window",
);
assert.match(
  architect,
  /source_ingestion_status:[\s\S]*length_chars:[\s\S]*excerpt: buildSourceExcerpt[\s\S]*assigned_pages:/,
  "architect source cards should expose ingestion status, bounded excerpts, and assignment state",
);
assert.match(
  architect,
  /body_chars:/,
  "architect context may expose page body length as metadata",
);
assert.match(
  architect,
  /pages_total:[\s\S]*pages_visible:[\s\S]*pages_truncated:/,
  "architect context should expose page truncation metadata",
);
assert.match(
  architect,
  /sources_total:[\s\S]*sources_visible:[\s\S]*sources_omitted:[\s\S]*sources_truncated:[\s\S]*source_context_budget_chars:[\s\S]*source_context_used_chars:[\s\S]*visible_source_ids:/,
  "architect context should expose source window budget and visibility metadata",
);
assert.match(
  architect,
  /ready_sources_total:[\s\S]*sources_pending_ingestion:[\s\S]*sources_failed_ingestion:/,
  "architect context should expose source ingestion readiness metadata",
);
assert.match(
  architect,
  /code: "no_ready_sources"[\s\S]*Source material must be ingested/,
  "architect run should not draft from source URL metadata before ingestion",
);
assert.match(
  architect,
  /source_resource_id must be one of current_resource_state\.visible_source_ids/,
  "architect action should reject source lineage outside the visible source window",
);
assert.doesNotMatch(
  applyBody,
  /ctx\.db\.insert\("communityResourceModules"[\s\S]{0,500}descriptionMd:[^\n]*\?\?\s*null/,
  "architect apply must not write null into the optional module description field",
);
assert.match(
  runBody,
  /Boolean\(state\.pages_truncated\) && hasDraftWrites[\s\S]*Wiki Architect cannot propose draft writes from a truncated page window/,
  "architect action should reject write proposals produced from a truncated page window",
);
assert.doesNotMatch(
  runBody,
  /Boolean\(state\.pages_truncated\) \|\| Boolean\(state\.sources_truncated\)/,
  "architect action should not block all draft writes merely because some ready sources were omitted from the bounded window",
);
assert.doesNotMatch(
  runBody,
  /ctx\.runMutation/,
  "architect run must be read-only and must not mutate resources",
);
assert.doesNotMatch(
  runBody,
  /writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource|ensureCommunityResourceWikiScaffold/,
  "architect run must not call builder write/edit/scaffold mutations",
);
assert.doesNotMatch(
  runBody,
  /body_md:|bodyMd:\s*String\(/,
  "architect context must not send unbounded full page or source bodies to the model",
);

assert.match(
  applyBody,
  /validateCommunityWikiArchitectProposal/,
  "architect apply should revalidate the proposal against current state",
);
assert.match(
  applyBody,
  /ctx\.db[\s\S]*query\("communityResourceModules"[\s\S]*ctx\.db[\s\S]*query\("communityResources"/,
  "architect apply should re-read current resource state before writing",
);
assert.match(
  applyBody,
  /status:\s*"draft"/,
  "architect apply should create draft pages only",
);
assert.doesNotMatch(
  applyBody,
  /status:\s*"published"/,
  "architect apply should not publish resources",
);
assert.match(
  applyBody,
  /normalizeResourceStatus\(page\.status\) !== "draft"/,
  "architect apply should reject edits to non-draft pages",
);
assert.match(
  applyBody,
  /buildCommunityResourceBuilderHealthReport/,
  "architect apply should return fresh builder health after writes",
);
assert.match(
  applyBody,
  /patchSourceModuleIfNeeded[\s\S]*ctx\.db\.patch\(source\._id as any,[\s\S]*moduleId,[\s\S]*upsertArchiveDocumentForResource\(ctx, updatedSource\)/,
  "architect apply should persist used source rows into the page module",
);
assert.match(
  applyBody,
  /await patchSourceModuleIfNeeded\(source, module\._id\)/,
  "architect-created pages should update their primary source module",
);
assert.match(
  applyBody,
  /await patchSourceModuleIfNeeded\(source, updatedPage\.moduleId \?\? null\)/,
  "architect draft updates should update their primary source module",
);
assert.match(
  architect,
  /buildCommunityWikiArchitectureQuality[\s\S]*unsorted_source_backed_pages[\s\S]*source_module_mismatches[\s\S]*module_distribution/,
  "architect apply should compute architecture quality from applied source-backed rows",
);
assert.match(
  applyBody,
  /const architectureQuality = buildCommunityWikiArchitectureQuality[\s\S]*if \(architectureQuality\.ok === false\)[\s\S]*community_wiki_architect_architecture_quality_failed[\s\S]*architecture_quality: architectureQuality/,
  "architect apply should abort invariant-broken organization and return quality metadata",
);
assert.match(
  architect,
  /COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT[\s\S]*Use only the provided source text[\s\S]*Return ONLY valid JSON[\s\S]*"body_md"/,
  "resource content writer should have a source-grounded JSON-only prompt",
);
assert.match(
  architect,
  /export const buildCommunityResourceContentWriterRunContextInternal = internalQuery\([\s\S]*COMMUNITY_RESOURCE_CONTENT_WRITER_PAGE_SCAN_LIMIT[\s\S]*isResourceDraftScaffoldBody\(page\.bodyMd\)[\s\S]*neededSourceIds[\s\S]*communityResourceSourceHasReadyText\(source\)[\s\S]*hydrateCommunityResourceBody[\s\S]*source_body_md: truncateContentWriterSource\(source\.bodyMd\)/,
  "content writer context should target only bounded scaffold draft pages with hydrated ready source text",
);
assert.match(
  architect,
  /export const patchCommunityResourceContentDraftInternal = internalMutation\([\s\S]*hydrateCommunityResourceBody[\s\S]*normalizeResourceStatus\(page\.status\) !== "draft"[\s\S]*isResourceDraftScaffoldBody\(page\.bodyMd\)[\s\S]*communityResourceSourceHasReadyText\(source\)[\s\S]*status: "review"[\s\S]*writeCommunityResourceBodyContent[\s\S]*upsertArchiveDocumentForResource/,
  "content writer patch should refuse unsafe targets, persist body content, and leave generated pages in review",
);
assert.match(
  architect,
  /export const draftCommunityResourceContentFromSources(?:: any)? = action\([\s\S]*runResourceContentWriterModel[\s\S]*parseResourceContentWriterBody[\s\S]*patchCommunityResourceContentDraftInternal[\s\S]*const ok = failed === 0/,
  "content writer action should call the model, patch through the guarded mutation, and surface partial failures",
);

assert.match(
  community,
  /runCommunityWikiArchitectProposal as runCommunityWikiArchitectProposalImpl/,
  "community API should import the architect action implementation",
);
assert.match(
  community,
  /draftCommunityResourceContentFromSources as draftCommunityResourceContentFromSourcesImpl/,
  "community API should import the content writer action implementation",
);
assert.match(
  community,
  /applyCommunityWikiArchitectProposal as applyCommunityWikiArchitectProposalImpl/,
  "community API should import the architect apply implementation",
);
assert.match(
  community,
  /export const runCommunityWikiArchitectProposal(?:: any)? = runCommunityWikiArchitectProposalImpl/,
  "community API should export the architect action",
);
assert.match(
  community,
  /export const applyCommunityWikiArchitectProposal(?:: any)? = applyCommunityWikiArchitectProposalImpl/,
  "community API should export the architect apply mutation",
);
assert.match(
  community,
  /export const draftCommunityResourceContentFromSources(?:: any)? = draftCommunityResourceContentFromSourcesImpl/,
  "community API should export the content writer action",
);
assert.match(
  gateway,
  /runCloudCommunityWikiArchitectProposal[\s\S]*client\.action\("community:runCommunityWikiArchitectProposal" as any/,
  "web gateway should call the architect action",
);
assert.match(
  gateway,
  /applyCloudCommunityWikiArchitectProposal[\s\S]*client\.mutation\("community:applyCommunityWikiArchitectProposal" as any/,
  "web gateway should expose the reviewed architect apply mutation",
);
assert.match(
  gateway,
  /draftCloudCommunityResourceContentFromSources[\s\S]*client\.action\("community:draftCommunityResourceContentFromSources" as any/,
  "web gateway should expose the resource content writer action",
);
assert.doesNotMatch(
  gateway,
  /writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource/,
  "web gateway should not expose raw architect write/edit tools in this slice",
);

assert.match(
  app,
  /runCloudCommunityWikiArchitectProposal/,
  "App should import the cloud architect gateway",
);
assert.match(
  app,
  /handleGenerateCommunityLaunchKnowledgePlan[\s\S]*builderIntent: draft\.builderIntent/,
  "App should pass builder intent into the architect action",
);
assert.match(
  app,
  /onGenerateKnowledgePlan=\{handleGenerateCommunityLaunchKnowledgePlan\}/,
  "launch modal should receive the architect run handler",
);
assert.match(
  app,
  /onApplyKnowledgePlan=\{handleApplyCommunityLaunchKnowledgePlan\}/,
  "launch modal should receive the reviewed architect apply handler",
);
assert.match(
  app,
  /draftCloudCommunityResourceContentFromSources[\s\S]*handleDraftCommunityLaunchKnowledgeResources[\s\S]*onDraftKnowledgeResources=\{handleDraftCommunityLaunchKnowledgeResources\}/,
  "App should draft resource content after applying the architect plan",
);

assert.match(
  modal,
  /onGenerateKnowledgePlan/,
  "modal should expose a generate-plan callback",
);
assert.match(
  modal,
  /handlePrepareKnowledgeResources[\s\S]*onGenerateKnowledgePlan[\s\S]*onApplyKnowledgePlan[\s\S]*onDraftKnowledgeResources[\s\S]*onOpenStep\("knowledge"\)/,
  "modal should run ingest, architect, content writer, then open Resources review from Knowledge Next",
);
const ingestIndex = prepareBody.indexOf("await onIngestKnowledgeSources()");
const planIndex = prepareBody.indexOf("await onGenerateKnowledgePlan");
const applyIndex = prepareBody.indexOf("await onApplyKnowledgePlan");
const draftIndex = prepareBody.indexOf("await onDraftKnowledgeResources()");
const fallbackIndex = prepareBody.indexOf("await onEnsureKnowledgeScaffold()");
assert.ok(
  ingestIndex !== -1 && planIndex !== -1 && applyIndex !== -1 && draftIndex !== -1,
  "Knowledge Next should call ingest, architect, apply, and drafter",
);
assert.ok(
  ingestIndex < planIndex && planIndex < applyIndex && applyIndex < draftIndex,
  "Knowledge Next should run source ingestion, source-driven architect, apply, then drafter in order",
);
assert.equal(
  prepareBody.slice(0, planIndex).includes("onEnsureKnowledgeScaffold"),
  false,
  "Knowledge Next must not run generic scaffold before source-driven planning",
);
assert.ok(
  fallbackIndex === -1 || (fallbackIndex > applyIndex && fallbackIndex < draftIndex),
  "generic scaffold fallback should run only after source-driven planning and before drafting",
);
assert.match(
  modal,
  /proposalHasSourceBackedWrites[\s\S]*drafts_created[\s\S]*drafts_updated/,
  "modal should detect whether the architect produced source-backed writes before fallback scaffolding",
);
assert.doesNotMatch(
  modal,
  /Build wiki plan|review-only structure plan|Apply draft plan/,
  "modal should not expose architect review controls in the Knowledge UI",
);

console.log("community_wiki_architect_run_contract_proof: ok");
