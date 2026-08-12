import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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
const communityDirectory = read("convex/communityDirectory.ts");
const membershipLifecycle = read("convex/communityMembershipLifecycle.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const directMessageEmails = read("convex/directMessageEmails.ts");
const gateway = read("shared/cloudPublicFunnelGateway.ts");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const controller = read(
  "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
);
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const facepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
const webAppContracts = read("apps/web/src/webAppContracts.ts");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const funnelSurface = read("apps/web/src/components/CommunityFunnelSurface.tsx");
const funnelMemberProof = read("apps/web/src/components/CommunityFunnelMemberProof.tsx");

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
const authorizedWindowResolver = sectionBetween(
  core,
  "export async function resolveAuthorizedCommunityPresenceWindow",
  "export async function resolveMemberCommunityPresenceSummary",
);
const publicStatsResolver = sectionBetween(
  communityPublic,
  "async function resolvePublicCommunityStats",
  "function mapPublicCommunityStats",
);
const publicStatsMapper = sectionBetween(
  communityPublic,
  "function mapPublicCommunityStats",
  "const PUBLIC_FEATURED_MESSAGE_LIMIT",
);
const presenceEffect = sectionBetween(
  controller,
  "let inFlight = false;",
  "useEffect(() => {\n    setActiveCommunityPresenceSummaryState(null);",
);
const directoryPageQuery = communityDirectory.slice(
  communityDirectory.indexOf("export const listCommunityDirectoryPage"),
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
  membershipLifecycle,
  /activateCommunityMembershipCore[\s\S]*ensureCommunityPresenceBaseline/,
  "every membership activation must establish its durable activity baseline",
);
assert.match(
  communityLifecycle,
  /createCommunity[\s\S]*ensureCommunityPresenceBaseline/,
  "community creation must establish the owner activity baseline",
);
assert.match(
  communityAdmin,
  /revokeCommunityMemberInternal[\s\S]*deleteCommunityPresenceForUser/,
  "member revocation must remove every presence row",
);
assert.equal(
  existsSync(new URL("../convex/communityPresenceBackfill.ts", import.meta.url)),
  false,
  "the completed one-time presence migration surface must stay deleted",
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
  authorizedWindowResolver,
  /by_community_activeUntil[\s\S]*\.take\(COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT \+ 1\)[\s\S]*communityPresenceUserRemainsAuthorized[\s\S]*return \{ entries, countCapped \}/,
  "the canonical presence window must use a bounded active-window read and reauthorize candidates",
);
assert.match(
  summaryResolver,
  /resolveAuthorizedCommunityPresenceWindow[\s\S]*readCommunityActiveMemberCount[\s\S]*onlineCountCapped: presenceWindow\.countCapped/,
  "member presence must consume the canonical window, durable count, and conservative cap state",
);

assert.match(
  publicStatsResolver,
  /resolveAuthorizedCommunityPresenceWindow[\s\S]*presenceWindow\.entries[\s\S]*COMMUNITY_PRESENCE_FACE_LIMIT/,
  "public presence must consume the same authorized bounded window and cap its facepile",
);
assert.doesNotMatch(
  publicStatsResolver,
  /query\("communityPresence"|by_community_lastSeenAt|COMMUNITY_PRESENCE_LEASE_DURATION_MS|\.collect\(\)/,
  "public presence must not own a second lease interpretation or unbounded presence read",
);
assert.match(
  publicStatsMapper,
  /online_count: stats\.onlineCount[\s\S]*online_count_capped: stats\.onlineCountCapped[\s\S]*online_faces: stats\.onlineFaces/,
  "public presence must disclose only a conservative count and bounded facepile",
);
assert.doesNotMatch(
  publicStatsMapper,
  /online_user_ids|online_last_active|last_active_at/,
  "the unauthenticated public projection must not disclose online identity lists or activity timestamps",
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
  /let inFlight = false[\s\S]*refreshCloudCommunityPresence[\s\S]*finally \{[\s\S]*inFlight = false[\s\S]*COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS[\s\S]*useResumeEpochEffect\(params\.resumeEpoch[\s\S]*refreshPresenceRef\.current/,
  "the visible-tab scheduler must prevent overlapping refreshes and consume the canonical resume epoch",
);
assert.doesNotMatch(
  presenceEffect,
  /params\.session\]/,
  "runtime token rotation must not restart the community presence scheduler",
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
  communityDirectory,
  /by_community_lastSeenAt[\s\S]*\.order\("desc"\)[\s\S]*\.paginate\(\{[\s\S]*maximumRowsRead:[\s\S]*readCommunityActiveMemberCount\(community\)/,
  "the member directory must page the durable activity ledger through one bounded canonical cursor",
);
assert.match(
  communityDirectory,
  /resolveCommunityPresenceAuthorization[\s\S]*last_active_at: toIsoString\(args\.lastSeenAt\)/,
  "directory activity ordering must reauthorize rows and expose the canonical timestamp",
);
assert.match(
  communityTypes,
  /last_active_at: string;/,
  "the directory gateway must carry canonical activity history",
);
assert.doesNotMatch(
  directoryGateway,
  /countCommunityDirectoryMembers/,
  "the directory gateway must not expose a recount surface",
);

assert.match(
  contextPanel,
  /onlineCountCapped\?: boolean[\s\S]*onlineCountIsLowerBound[\s\S]*onlineCountLabel = `\$\{onlineTotal\}\$\{onlineCountIsLowerBound \? "\+" : ""\}`/,
  "the member rail must label bounded online counts as lower bounds",
);
assert.match(
  contextPanel,
  /hasResolvedPresence = props\.onlineUserIds instanceof Set[\s\S]*props\.isLoadingPresence[\s\S]*Recently active/,
  "the member rail must wait for live presence and degrade without falsely classifying members offline",
);
assert.match(
  controller,
  /activeCommunityPresenceSummary\.online_user_ids[\s\S]*new Set/,
  "the live presence summary must remain the only online classification projection",
);
assert.match(
  facepile,
  /onlineCountCapped\?: boolean[\s\S]*`\$\{onlineTotal\}\+`/,
  "the facepile must not present a capped count as exact",
);
assert.match(
  webAppContracts,
  /online_count_capped\?: boolean \| null/,
  "the authenticated presence summary must retain the conservative count state",
);
assert.doesNotMatch(
  funnelSurface,
  /onlineCount|onlineFaces/,
  "the public acquisition renderer must not inherit live-presence state from the deleted visitor shell",
);
assert.match(
  publicFunnel + funnelMemberProof,
  /member_count[\s\S]*memberFaces=\{publicCommunity\?\.member_faces_preview \?\? \[\]\}[\s\S]*formatMemberCount/,
  "the public funnel must render canonical total-member proof from the bounded public preview",
);

console.log("community_presence_lease_contract_proof: ok");
