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
  /const readySources = allSources\.filter\(communityResourceSourceHasReadyText\)[\s\S]*source_inbox:[\s\S]*source_ingestion_status:[\s\S]*length_chars:[\s\S]*excerpt: buildSourceExcerpt[\s\S]*assigned_pages:/,
  "architect context should expose ready source text excerpts and assignment state",
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
  /sources_total:[\s\S]*sources_visible:[\s\S]*sources_truncated:/,
  "architect context should expose source truncation metadata",
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
  /Wiki Architect cannot propose draft writes from a truncated resource window/,
  "architect action should reject write proposals produced from truncated context",
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
  architect,
  /COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT[\s\S]*Use only the provided source text[\s\S]*Return ONLY valid JSON[\s\S]*"body_md"/,
  "resource content writer should have a source-grounded JSON-only prompt",
);
assert.match(
  architect,
  /export const buildCommunityResourceContentWriterRunContextInternal = internalQuery\([\s\S]*communityResourceSourceHasReadyText[\s\S]*isResourceDraftScaffoldBody\(page\.bodyMd\)[\s\S]*source_body_md: truncateContentWriterSource\(source\.bodyMd\)/,
  "content writer context should target only scaffold draft pages with ready source text",
);
assert.match(
  architect,
  /export const patchCommunityResourceContentDraftInternal = internalMutation\([\s\S]*normalizeResourceStatus\(page\.status\) !== "draft"[\s\S]*isResourceDraftScaffoldBody\(page\.bodyMd\)[\s\S]*communityResourceSourceHasReadyText\(source\)[\s\S]*status: "review"[\s\S]*upsertArchiveDocumentForResource/,
  "content writer patch should refuse unsafe targets and leave generated pages in review",
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
assert.doesNotMatch(
  modal,
  /Build wiki plan|review-only structure plan|drafts_created|Apply draft plan/,
  "modal should not expose architect review controls in the Knowledge UI",
);

console.log("community_wiki_architect_run_contract_proof: ok");
