import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { channelRowsToReserve, communitySlugInAddress } from "../shared/channelRowsMemory";

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
  expect(rail).toMatch(/usePanelSettled\(briefSettled && nextSettled && brainSettled\)/);
  expect(rail).toMatch(/if \(!settled\) return null;/);
});

test("the channel feed's box is in place before its posts", () => {
  expect(read("apps/web/src/components/WebCommunityInteractionProjection.tsx")).toContain('<KitApp view="wins" part="flow" className="kit-channel-feed-part">');
  expect(read("apps/web/src/styles/design-v1.css")).toMatch(/\.community-interaction-feed-scroll > \.kit-channel-feed-part \{[^}]*flex: 1 0 auto;/);
});
