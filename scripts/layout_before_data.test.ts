import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { channelRowsToReserve, communitySlugInAddress, navRowsToReserve } from "../shared/channelRowsMemory";

// Layout before data: a page has its shape before its data arrives, so
// nothing that is drawn moves afterwards. The staging measurements in the
// pull request prove the effect; these pin the rules that produce it.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the left column reserves as many channel rows as the list had last time", () => {
  expect(channelRowsToReserve(null)).toBe(2);
  expect(channelRowsToReserve(5)).toBe(5);
  expect(channelRowsToReserve(0)).toBe(1);
  expect(channelRowsToReserve(400)).toBe(12);
  expect(channelRowsToReserve(Number.NaN)).toBe(2);
});

test("the community is read from the address before it has loaded, on desktop and phone", () => {
  expect(communitySlugInAddress("/c/sunrise/home")).toBe("sunrise");
  expect(communitySlugInAddress("/m/c/sunrise/browse")).toBe("sunrise");
  expect(communitySlugInAddress("/settings")).toBeNull();
  expect(communitySlugInAddress("/docs/a/c/d")).toBeNull();
});

test("loading rows are the size of real channel rows", () => {
  const css = read("apps/web/src/styles/design-v1.css");
  expect(css).toMatch(/:root\[data-design="v1"\] \.community-channel-loading \{\s*gap: 0;/);
  expect(css).toMatch(/:root\[data-design="v1"\] \.community-channel-loading-row \{[^}]*height: 28px;/);
});

test("Home's layout is the same while the guide's thread opens (no top row moving)", () => {
  const dock = read("apps/web/src/components/WebCommunityAgentDock.tsx");
  expect(dock).toMatch(/const conversationNeedsYou =\s*turnIsActive \|\| Boolean\(dockError\)/);
});

test("Home's right column draws as one piece once its parts have answered", () => {
  const rail = read("apps/web/src/v1/KitHomeRail.tsx");
  expect(rail).toMatch(/usePanelSettled\(nextSettled && brainSettled\)/);
  expect(rail).toMatch(/if \(!settled\) return null;/);
});

test("the channel feed's box is in place before its posts", () => {
  expect(read("apps/web/src/components/WebCommunityInteractionProjection.tsx")).toContain('<KitApp view="wins" part="flow" className="kit-channel-feed-part">');
  expect(read("apps/web/src/styles/design-v1.css")).toMatch(/\.community-interaction-feed-scroll > \.kit-channel-feed-part \{[^}]*flex: 1 0 auto;/);
});

test("the feed's loading skeleton and its posts are separate elements", () => {
  const feed = read("apps/web/src/v1/KitChannelFeed.tsx");
  expect(feed).toContain('<ChannelFeedSkeleton key="loading" />');
  expect(feed).toContain('<div key="feed" className={cx("feed")}>');
  // The phone's feed, the same way.
  const phoneFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
  expect(phoneFeed).toContain('<ChannelFeedSkeleton key="loading" />');
  expect(phoneFeed).toContain('<div key="feed" className="community-interaction-feed">');
});

test("a channel's header row is held until its record arrives", () => {
  expect(read("apps/web/src/components/WebCommunityInteractionProjection.tsx"))
    .toMatch(/\) : \([\s\S]{0,220}<header className="community-channel-header" aria-hidden="true" \/>/);
});

test("Knowledge draws its right column as one piece and keeps the top shelf free of async builder buttons", () => {
  const classroom = read("apps/web/src/v1/KitClassroom.tsx");
  expect(classroom).toMatch(/usePanelSettled\(briefSettled && brainSettled && progressLoaded\)/);
  expect(classroom).not.toContain("onOpenGuideMemory?.(true)");
});

test("a pod's panel and landing page draw their parts once they have answered", () => {
  expect(read("apps/web/src/v1/KitPodRail.tsx")).toMatch(/const settled = usePanelSettled\(briefSettled\);/);
  expect(read("apps/web/src/v1/KitPodLanding.tsx")).toMatch(/const settled = usePanelSettled\(briefSettled && answered >= 2\);/);
});

test("the left column's page rows and foot hold the place of what this person saw last time", () => {
  expect(navRowsToReserve("pages", null)).toBe(3);
  expect(navRowsToReserve("foot", null)).toBe(1);
  // A member with nothing in the foot: no rows held.
  expect(navRowsToReserve("foot", 0)).toBe(0);
  expect(navRowsToReserve("pages", 5)).toBe(5);
  const nav = read("shared/CommunityNav.tsx");
  expect(nav).toMatch(/isLoadingAccess && isV1 \? \([\s\S]{0,260}<div className="community-nav-section-label">Community<\/div>/);
  expect(read("apps/web/src/styles/design-v1.css")).toMatch(/:root\[data-design="v1"\] \.community-nav-access-loading-row \{[^}]*height: 28px;/);
});
