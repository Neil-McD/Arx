import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const backend = read("convex/communityAttention.ts");
const gateway = read("shared/cloudCommunityAttentionGateway.ts");
const controller = read("shared/useCommunityAttentionController.ts");
const app = read("apps/web/src/App.tsx");
const nav = read("shared/CommunityNav.tsx");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const resourcesPanel = read("apps/web/src/components/CommunityResourcesPanel.tsx");

assert.match(
  schema,
  /communityMemberSettings:[\s\S]*eventsLastSeenAt: v\.optional\(v\.number\(\)\)/,
  "community member settings must persist per-user Events seen state",
);

assert.match(
  schema,
  /communityEvents:[\s\S]*\.index\("by_community_status_updatedAt", \["communityId", "status", "updatedAt"\]\)/,
  "community events need an efficient latest live-activity index for attention derivation",
);

assert.match(
  backend,
  /type CommunityAttentionSurface = "chat" \| "ai_feed" \| "resources" \| "events" \| "mentions"/,
  "Events must be a first-class community attention surface",
);

assert.match(
  backend,
  /getLatestCommunityEventsUpdatedAt[\s\S]*query\("communityEvents"[\s\S]*withIndex\("by_community_status_updatedAt"[\s\S]*eq\("status", "live"\)[\s\S]*order\("desc"\)[\s\S]*updatedAt/,
  "Events attention must derive from latest visible live event activity",
);

assert.match(
  backend,
  /events:\s*[\s\S]*latestEventsUpdatedAt > Math\.max\(0, Math\.floor\(settingsRow\?\.eventsLastSeenAt \?\? 0\)\)/,
  "Events attention must compare latest activity against the per-user seen marker",
);

assert.match(
  backend,
  /surface: v\.union\(v\.literal\("chat"\), v\.literal\("ai_feed"\), v\.literal\("resources"\), v\.literal\("events"\), v\.literal\("mentions"\)\)[\s\S]*seenAtMs: v\.optional\(v\.number\(\)\)/,
  "markCommunitySurfaceSeen must accept the Events surface and visible seen marker",
);

assert.match(
  backend,
  /const requestedEventsSeenAt = normalizePositiveMarker\(args\.seenAtMs\);[\s\S]*if \(requestedEventsSeenAt === null\) return;[\s\S]*const nextEventsLastSeenAt = Math\.min\(latestEventsUpdatedAt, requestedEventsSeenAt\)/,
  "Events mark-seen must clamp to the visible event marker instead of global latest activity",
);

assert.match(
  gateway,
  /CloudCommunityAttentionSurface = "chat" \| "ai_feed" \| "resources" \| "events" \| "mentions"/,
  "shared gateway must expose the Events surface",
);

assert.match(
  controller,
  /events: boolean[\s\S]*events: false[\s\S]*events: Boolean\(row\.events\)/,
  "frontend attention controller must carry Events indicators",
);

assert.match(
  app,
  /latestActiveCommunityEventsUpdatedAt[\s\S]*hasLoadedActiveCommunityEventsRange[\s\S]*communityTab !== "events"[\s\S]*latestActiveCommunityEventsUpdatedAt === null[\s\S]*markCommunitySurfaceSeen\(activeCommunityId, "events", \{[\s\S]*seenAtMs: latestActiveCommunityEventsUpdatedAt[\s\S]*optimistic: false[\s\S]*refreshAfter: true/,
  "Events tab must mark only loaded visible event activity seen and then refresh attention",
);

assert.match(
  app,
  /activeCommunityAttentionSummary[\s\S]*events: false[\s\S]*Number\(Boolean\(activeCommunityAttentionSummary\.events\)\)/,
  "community attention count must include Events",
);

assert.match(
  app,
  /communityTabIndicators = \{[\s\S]*events: Boolean\(activeIndicators\.events\)/,
  "community tab indicators must include Events",
);

assert.match(
  app,
  /indicators\.chat \|\| indicators\.ai_feed \|\| indicators\.resources \|\| indicators\.events/,
  "community rail attention must include Events",
);

assert.match(
  nav,
  /communityTab !== "events" && tabIndicators\.events[\s\S]*nav-item-dot/,
  "Events tab must render an attention dot",
);

assert.doesNotMatch(
  eventsPanel,
  /Event saved\./,
  "Events saves should not show noisy success toasts",
);

assert.doesNotMatch(
  resourcesPanel,
  /Resource saved successfully!/,
  "Resource saves should not show noisy success toasts",
);

// Mentions surface (M2): an unseen mention-of-me is its own attention marker,
// derived from a single indexed latest-mention read, cleared by opening the
// community chat (which also flips the mention ledger rows to "read"), and
// rendered as the accent variant of the chat nav dot plus the rail OR.
assert.match(
  backend,
  /getLatestCommunityMentionOfUserCreatedAt[\s\S]*by_mentionedUser_community_createdAt/,
  "mention attention must derive from one indexed latest-mention read",
);
assert.match(
  backend,
  /mentions:\s*[\s\S]*latestMentionCreatedAt > Math\.max\(0, Math\.floor\(settingsRow\?\.mentionsLastSeenAt \?\? 0\)\)/,
  "mention attention compares against the per-user mentionsLastSeenAt marker",
);
assert.match(
  backend,
  /markCommunityChatReadAt[\s\S]*notifyState: "read"[\s\S]*mentionsLastSeenAt/,
  "opening chat clears the mention ping and flips seen pending mentions to read",
);
assert.match(
  schema,
  /mentionsLastSeenAt: v\.optional\(v\.number\(\)\)/,
  "member settings must carry the mention seen marker",
);
assert.match(
  nav,
  /nav-item-dot\$\{tabIndicators\.mentions \? " is-mention" : ""\}/,
  "an unseen mention upgrades the chat dot to the accent variant",
);
assert.match(
  app,
  /indicators\.chat \|\| indicators\.ai_feed \|\| indicators\.resources \|\| indicators\.events \|\| indicators\.mentions/,
  "the community rail attention OR must include mentions",
);

console.log("community_attention_events_contract_proof: ok");
