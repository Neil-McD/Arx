import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const activity = readFileSync(join(root, "convex/communityActivity.ts"), "utf8");
const membershipLifecycle = readFileSync(
  join(root, "convex/communityMembershipLifecycle.ts"),
  "utf8",
);
const resources = readFileSync(join(root, "convex/communityResources.ts"), "utf8");
const chatGateway = readFileSync(join(root, "shared/cloudCommunityChatGateway.ts"), "utf8");
const interactionController = readFileSync(
  join(root, "apps/web/src/controllers/useWebCommunityInteractionProjection.ts"),
  "utf8",
);
const profileHydrationController = readFileSync(
  join(root, "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts"),
  "utf8",
);
const feedSegmenter = readFileSync(
  join(root, "apps/web/src/components/groupInteractionFeed.ts"),
  "utf8",
);
const interactionFeed = readFileSync(
  join(root, "apps/web/src/components/communityInteractionFeed.tsx"),
  "utf8",
);
const app = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");

assert.match(
  packageJson,
  /"check:community-activity-events-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_activity_events_contract_proof\.ts"/,
  "package scripts should expose the community activity events proof",
);

assert.match(
  schema,
  /communityActivityEvents: defineTable\(\{[\s\S]*v\.literal\("member_joined"\)[\s\S]*v\.literal\("resource_added"\)[\s\S]*v\.literal\("event_soon"\)[\s\S]*v\.literal\("event_starting"\)[\s\S]*v\.literal\("ai_feed_post_added"\)/,
  "activity events should have the narrow approved event-type set",
);

assert.match(
  schema,
  /communityActivityEvents: defineTable\(\{[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)[\s\S]*\.index\("by_community_type_createdAt", \["communityId", "type", "createdAt"\]\)[\s\S]*\.index\("by_community_dedupeKey", \["communityId", "dedupeKey"\]\)/,
  "activity events should support bounded general and typed timeline reads plus dedupe lookup",
);

assert.match(
  activity,
  /export async function recordCommunityActivityEventBestEffort[\s\S]*withIndex\("by_community_dedupeKey"[\s\S]*ctx\.db\.insert\("communityActivityEvents"/,
  "activity writer should dedupe before insert",
);

assert.match(
  activity,
  /export const listCommunityActivityEvents = query\([\s\S]*requireCommunityChatAccess[\s\S]*withIndex\("by_community_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(safeLimit\)/,
  "activity reads should be chat-access gated and bounded by the createdAt index",
);

assert.match(
  activity,
  /type: v\.optional\(communityActivityEventTypeValidator\)[\s\S]*args\.type[\s\S]*withIndex\("by_community_type_createdAt"[\s\S]*\.eq\("type", args\.type\)/,
  "typed activity reads should use the exact community and event-type index",
);

assert.match(
  resources,
  /recordCommunityActivityEventBestEffort\(\{[\s\S]*type: "resource_added"[\s\S]*targetId: (created|hydrated)\._id[\s\S]*dedupeKey: `resource_added:\$\{normalizeIdValue\(\1\._id\)\}`/,
  "resource creation should emit one deduped resource_added marker",
);

assert.match(
  membershipLifecycle,
  /if \(existing && communityMembershipRowIsActive\(existing\)\)[\s\S]*accessGranted: false[\s\S]*recordCommunityActivityEventBestEffort\(\{[\s\S]*type: "member_joined"[\s\S]*actorUserId: args\.userId[\s\S]*targetType: "membership"[\s\S]*targetId: membershipId[\s\S]*dedupeKey: `member_joined:\$\{String\(membershipId\)\}:\$\{activationSequence\}`/,
  "only a real inactive-to-active membership transition should project one deduped member_joined event",
);

assert.match(
  chatGateway,
  /subscribeCloudCommunityActivityEvents[\s\S]*type\?: CommunityActivityEventType[\s\S]*communityActivity:listCommunityActivityEvents[\s\S]*params\.type/,
  "chat gateway should expose a typed live activity-event subscription",
);

assert.match(
  interactionController,
  /activeChannelIsGeneral: boolean[\s\S]*isCommunityChatActive[\s\S]*activeChannelIsGeneral[\s\S]*subscribeCloudCommunityActivityEvents<CommunityActivityEvent>\([\s\S]*type: "member_joined"/,
  "the canonical interaction projection should subscribe to arrivals only in active General chat",
);

assert.match(
  app,
  /activeChannelIsGeneral: Boolean\(activeCommunityChannel\?\.is_general\)[\s\S]*activityEvents:[\s\S]*activeCommunityChannel\?\.is_general[\s\S]*communityActivityEvents/,
  "General placement should use the canonical channel identity rather than infer from a missing id",
);

assert.match(
  profileHydrationController,
  /communityActivityEvents: readonly ActivityActor\[\][\s\S]*for \(const event of params\.communityActivityEvents\)[\s\S]*actor_user_id/,
  "arrival actors should reuse the canonical batched profile hydrator",
);

assert.match(
  feedSegmenter,
  /MEMBER_ARRIVAL_GROUP_GAP_MS = 15 \* 60 \* 1000[\s\S]*type: "member_arrivals"[\s\S]*flushRoots\(\)[\s\S]*flushArrivals\(\)/,
  "arrival grouping should be a deterministic adjacent read-time projection",
);

assert.match(
  interactionFeed,
  /import \{ MemberAvatarStack[\s\S]*groupInteractionFeed\(props\.roots, props\.activityEvents\)[\s\S]*segment\.type === "member_arrivals"[\s\S]*<MemberAvatarStack/,
  "the canonical feed should render arrivals with the canonical member avatar stack",
);

assert.doesNotMatch(
  interactionController + feedSegmenter,
  /setInterval\(|setTimeout\(/,
  "member arrival projection should not introduce a scheduler or poller",
);

console.log("community_activity_events_contract_proof: ok");
