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

function functionBlock(source: string, functionName: string): string {
  const startToken = `async function ${functionName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nasync function ", start + startToken.length);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

assert.match(
  packageJson,
  /"check:community-agent-concierge-intake-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_concierge_intake_contract_proof\.ts && vitest run convex\/communityAgentConciergeCore\.test\.ts"/,
  "package scripts should expose the Concierge intake proof",
);

assert.match(
  schema,
  /communityAgentServeRequests: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)[\s\S]*agentKey: v\.string\(\)[\s\S]*sourceMentionId: v\.optional\(v\.id\("communityInteractionMentions"\)\)[\s\S]*invocationKey: v\.optional\(v\.string\(\)\)[\s\S]*triggerKind: v\.optional\(v\.union\([\s\S]*v\.literal\("mention"\)[\s\S]*v\.literal\("direct_reply"\)[\s\S]*requesterUserId: v\.optional\(v\.id\("users"\)\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("queued"\)[\s\S]*v\.literal\("skipped"\)[\s\S]*v\.literal\("running"\)[\s\S]*v\.literal\("responded"\)[\s\S]*v\.literal\("error"\)/,
  "schema should include rolling-compatible source-turn admission fields and serve lifecycle",
);
assert.match(
  schema,
  /communityAgentServeRequests: defineTable\([\s\S]*\.index\("by_sourceMention", \["sourceMentionId"\]\)[\s\S]*\.index\("by_community_invocationKey", \["communityId", "invocationKey"\]\)[\s\S]*\.index\("by_sourceReply", \["sourceReplyId"\]\)[\s\S]*\.index\("by_requester_createdAt", \["requesterUserId", "createdAt"\]\)/,
  "serve request table should dedupe canonical source turns while retaining legacy mention lookup",
);

assert.doesNotMatch(
  concierge,
  /consumePendingCommunityAgentMentionsInternal|intakeCommunityAgentMention|CONCIERGE_REPAIR_/,
  "Concierge must not retain a polling repair consumer or repair-only helpers",
);
assert.match(
  interactions,
  /intakeCommunityAgentTurn,[\s\S]*from "\.\/communityAgentConciergeCore"/,
  "community interaction writes should use the shared Concierge intake core",
);
assert.match(
  interactions,
  /const mentionRows = await insertCommunityInteractionMentionRows\([\s\S]*communityAgentMention = mentionRows\.communityAgentMention[\s\S]*if \(actorType === "human"\) \{[\s\S]*await intakeCommunityAgentTurn\([\s\S]*rootId: root\._id/,
  "canonical human roots should enter source-turn admission after persistence",
);
assert.match(
  interactions,
  /if \(actorType === "human"\) \{[\s\S]*await intakeCommunityAgentTurn\([\s\S]*replyId: reply\._id/,
  "canonical human replies should enter the same source-turn admission path",
);
assert.match(
  conciergeCore,
  /existingServeRequestForInvocation[\s\S]*withIndex\("by_community_invocationKey"[\s\S]*q\.eq\("communityId", args\.communityId\)\.eq\("invocationKey", args\.invocationKey\)[\s\S]*existingServeRequestForMention[\s\S]*withIndex\("by_sourceReply"/,
  "Concierge intake should prefer the source-turn invocation key and fall back to rolling legacy locators",
);
assert.match(
  conciergeCore,
  /agentKey: CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*sourceMentionId: args\.mention\._id[\s\S]*invocationKey: args\.invocationKey[\s\S]*triggerKind: args\.triggerKind/,
  "serve requests should bind the canonical agent to one source-turn invocation",
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
  /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.communityId[\s\S]*userId: source\.requesterUserId/,
  "Concierge intake should require requester chat access at processing time",
);
assert.match(
  conciergeCore,
  /reply\?\.targetReplyId[\s\S]*target\.status === "live"[\s\S]*target\.actorType === "community_agent"[\s\S]*target\.actorAgentKey === CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*target\.communityId[\s\S]*reply\.communityId[\s\S]*target\.rootId[\s\S]*reply\.rootId[\s\S]*return "direct_reply"[\s\S]*if \(args\.mention\) return "mention"[\s\S]*!reply\.targetReplyId[\s\S]*root\?\.actorType === "community_agent"[\s\S]*root\.actorAgentKey === CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*return "direct_reply"/,
  "admission should recognize only a live canonical-agent target, explicit mention, or an untargeted reply under a canonical agent root",
);
assert.doesNotMatch(
  schema + conciergeCore,
  /participating_thread|priorAgentReply|by_root_actor_status_seq/,
  "admission must not wake the agent merely because it previously participated in the thread",
);
assert.match(
  conciergeCore,
  /latestCommunityAgentConfig[\s\S]*config\?\.agentEnabled === false[\s\S]*intakeReason: "agent_disabled"/,
  "Concierge intake should respect the community agent off switch",
);
assert.match(
  conciergeCore,
  /resolveCommunityInferenceFundingAdmission[\s\S]*funding\.code === "founder_plan_required"[\s\S]*community requires an active founder plan/,
  "Concierge intake should fail closed unless hosted community inference is funded",
);
assert.doesNotMatch(
  conciergeCore,
  /legacy_requester_chatgpt|requesterHasChatgptConnection|owner_funding_choice_required|owner_credential_missing|owner_funding_suspended/,
  "Concierge intake must not expose requester or owner BYOK states",
);
assert.doesNotMatch(
  concierge + conciergeCore,
  /runChatgptNativeToolCompletion|runOpenAiNativeToolCompletion|runNativeRuntimeKernel|createCommunityAgentRunInternal|runCommunityAgentCycleInternal/,
  "Concierge intake must not call an LLM or create runtime runs",
);
assert.doesNotMatch(
  concierge + conciergeCore,
  /db\.insert\("communityInteractionReplies"|db\.insert\("communityInteractionRoots"|db\.insert\("communitySourceTraces"|db\.insert\("communityIntelligenceNodes"|db\.insert\("communityIntelligenceChangeRequests"|db\.insert\("communityIntelligenceMutations"/,
  "Concierge intake must not write chat replies, source traces, or memory truth",
);
assert.match(
  conciergeCore,
  /settleMentionRowInternal[\s\S]*toState: mentionSettledStateForServeStatus\(args\.status\)/,
  "Concierge intake should use mention notifyState only as the narrow drain marker",
);
assert.match(
  conciergeCore,
  /COMMUNITY_AGENT_SERVE_RECOVERY_DELAYS_MS[\s\S]*scheduleImmediateServeWorker[\s\S]*for \(const delayMs of COMMUNITY_AGENT_SERVE_RECOVERY_DELAYS_MS\)[\s\S]*ctx\.scheduler\.runAfter\([\s\S]*delayMs[\s\S]*communityAgentServeWorker\.processQueuedCommunityAgentServeRequestsInternal/,
  "accepted Concierge intake should atomically schedule a finite request-scoped recovery budget",
);
assert.doesNotMatch(
  functionBlock(conciergeCore, "scheduleImmediateServeWorker"),
  /catch \{/,
  "serve scheduling must remain atomic with request intake instead of swallowing failures",
);
assert.match(
  conciergeCore,
  /const requestId = await insertServeRequest\([\s\S]*status: "queued"[\s\S]*await settleMentionFromServeRequest[\s\S]*await scheduleImmediateServeWorker\(\{[\s\S]*requestId/,
  "accepted intake should settle the mention and schedule serve after the queued request exists",
);
assert.doesNotMatch(
  crons + concierge + conciergeCore,
  /process pending community agent mentions|consumePendingCommunityAgentMentionsInternal|intakeCommunityAgentMention/,
  "community-agent mention intake must not retain a fixed polling repair path",
);
assert.doesNotMatch(
  interactions,
  /block\.blockType === "mention"/,
  "content blocks must not retain an alternate mention-row writer",
);
assert.match(
  interactions,
  /args\.mentions\?\.some\(\(mention\) => Boolean\(String\(mention\.agentKey[\s\S]*interaction_mention_agent_self_reference/,
  "community-agent-authored turns must reject community-agent self-mentions",
);
assert.match(
  docs,
  /birth-time intake[\s\S]*No LLM, no reply, no memory write[\s\S]*sponsorUserId == requesterUserId[\s\S]*has no polling repair drain/,
  "architecture docs should describe atomic birth-time intake without polling",
);
assert.match(
  docs,
  /An active founder subscription attached to the community[\s\S]*canonical operator grant[\s\S]*never falls back to a stored credential/,
  "architecture docs should describe hosted-only Concierge funding authority",
);

console.log("community_agent_concierge_intake_contract_proof: ok");
