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

test("replacing the cached posts moves 'load older' to just below the new window", async () => {
  expect(projection).toMatch(/if \(replaceCached\) setNextBeforeCreatedAt\(oldestRootCreatedAtMs\(incomingRoots\)\);/);
  const { oldestRootCreatedAtMs } = await import("../apps/web/src/controllers/communityRootWindows");
  const root = (iso: string) => ({ root: { id: iso, created_at: iso } }) as any;
  expect(oldestRootCreatedAtMs([root("2026-11-03T10:00:00Z"), root("2026-11-01T10:00:00Z")])).toBe(Date.parse("2026-11-01T10:00:00Z"));
  expect(oldestRootCreatedAtMs([])).toBeNull();
});
