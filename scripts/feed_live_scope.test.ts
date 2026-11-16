import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// The channel feed holds a live subscription only while a channel is on
// screen (Home, Events, Knowledge and the rest don't pay for it). The hook's
// subscription is wired through Convex, so this checks the wiring that decides
// it; the staging call log in its pull request proves the effect.
const projection = readFileSync(new URL("../apps/web/src/controllers/useWebCommunityInteractionProjection.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");

test("the feed subscribes only while the channel page is open", () => {
  expect(projection).toMatch(
    /if \(!isCommunityChatActive \|\| !activeCommunityId \|\| !canonicalSessionUserId\) return;[\s\S]*?subscribeCloudCommunityInteractionRoots\(/,
  );
  expect(projection).toMatch(/\}, \[activeChannelId, activeCommunityId, canonicalSessionUserId, ensureSession, isCommunityChatActive\]\);/);
  expect(app).toMatch(/isCommunityChatActive:\s*activePage === "community" &&\s*activeView === "home" &&\s*communityTab === "chat",/);
});

test("coming back to a channel never leaves a gap in its posts", () => {
  expect(projection).toMatch(/const replaceCached = firstUpdate && hasCurrentRoots\s*&& incomingRoots\.length >= COMMUNITY_INTERACTION_ROOT_LIMIT;/);
});
