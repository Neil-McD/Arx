import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gateway = readFileSync(join(root, "shared/cloudCommunityChatGateway.ts"), "utf8");
const dataController = readFileSync(join(root, "shared/useCommunityChatDataController.ts"), "utf8");
const mutationController = readFileSync(join(root, "shared/useCommunityChatMutationController.ts"), "utf8");
const communityChat = readFileSync(join(root, "convex/communityChat.ts"), "utf8");
const communityFacade = readFileSync(join(root, "convex/community.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function extractExportedConst(source: string, name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  assert.notEqual(start, -1, `expected exported const ${name}`);
  const next = source.indexOf("\nexport const ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

assert.match(
  packageJson,
  /"check:community-chat-cleanup-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_chat_cleanup_contract_proof\.ts"/,
  "package scripts should expose the community chat cleanup proof",
);

for (const [label, source] of [
  ["chat gateway", gateway],
  ["chat data controller", dataController],
  ["chat mutation controller", mutationController],
  ["community chat backend", communityChat],
  ["community facade", communityFacade],
] as const) {
  assert.doesNotMatch(source, /listCloudThreadUserMessageSenderIds|listThreadUserMessageSenderIds/, `${label} should not keep the unused sender-list query path`);
}

assert.doesNotMatch(gateway, /void params\.init|init\?: RequestInit/, "chat gateway Convex calls should not advertise ignored RequestInit options");
assert.doesNotMatch(gateway, /void params\.senderId|senderId: string/, "chat edit/delete gateway calls should not accept ignored senderId params");
assert.doesNotMatch(dataController, /init:\s*\{\s*signal:/, "chat data controller should not pass fake abort signals into Convex gateway calls");
assert.doesNotMatch(dataController, /communityFetchAbortScope|beginScopedAbortRequest|finishScopedAbortRequest|abortAllScopedRequests|isAbortError/, "chat data controller should not keep fake Convex abort plumbing");
assert.doesNotMatch(mutationController, /senderId:\s*session\.user\.id/, "chat mutation controller should trust backend auth instead of forwarding senderId hints");

assert.match(
  schema,
  /communityChatThreads: defineTable\(\{[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)/,
  "community chat threads should have a bounded canonical lookup index",
);
assert.match(
  schema,
  /communityTypingPresence: defineTable\(\{[\s\S]*\.index\("by_community_displayUntil", \["communityId", "displayUntil"\]\)/,
  "community typing presence should have a bounded active-window lookup index",
);
assert.match(
  communityChat,
  /withIndex\("by_community_createdAt", \(q: any\) => q\.eq\("communityId", communityId\)\)[\s\S]*\.order\("asc"\)[\s\S]*\.first\(\)/,
  "canonical community chat thread lookup should be bounded by index + first",
);
assert.doesNotMatch(
  communityChat,
  /function listCommunityChatThreadsForCommunity|const rows = \(await ctx\.db\s*\.query\("communityChatThreads"\)\s*\.withIndex\("by_community",[\s\S]{0,300}\.collect\(\)|\.sort\(\(a, b\) => a\.createdAt - b\.createdAt/,
  "canonical chat-thread lookup should not collect and sort all community threads",
);

const listCommunityTyping = extractExportedConst(communityChat, "listCommunityTyping");
assert.match(listCommunityTyping, /MAX_TYPING_PRESENCE_SCAN_ROWS/, "typing presence reads should use a named scan cap");
assert.match(
  listCommunityTyping,
  /withIndex\("by_community_displayUntil", \(q: any\) =>[\s\S]*\.gt\("displayUntil", nowMs\)[\s\S]*\.order\("desc"\)[\s\S]*\.take\(MAX_TYPING_PRESENCE_SCAN_ROWS\)/,
  "typing presence reads should use the active-window index and bounded take",
);
assert.doesNotMatch(listCommunityTyping, /\.collect\(\)|\.sort\(/, "typing presence reads should not collect/sort all community typing rows");

const deleteOwnMessage = extractExportedConst(communityChat, "deleteOwnMessage");
assert.match(deleteOwnMessage, /MAX_REACTION_DELETE_ROWS/, "message delete should use a named reaction-delete cap");
assert.match(
  deleteOwnMessage,
  /\.take\(MAX_REACTION_DELETE_ROWS \+ 1\)[\s\S]*message_reaction_delete_limit_exceeded/,
  "message delete should fail closed instead of collecting unbounded reactions",
);

const listMessageReactions = extractExportedConst(communityChat, "listMessageReactions");
assert.match(listMessageReactions, /MAX_REACTION_MESSAGE_IDS_PER_REQUEST/, "reaction reads should cap message ids");
assert.match(listMessageReactions, /MAX_REACTIONS_PER_MESSAGE/, "reaction reads should cap reactions per message");
assert.doesNotMatch(listMessageReactions, /\.collect\(\)/, "reaction reads should not collect unbounded reactions per message");

console.log("community_chat_cleanup_contract_proof: ok");
