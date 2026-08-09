import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const architect = read("convex/communityWikiArchitect.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const applyStart = architect.indexOf("export const applyCommunityWikiArchitectProposal");
assert.notEqual(applyStart, -1, "architect apply mutation should exist");
const runStart = architect.indexOf("export const runCommunityWikiArchitectProposal");
assert.notEqual(runStart, -1, "architect proposal action should exist");
const runBody = architect.slice(runStart, applyStart);
const applyBody = architect.slice(applyStart);

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
  "architect should not use a raw hardcoded Polynet catalog model id as direct OpenAI fallback",
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
  /COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS\s*=\s*80[\s\S]*COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS\s*=\s*40_000[\s\S]*COMMUNITY_WIKI_ARCHITECT_SOURCE_CARD_EXCERPT_CHARS\s*=\s*600[\s\S]*COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_UNIT_CARDS\s*=\s*120[\s\S]*COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_UNITS_PER_SOURCE_CARD\s*=\s*8/,
  "architect source context should have hard visible-card, source-unit, and character budgets",
);
assert.match(
  architect,
  /function buildArchitectSourceWindow[\s\S]*sourceCards[\s\S]*visibleSourceIds[\s\S]*sourcesOmitted[\s\S]*sourceCards\.length >= COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS[\s\S]*usedChars \+ cardChars > COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS/,
  "architect context should build a bounded visible source window",
);
assert.match(
  architect,
  /const readySourceRows = allSources\.filter\(communityResourceSourceHasReadyText\)[\s\S]*COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_HYDRATION_CANDIDATES[\s\S]*const readySources = await Promise\.all\([\s\S]*readySourceCandidates[\s\S]*hydrateCommunityResourceBody[\s\S]*const sourceUnitsBySourceId = await loadSourceUnitCardsBySourceId[\s\S]*const sourceWindow = buildArchitectSourceWindow[\s\S]*source_inbox: sourceWindow\.sourceCards/,
  "architect context should expose only ready hydrated source text and bounded source units through a bounded candidate window",
);
assert.match(
  architect,
  /source_ingestion_status:[\s\S]*length_chars:[\s\S]*excerpt: buildSourceExcerpt[\s\S]*source_unit_count:[\s\S]*source_units_visible:[\s\S]*source_units_truncated:[\s\S]*source_units:[\s\S]*assigned_pages:/,
  "architect source cards should expose ingestion status, bounded excerpts, source-unit state, and assignment state",
);
assert.match(
  architect,
  /async function readSourceUnitContent[\s\S]*query\("communitySourceUnitContents" as any\)[\s\S]*withIndex\("by_source_unit"/,
  "architect context should read source-unit bodies through the indexed unit-content lookup",
);
assert.match(
  architect,
  /async function loadReadySourceUnitsForSource[\s\S]*query\("communitySourceUnits" as any\)[\s\S]*withIndex\("by_source_resource"[\s\S]*async function loadSourceUnitCardsBySourceId[\s\S]*const rows = await loadReadySourceUnitsForSource\(ctx, sourceId\)[\s\S]*readSourceUnitContent\(ctx, unit\._id\)[\s\S]*sourceUnitsBySourceId\.set\(sourceId,[\s\S]*total: rows\.length[\s\S]*cards/,
  "architect context should load source units through indexed source lookups and preserve true total versus visible cards",
);
assert.match(
  architect,
  /function scoreSourceUnitForPage[\s\S]*pageTitle[\s\S]*unitTitle[\s\S]*metadata[\s\S]*body[\s\S]*return score/,
  "content writer should score source units against the target page before drafting",
);
assert.match(
  architect,
  /async function buildContentWriterSourceFromUnits\(ctx: any, args:[\s\S]*pageTitle:[\s\S]*pageModule:[\s\S]*pageBody:[\s\S]*scoreSourceUnitForPage[\s\S]*seed\.index - 1[\s\S]*seed\.index \+ 1[\s\S]*relevance_score:/,
  "content writer should select page-relevant source units and include nearby neighbor units by order",
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
  /writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource/,
  "architect run must not call builder write/edit mutations",
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
  /patchSourceModuleIfNeeded[\s\S]*ctx\.db\.patch\(source\._id as any,[\s\S]*moduleId,[\s\S]*syncCommunityResourceMemoryProjection\(ctx, updatedSource, nowMs\)/,
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
  /COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT[\s\S]*Do not reference the configured agent name[\s\S]*Copyable prompt[\s\S]*Try this prompt/,
  "resource content writer should avoid agent-name-specific prompt headings",
);
assert.match(
  architect,
  /COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT[\s\S]*put every prompt in a fenced \\`\\`\\`text code block[\s\S]*copy control/,
  "resource content writer should make prompt text blocks copyable",
);
assert.match(
  architect,
  /COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT[\s\S]*YouTube, Vimeo, Loom, or Wistia URLs[\s\S]*on its own paragraph[\s\S]*render it as an embed/,
  "resource content writer should preserve supported media links as standalone embeds",
);
assert.match(
  architect,
  /export const buildCommunityResourceContentWriterRunContextInternal = internalQuery\([\s\S]*COMMUNITY_RESOURCE_CONTENT_WRITER_PAGE_SCAN_LIMIT[\s\S]*isResourceDraftScaffoldBody\(page\.bodyMd\)[\s\S]*neededSourceIds[\s\S]*communityResourceSourceHasReadyText\(source\)[\s\S]*hydrateCommunityResourceBody[\s\S]*pages\.slice\(0, limit\)\.map[\s\S]*buildContentWriterSourceFromUnits\(ctx, \{[\s\S]*pageTitle:[\s\S]*pageModule,[\s\S]*pageBody:[\s\S]*source_units: unitContext\.sourceUnits[\s\S]*source_body_md: unitContext\.sourceBodyMd \?\? truncateContentWriterSource\(source\.bodyMd\)/,
  "content writer context should target only bounded scaffold draft pages with hydrated ready source text and prefer source-unit bodies when present",
);
assert.match(
  architect,
  /export const patchCommunityResourceContentDraftInternal = internalMutation\([\s\S]*hydrateCommunityResourceBody[\s\S]*normalizeResourceStatus\(page\.status\) !== "draft"[\s\S]*isResourceDraftScaffoldBody\(page\.bodyMd\)[\s\S]*communityResourceSourceHasReadyText\(source\)[\s\S]*status: "review"[\s\S]*writeCommunityResourceBodyContent[\s\S]*syncCommunityResourceMemoryProjection/,
  "content writer patch should refuse unsafe targets, persist body content, and leave generated pages in review",
);
assert.match(
  architect,
  /export const draftCommunityResourceContentFromSources(?:: any)? = action\([\s\S]*runResourceContentWriterModel[\s\S]*parseResourceContentWriterBody[\s\S]*patchCommunityResourceContentDraftInternal[\s\S]*const ok = failed === 0/,
  "content writer action should call the model, patch through the guarded mutation, and surface partial failures",
);

assert.doesNotMatch(
  gateway,
  /runCloudCommunityWikiArchitectProposal|applyCloudCommunityWikiArchitectProposal|draftCloudCommunityResourceContentFromSources|writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource/,
  "first-party web gateway must not expose the retired direct Wiki Architect path",
);

console.log("community_wiki_architect_run_contract_proof: ok");
