import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const activity = readFileSync(join(root, "convex/communityActivity.ts"), "utf8");
const resources = readFileSync(join(root, "convex/communityResources.ts"), "utf8");
const aiFeed = readFileSync(join(root, "convex/communityAiFeed.ts"), "utf8");
const chatGateway = readFileSync(join(root, "shared/cloudCommunityChatGateway.ts"), "utf8");
const chatPanel = readFileSync(join(root, "apps/web/src/components/WebCommunityChatPanel.tsx"), "utf8");
const css = readFileSync(join(root, "apps/web/src/styles/community-and-content.css"), "utf8");

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
  /communityActivityEvents: defineTable\(\{[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)[\s\S]*\.index\("by_community_dedupeKey", \["communityId", "dedupeKey"\]\)/,
  "activity events should support bounded timeline reads and dedupe lookup",
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
  resources,
  /recordCommunityActivityEventBestEffort\(\{[\s\S]*type: "resource_added"[\s\S]*targetId: (created|hydrated)\._id[\s\S]*dedupeKey: `resource_added:\$\{normalizeIdValue\(\1\._id\)\}`/,
  "resource creation should emit one deduped resource_added marker",
);

assert.match(
  aiFeed,
  /recordCommunityActivityEventBestEffort\(\{[\s\S]*type: "ai_feed_post_added"[\s\S]*dedupeKey: `ai_feed_post_added:\$\{normalizeIdValue\(created\._id\)\}`/,
  "AI feed creation should emit one deduped ai_feed_post_added marker",
);

assert.match(
  chatGateway,
  /subscribeCloudCommunityActivityEvents[\s\S]*communityActivity:listCommunityActivityEvents/,
  "chat gateway should expose a live activity-event subscription",
);

assert.match(
  chatPanel,
  /type CommunityChatTimelineItem[\s\S]*kind: "activity"[\s\S]*kind: "message"/,
  "chat panel should render one merged timeline model",
);

assert.match(
  chatPanel,
  /className="community-activity-marker"[\s\S]*formatCommunityActivityLabel/,
  "chat panel should render activity markers separately from chat messages",
);

assert.match(
  css,
  /\.community-activity-marker \{[\s\S]*margin: 4px 16px 8px 72px;[\s\S]*font-size: 12px;/,
  "activity markers should stay small and aligned with the chat text column",
);

console.log("community_activity_events_contract_proof: ok");
