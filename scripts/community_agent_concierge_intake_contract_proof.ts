import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const concierge = readFileSync(join(root, "convex/communityAgentConcierge.ts"), "utf8");
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
  "Concierge intake should be internal-only",
);
assert.match(
  block,
  /query\("communityInteractionMentions"[\s\S]*withIndex\("by_mentionKind_notifyState_createdAt"[\s\S]*q\.eq\("mentionKind", "community_agent"\)\.eq\("notifyState", "pending"\)[\s\S]*\.take\(limit\)/,
  "Concierge intake should consume only bounded pending community-agent mentions",
);
assert.match(
  concierge,
  /existingServeRequestForMention[\s\S]*query\("communityAgentServeRequests"[\s\S]*withIndex\("by_sourceMention"[\s\S]*q\.eq\("sourceMentionId", mentionId\)/,
  "Concierge intake should lookup sourceMentionId before insert for retry idempotency",
);
assert.match(
  concierge,
  /agentKey: CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*sourceMentionId: args\.mention\._id/,
  "serve request rows should bind to the canonical community agent and source mention",
);
assert.match(
  concierge,
  /if \(args\.status === "queued"\) \{[\s\S]*normalizeIdValue\(sponsorUserId\) !== normalizeIdValue\(args\.requesterUserId\)[\s\S]*community_agent_serve_request_sponsor_must_equal_requester/,
  "queued serve requests must enforce sponsorUserId equals requesterUserId",
);
assert.match(
  concierge,
  /source\.actorType !== "human"[\s\S]*intakeReason: "source_not_human"/,
  "Concierge intake should reject non-human source mentions to prevent agent loops",
);
assert.match(
  concierge,
  /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.mention\.communityId[\s\S]*userId: source\.requesterUserId/,
  "Concierge intake should require requester chat access at processing time",
);
assert.match(
  concierge,
  /latestCommunityAgentConfig[\s\S]*config\?\.agentEnabled === false[\s\S]*intakeReason: "agent_disabled"/,
  "Concierge intake should respect the community agent off switch",
);
assert.match(
  concierge,
  /requesterHasChatgptConnection[\s\S]*query\("userProviderConnections"[\s\S]*withIndex\("by_user_provider"[\s\S]*q\.eq\("userId", requesterUserId\)\.eq\("provider", "chatgpt"\)[\s\S]*row\?\.encryptedSecretHex/,
  "Concierge intake should require the requester's own ChatGPT connection",
);
assert.doesNotMatch(
  concierge,
  /community\.ownerId|getChatgptConnectionForUserInternal|runChatgptNativeToolCompletion|runNativeRuntimeKernel|createCommunityAgentRunInternal|runCommunityAgentCycleInternal/,
  "Concierge intake must not use owner funding, call an LLM, or create runtime runs",
);
assert.doesNotMatch(
  concierge,
  /communityInteractionReplies"[\s\S]*insert|communityInteractionRoots"[\s\S]*insert|communitySourceTraces"[\s\S]*insert|communityIntelligenceNodes|communityIntelligenceChangeRequests|communityIntelligenceMutations/,
  "Concierge intake must not write chat replies, source traces, or memory truth",
);
assert.match(
  concierge,
  /settleMentionRowInternal[\s\S]*toState: mentionSettledStateForServeStatus\(args\.status\)/,
  "Concierge intake should use mention notifyState only as the narrow drain marker",
);
assert.match(
  crons,
  /"process pending community agent mentions",\s*\{ minutes: 5 \},[\s\S]*communityAgentConcierge\.consumePendingCommunityAgentMentionsInternal[\s\S]*\{ limit: 25 \}/,
  "Concierge intake should run as a bounded deterministic cron",
);
assert.match(
  docs,
  /Concierge intake ledger[\s\S]*No LLM, no reply, no memory write[\s\S]*Owner funds sleep[\s\S]*asker funds serve[\s\S]*communityAgentServeRequests/,
  "architecture docs should describe the first Concierge intake slice",
);

console.log("community_agent_concierge_intake_contract_proof: ok");
