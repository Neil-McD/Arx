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
const contract = read("shared/communityPresenceContract.ts");
const core = read("convex/communityPresenceCore.ts");
const communityPublic = read("convex/communityPublic.ts");
const directMessageEmails = read("convex/directMessageEmails.ts");
const gateway = read("shared/cloudPublicFunnelGateway.ts");
const controller = read(
  "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
);
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const facepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");

const presenceSchema = sectionBetween(
  schema,
  "communityPresence: defineTable",
  "communityJoinRequests: defineTable",
);
const heartbeat = sectionBetween(
  communityPublic,
  "export const heartbeatCommunityPresence",
  "export const getCommunityPresenceSummary",
);
const summaryQuery = sectionBetween(
  communityPublic,
  "export const getCommunityPresenceSummary",
  "export const listPublicDiscoverCommunities",
);
const summaryResolverStart = core.indexOf(
  "export async function resolveMemberCommunityPresenceSummary",
);
assert.ok(summaryResolverStart >= 0, "missing member presence summary resolver");
const summaryResolver = core.slice(summaryResolverStart);
const presenceEffect = sectionBetween(
  controller,
  "if (!params.session || !params.activeCommunityId) {\n      setActiveCommunityPresenceSummaryState(null);",
  "useEffect(() => {\n    setActiveCommunityPresenceSummaryState(null);",
);

assert.match(
  schema,
  /communityPresence: defineTable\(\{[\s\S]*activeUntil: v\.optional\(v\.number\(\)\)[\s\S]*\.index\("by_community_activeUntil", \["communityId", "activeUntil"\]\)[\s\S]*\.index\("by_user_activeUntil", \["userId", "activeUntil"\]\)/,
  "community presence must expose additive community and user active-lease indexes",
);
assert.doesNotMatch(
  presenceSchema,
  /(tabId|sessionId|clientId|deviceId):/,
  "community presence ownership must remain one community-user row, not one row per client",
);

assert.match(
  contract,
  /COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000[\s\S]*COMMUNITY_PRESENCE_LEASE_DURATION_MS = 90_000[\s\S]*COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT = 64/,
  "presence timing and read bounds must have one canonical owner",
);
assert.match(
  contract,
  /issueCommunityPresenceLease[\s\S]*activeUntil: lastSeenAt \+ COMMUNITY_PRESENCE_LEASE_DURATION_MS/,
  "presence leases must be derived from server time and the canonical duration",
);
assert.match(
  core,
  /renewCommunityPresenceLease[\s\S]*withIndex\("by_community_user"[\s\S]*ctx\.db\.patch[\s\S]*ctx\.db\.insert/,
  "heartbeats must coalesce through the community-user identity before inserting",
);

assert.match(
  heartbeat,
  /requireCommunityChatAccess[\s\S]*renewCommunityPresenceLease/,
  "the server must authorize every heartbeat before issuing a lease",
);
assert.doesNotMatch(
  heartbeat,
  /activeUntil: v\.|lastSeenAt: v\./,
  "clients must not supply lease timestamps",
);
assert.match(
  summaryQuery,
  /requireCommunityChatAccess[\s\S]*resolveMemberCommunityPresenceSummary[\s\S]*online_count_capped/,
  "member presence reads must stay authorized and expose lower-bound count state",
);
assert.doesNotMatch(
  summaryQuery,
  /resolvePublicCommunityStats|joined_last_30d_count|member_faces_preview/,
  "the hot member presence path must not materialize the public funnel projection",
);
assert.match(
  summaryResolver,
  /by_community_activeUntil[\s\S]*\.take\(COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT \+ 1\)[\s\S]*communityPresenceUserRemainsAuthorized[\s\S]*readCommunityActiveMemberCount/,
  "member presence must use a bounded active-window read, reauthorize candidates, and use the durable count",
);

assert.match(
  gateway,
  /export async function refreshCloudCommunityPresence[\s\S]*bootstrapConvexAuthenticatedClient[\s\S]*client\.mutation\("communityPublic:heartbeatCommunityPresence"[\s\S]*client\.query\("communityPublic:getCommunityPresenceSummary"/,
  "one gateway refresh must reuse one authenticated client for the separate write and read",
);
assert.doesNotMatch(
  gateway,
  /export async function (heartbeat|fetch)CloudCommunityPresence/,
  "the frontend gateway must not expose duplicate presence scheduling primitives",
);
assert.match(
  presenceEffect,
  /let inFlight = false[\s\S]*refreshCloudCommunityPresence[\s\S]*finally \{[\s\S]*inFlight = false[\s\S]*COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS[\s\S]*visibilitychange/,
  "the visible-tab scheduler must prevent overlapping refreshes and resume immediately",
);
assert.equal(
  (presenceEffect.match(/window\.setInterval/g) ?? []).length,
  1,
  "community presence must have exactly one interval owner",
);

assert.match(
  directMessageEmails,
  /by_user_activeUntil[\s\S]*gt\("activeUntil", Date\.now\(\)\)[\s\S]*skipped: "present"/,
  "DM email suppression must consume the canonical active lease",
);
assert.doesNotMatch(
  directMessageEmails,
  /lastSeenAt >= Number\(message\.createdAt/,
  "DM email suppression must not infer current presence from message-relative last-seen time",
);

assert.match(
  contextPanel,
  /onlineCountCapped\?: boolean[\s\S]*onlineCountLabel = `\$\{onlineTotal\}\$\{props\.onlineCountCapped \? "\+" : ""\}`/,
  "the member rail must label bounded online counts as lower bounds",
);
assert.match(
  facepile,
  /onlineCountCapped\?: boolean[\s\S]*`\$\{onlineTotal\}\+`/,
  "the facepile must not present a capped count as exact",
);

console.log("community_presence_lease_contract_proof: ok");
