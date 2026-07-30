import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sectionBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const schema = read("convex/schema.ts");
const timingContract = read("shared/typingPresenceContract.ts");
const core = read("convex/communityTypingPresenceCore.ts");
const communityChat = read("convex/communityChat.ts");
const gateway = read("shared/cloudCommunityChatGateway.ts");
const hook = read("shared/useCommunityTypingPresence.ts");
const webAttention = read(
  "apps/web/src/controllers/useWebCommunityAttentionController.ts",
);
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const interactionProjection = read(
  "apps/web/src/components/WebCommunityInteractionProjection.tsx",
);
const interactionFeed = read(
  "apps/web/src/components/communityInteractionFeed.tsx",
);
const docs = read("docs/community-interaction-substrate-contract-v1.md");
const packageJson = read("package.json");
const foundationGate = read("scripts/foundation_baseline_gate.sh");

const typingSchema = sectionBetween(
  schema,
  "communityTypingPresence: defineTable",
  "communityInteractionRoots: defineTable",
);
const setTyping = sectionBetween(
  communityChat,
  "export const setCommunityTyping",
  "export const clearCommunityTyping",
);
const clearTyping = sectionBetween(
  communityChat,
  "export const clearCommunityTyping",
  "export const listCommunityTyping",
);
const listTyping = sectionBetween(
  communityChat,
  "export const listCommunityTyping",
  "export const createThreadUserMessage",
);
const subscriptionLifecycle = sectionBetween(
  hook,
  "useEffect(() => {\n    if (!args.isEnabled || !args.session || !args.activeCommunityId)",
  "useEffect(() => {\n    if (!args.isEnabled || !args.activeCommunityId) return;",
);
const typingScopeLifecycle = sectionBetween(
  hook,
  "useEffect(() => {\n    if (!args.isEnabled || !args.activeCommunityId) return;",
  "useEffect(() => {\n    if (presence.users.length === 0) return;",
);

assert.match(
  timingContract,
  /TYPING_PRESENCE_LEASE_DURATION_MS = 5_000[\s\S]*TYPING_PRESENCE_RENEW_INTERVAL_MS = 2_000[\s\S]*COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT = 25[\s\S]*COMMUNITY_TYPING_PRESENCE_VISIBLE_LIMIT = 12/,
  "typing lease timing and community bounds must have one shared owner",
);
assert.match(
  timingContract,
  /issueTypingPresenceLease[\s\S]*displayUntil: updatedAt \+ TYPING_PRESENCE_LEASE_DURATION_MS/,
  "typing leases must be derived from server time",
);
assert.doesNotMatch(
  typingSchema,
  /(tabId|sessionId|clientId|deviceId):/,
  "community typing ownership must remain one community-user row",
);
assert.match(
  typingSchema,
  /\.index\("by_community_user", \["communityId", "userId"\]\)[\s\S]*\.index\("by_community_displayUntil", \["communityId", "displayUntil"\]\)/,
  "community typing must retain identity and active-window indexes",
);

