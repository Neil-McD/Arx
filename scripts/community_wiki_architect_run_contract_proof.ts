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
  /source_inbox:[\s\S]*length_chars:[\s\S]*assigned_pages:/,
  "architect context should expose source metadata and assignment state",
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
  /Wiki Architect cannot propose draft writes from a truncated resource window/,
  "architect action should reject write proposals produced from truncated context",
);
assert.doesNotMatch(
  architect,
  /ctx\.runMutation/,
  "architect run must be read-only and must not mutate resources",
);
assert.doesNotMatch(
  architect,
  /writeCommunityResourceBuilderResource|editCommunityResourceBuilderResource|ensureCommunityResourceWikiScaffold/,
  "architect run must not call builder write/edit/scaffold mutations",
);
assert.doesNotMatch(
  architect,
  /body_md:|bodyMd:\s*String\(/,
  "architect context must not send full page or source bodies to the model",
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
  community,
  /runCommunityWikiArchitectProposal as runCommunityWikiArchitectProposalImpl/,
  "community API should import the architect action implementation",
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
  gateway,
  /runCloudCommunityWikiArchitectProposal[\s\S]*client\.action\("community:runCommunityWikiArchitectProposal" as any/,
  "web gateway should call the architect action",
);
assert.match(
  gateway,
  /applyCloudCommunityWikiArchitectProposal[\s\S]*client\.mutation\("community:applyCommunityWikiArchitectProposal" as any/,
  "web gateway should expose the reviewed architect apply mutation",
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
  modal,
  /onGenerateKnowledgePlan/,
  "modal should expose a generate-plan callback",
);
assert.match(
  modal,
  /handlePrepareKnowledgeResources[\s\S]*onGenerateKnowledgePlan[\s\S]*onApplyKnowledgePlan/,
  "modal should run the architect proposal/apply path internally from Knowledge Next",
);
assert.doesNotMatch(
  modal,
  /Build wiki plan|review-only structure plan|drafts_created|Apply draft plan/,
  "modal should not expose architect review controls in the Knowledge UI",
);

console.log("community_wiki_architect_run_contract_proof: ok");
