import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const concierge = readFileSync(join(root, "convex/communityAgentConcierge.ts"), "utf8");
const conciergeCore = readFileSync(join(root, "convex/communityAgentConciergeCore.ts"), "utf8");
const interactions = readFileSync(join(root, "convex/communityInteractions.ts"), "utf8");
const crons = readFileSync(join(root, "convex/crons.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextConst === -1 ? source.length : nextConst);
}

assert.match(
  packageJson,
  /"check:community-agent-concierge-intake-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_concierge_intake_contract_proof\.ts"/,
  "package scripts should expose the Concierge intake proof",
);

assert.match(
  schema,
  /communityAgentServeRequests: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)[\s\S]*agentKey: v\.string\(\)[\s\S]*sourceMentionId: v\.id\("communityInteractionMentions"\)[\s\S]*requesterUserId: v\.optional\(v\.id\("users"\)\)[\s\S]*sponsorUserId: v\.optional\(v\.id\("users"\)\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("queued"\)[\s\S]*v\.literal\("skipped"\)[\s\S]*v\.literal\("running"\)[\s\S]*v\.literal\("responded"\)[\s\S]*v\.literal\("error"\)[\s\S]*intakeReason: v\.union\([\s\S]*v\.literal\("accepted"\)[\s\S]*v\.literal\("requester_connection_missing"\)/,
  "schema should include the serve request intake ledger with queued/skipped lifecycle",
);
assert.match(
  schema,
  /communityAgentServeRequests: defineTable\([\s\S]*\.index\("by_sourceMention", \["sourceMentionId"\]\)[\s\S]*\.index\("by_status_createdAt", \["status", "createdAt"\]\)[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)[\s\S]*\.index\("by_requester_createdAt", \["requesterUserId", "createdAt"\]\)/,
  "serve request table should be idempotent by source mention and queryable by status/community/requester",
);

const block = exportedFunctionBlock(concierge, "consumePendingCommunityAgentMentionsInternal");
assert.match(
  block,
  /export const consumePendingCommunityAgentMentionsInternal = internalMutation/,
  "Concierge repair drain should be internal-only",
);
assert.match(
  interactions,
  /import \{ intakeCommunityAgentMention \} from "\.\/communityAgentConciergeCore"/,
  "community interaction writes should use the shared Concierge intake core",
);
assert.match(
  interactions,
  /const mentionId = await args\.ctx\.db\.insert\("communityInteractionMentions" as any,[\s\S]*if \(spec\.kind === "community_agent"\) \{[\s\S]*await intakeCommunityAgentMention\(\{[\s\S]*mention:[\s\S]*_id: mentionId[\s\S]*communityId: args\.communityId[\s\S]*mentionedAgentKey: spec\.agentKey[\s\S]*notifyState: "pending"/,
  "community-agent mentions should be born into Concierge intake immediately after mention insert",
);
assert.match(
  interactions,
  /catch \{[\s\S]*repair cron will retry the still-pending mention/,
  "birth-time Concierge intake should not make chat posting fragile",
);
assert.match(
  block,
  /query\("communityInteractionMentions"[\s\S]*withIndex\("by_mentionKind_notifyState_createdAt"[\s\S]*q\.eq\("mentionKind", "community_agent"\)\.eq\("notifyState", "pending"\)[\s\S]*\.take\(limit\)/,
  "Concierge repair drain should consume only bounded leftover pending community-agent mentions",
);
assert.match(
  block,
  /repair: true/,
  "cron path should identify itself as a repair drain, not the primary product path",
);
assert.match(
  conciergeCore,
  /existingServeRequestForMention[\s\S]*query\("communityAgentServeRequests"[\s\S]*withIndex\("by_sourceMention"[\s\S]*q\.eq\("sourceMentionId", mentionId\)/,
  "Concierge intake should lookup sourceMentionId before insert for retry idempotency",
);
assert.match(
  conciergeCore,
  /agentKey: CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*sourceMentionId: args\.mention\._id/,
  "serve request rows should bind to the canonical community agent and source mention",
);
assert.match(
  conciergeCore,
  /if \(args\.status === "queued"\) \{[\s\S]*normalizeIdValue\(sponsorUserId\) !== normalizeIdValue\(args\.requesterUserId\)[\s\S]*community_agent_serve_request_sponsor_must_equal_requester/,
  "queued serve requests must enforce sponsorUserId equals requesterUserId",
);
assert.match(
  conciergeCore,
  /source\.actorType !== "human"[\s\S]*intakeReason: "source_not_human"/,
  "Concierge intake should reject non-human source mentions to prevent agent loops",
);
assert.match(
  conciergeCore,
  /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.mention\.communityId[\s\S]*userId: source\.requesterUserId/,
  "Concierge intake should require requester chat access at processing time",
);
assert.match(
  conciergeCore,
  /latestCommunityAgentConfig[\s\S]*config\?\.agentEnabled === false[\s\S]*intakeReason: "agent_disabled"/,
  "Concierge intake should respect the community agent off switch",
);
assert.match(
  conciergeCore,
  /resolveCommunityInferenceFundingAdmission[\s\S]*funding\.mode === "legacy_requester_chatgpt"[\s\S]*requesterHasChatgptConnection/,
  "Concierge intake should require requester ChatGPT only during the approved-founder transition",
);
assert.doesNotMatch(
  concierge + conciergeCore,
  /runChatgptNativeToolCompletion|runOpenAiNativeToolCompletion|runNativeRuntimeKernel|createCommunityAgentRunInternal|runCommunityAgentCycleInternal/,
  "Concierge intake must not call an LLM or create runtime runs",
);
assert.doesNotMatch(
  concierge + conciergeCore,
  /communityInteractionReplies"[\s\S]*insert|communityInteractionRoots"[\s\S]*insert|communitySourceTraces"[\s\S]*insert|communityIntelligenceNodes|communityIntelligenceChangeRequests|communityIntelligenceMutations/,
  "Concierge intake must not write chat replies, source traces, or memory truth",
);
assert.match(
  conciergeCore,
  /settleMentionRowInternal[\s\S]*toState: mentionSettledStateForServeStatus\(args\.status\)/,
  "Concierge intake should use mention notifyState only as the narrow drain marker",
);
assert.match(
  conciergeCore,
  /scheduleImmediateServeWorker[\s\S]*ctx\.scheduler\.runAfter\([\s\S]*communityAgentServeWorker\.processQueuedCommunityAgentServeRequestsInternal[\s\S]*requestId: args\.requestId[\s\S]*limit: 1/,
  "accepted Concierge intake should immediately schedule the serve worker for the exact request",
);
assert.match(
  conciergeCore,
  /catch \{[\s\S]*serve repair cron will drain it/,
  "immediate serve scheduling failure should not fail the chat write",
);
assert.match(
  conciergeCore,
  /const requestId = await insertServeRequest\([\s\S]*status: "queued"[\s\S]*await settleMentionFromServeRequest[\s\S]*await scheduleImmediateServeWorker\(\{[\s\S]*requestId/,
  "accepted intake should settle the mention and schedule serve after the queued request exists",
);
assert.match(
  crons,
  /"process pending community agent mentions",\s*\{ minutes: 5 \},[\s\S]*communityAgentConcierge\.consumePendingCommunityAgentMentionsInternal[\s\S]*\{ limit: 25 \}/,
  "Concierge repair drain should run as a bounded deterministic cron",
);
assert.match(
  docs,
  /birth-time intake[\s\S]*repair drain[\s\S]*No LLM, no reply, no memory write[\s\S]*sponsorUserId == requesterUserId[\s\S]*active existing-founder grant[\s\S]*communityAgentServeRequests/,
  "architecture docs should describe birth-time Concierge intake plus repair drain",
);

console.log("community_agent_concierge_intake_contract_proof: ok");