assert.match(
  core,
  /renewCommunityTypingLease[\s\S]*withIndex\("by_community_user"[\s\S]*ctx\.db\.patch[\s\S]*ctx\.db\.insert/,
  "typing renewals must coalesce through community-user identity",
);
assert.match(
  core,
  /requireCommunityTypingRoot[\s\S]*root\.communityId[\s\S]*community_typing_scope_invalid/,
  "thread typing must fail closed when the root is outside the community",
);
assert.match(
  core,
  /clearCommunityTypingLease[\s\S]*normalizeTypingRootId\(existing\.rootId\)[\s\S]*requestedRootId[\s\S]*ctx\.db\.delete/,
  "typing clears must delete only the currently matching scope",
);
assert.match(
  core,
  /withIndex\("by_community_displayUntil"[\s\S]*\.take\(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT \+ 1\)/,
  "typing reads must use the active-window index and bounded overfetch",
);
assert.match(
  core,
  /communityTypingCandidateRemainsAuthorized[\s\S]*requireCommunityChatAccess/,
  "typing candidates must be reauthorized before projection",
);
assert.match(
  core,
  /totalCountCapped: scanWasTruncated/,
  "bounded typing counts must disclose truncation",
);
assert.doesNotMatch(
  core,
  /\.collect\(\)|\.sort\(/,
  "the typing hot path must not collect or sort whole tables",
);

assert.match(
  setTyping,
  /resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess[\s\S]*renewCommunityTypingLease/,
  "every typing renewal must authenticate and authorize before issuing a lease",
);
assert.doesNotMatch(
  setTyping,
  /displayUntil: v\.|updatedAt: v\./,
  "clients must not supply lease timestamps",
);
assert.match(
  clearTyping,
  /resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess[\s\S]*clearCommunityTypingLease/,
  "typing clear must remain authenticated, authorized, and scope-aware",
);
assert.match(
  listTyping,
  /requireCommunityChatAccess[\s\S]*resolveCommunityTypingPresence[\s\S]*total_count_capped/,
  "typing reads must use the canonical authorized projection",
);

assert.match(
  gateway,
  /setCloudCommunityTyping[\s\S]*communityChat:setCommunityTyping[\s\S]*clearCloudCommunityTyping[\s\S]*communityChat:clearCommunityTyping/,
  "the web gateway must expose the canonical renew and clear pair",
);
assert.match(
  hook,
  /activeScopeRef[\s\S]*signalTyping[\s\S]*clearTyping/,
  "one hook must own the active typing scope and its lifecycle",
);
assert.match(
  hook,
  /writeQueueRef[\s\S]*\.catch\(\(\) => undefined\)[\s\S]*\.then/,
  "renew and clear writes must be serialized so a delayed renewal cannot resurrect a cleared scope",
);
assert.match(
  hook,
  /TYPING_PRESENCE_RENEW_INTERVAL_MS/,
  "the community hook must use the shared renewal interval",
);
assert.match(
  hook,
  /clearCloudCommunityTyping/,
  "the community hook must explicitly clear typing while retaining lease expiry as fallback",
);
assert.doesNotMatch(
  subscriptionLifecycle,
  /activeScopeRef|clearCloudCommunityTyping/,
  "auth refresh may reconnect the live subscription but must not clear the active typing scope",
);
assert.match(
  typingScopeLifecycle,
  /clearCloudCommunityTyping[\s\S]*\}, \[args\.activeCommunityId, args\.isEnabled\]\);/,
  "only community or surface lifecycle changes may clear the active typing scope",
);
assert.doesNotMatch(
  webAttention,
  /setCloudCommunityTyping|threadTypingLastSentAtRef|< 600/,
  "the web attention controller must not retain a second typing writer or throttle",
);
assert.match(
  webAttention,
  /presence: typingPresence,[\s\S]*signalTyping,[\s\S]*clearTyping/,
  "the web controller must expose the single hook-owned typing lifecycle",
);
assert.match(
  chatPanel,
  /communityMessageInput\.trim\(\)[\s\S]*onCommunityTypingSignal\?\.\(null\)[\s\S]*onCommunityTypingClear\?\.\(null\)/,
  "channel typing must signal on text and clear when empty",
);
assert.match(
  chatPanel,
  /drawerReplyInput\.trim\(\)[\s\S]*onCommunityTypingSignal\?\.\(selectedInteractionRootId\)[\s\S]*onCommunityTypingClear\?\.\(selectedInteractionRootId\)/,
  "thread typing must signal and clear within its exact root scope",
);
assert.match(
  chatPanel,
  /onBlur=\{\(\) => \{[\s\S]*onCommunityTypingClear\?\.\(null\)[\s\S]*onBlur=\{\(\) => \{[\s\S]*onCommunityTypingClear\?\.\(selectedInteractionRootId\)/,
  "channel and thread composers must clear typing on blur",
);
assert.match(
  interactionProjection,
  /countCapped=\{Boolean\(props\.typingPresence\?\.total_count_capped\)\}/,
  "interaction typing indicators must receive bounded-count state",
);
assert.match(
  interactionFeed,
  /props\.countCapped \? "\+" : ""/,
  "typing labels must present capped counts as lower bounds",
);

assert.match(
  docs,
  /Typing presence is an ephemeral server-issued lease[\s\S]*one community-user row[\s\S]*scope-aware clear/,
  "the substrate contract must document canonical typing ownership and failure semantics",
);
assert.match(
  packageJson,
  /"check:community-typing-presence-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_typing_presence_contract_proof\.ts"/,
  "package scripts must expose the typing contract proof",
);
assert.match(
  foundationGate,
  /Community typing presence proof" npm run check:community-typing-presence-proof/,
  "the foundation baseline must enforce the typing contract",
);

console.log("community_typing_presence_contract_proof: ok");
