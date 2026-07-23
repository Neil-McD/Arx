import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const lifecycle = read("convex/accountLifecyclePolicy.ts");
const resources = read("convex/communityResources.ts");
const aiFeed = read("convex/communityAiFeed.ts");
const facade = read("convex/community.ts");
const gateway = read("shared/cloudCommunityChatGateway.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const css = read("apps/web/src/base.css");

assert.match(
  packageJson,
  /"check:community-activity-events-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_activity_events_contract_proof\.ts"/,
  "package scripts should expose the community activity retirement proof",
);

assert.match(
  schema,
  /communityActivityEvents: defineTable\(\{[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)[\s\S]*\.index\("by_community_dedupeKey", \["communityId", "dedupeKey"\]\)/,
  "historical activity rows should remain reachable until lifecycle retention is decided",
);
assert.match(
  lifecycle,
  /"communityActivityEvents"[\s\S]*"communityActivityEvents\.actorUserId"/,
  "historical activity rows should remain explicit in account lifecycle policy",
);

assert.equal(
  existsSync(join(root, "convex/communityActivity.ts")),
  false,
  "the unconsumed activity-event writer and read API should be deleted",
);
for (const [label, source] of [
  ["resources", resources],
  ["AI feed", aiFeed],
  ["community facade", facade],
  ["browser gateway", gateway],
  ["chat panel", chatPanel],
  ["web CSS", css],
] as const) {
  assert.doesNotMatch(
    source,
    /recordCommunityActivityEventBestEffort|listCommunityActivityEvents|CloudCommunityActivityEvents|community-activity-marker|CommunityChatTimelineItem/,
    `${label} should not retain the deleted ambient activity timeline`,
  );
}

console.log("community_activity_events_contract_proof: ok");
