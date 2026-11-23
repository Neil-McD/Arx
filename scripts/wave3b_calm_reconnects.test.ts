import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advanceWebAppActivity,
  createWebAppActivityState,
  WEB_APP_RESUME_COOLDOWN_MS,
} from "../shared/webAppActivity";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Wave 3B: calm reconnects, warm directory switching, and lazy feed avatars", () => {
  it("suppresses brief alt-tab resume bursts within the cooldown window while preserving real resumes", () => {
    const start = createWebAppActivityState(true);
    const blurred = advanceWebAppActivity(start, {
      isActive: false,
      nowMs: 10_000,
      minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS,
    });
    expect(blurred.isActive).toBe(false);
    expect(blurred.resumeEpoch).toBe(0);

    // Clicking back 3 seconds later restores active state without firing a full resume storm.
    const quickReturn = advanceWebAppActivity(blurred, {
      isActive: true,
      nowMs: 13_000,
      minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS,
    });
    expect(quickReturn.isActive).toBe(true);
    expect(quickReturn.resumeEpoch).toBe(0);

    // Going away for >= cooldown duration fires one resume on return.
    const away = advanceWebAppActivity(quickReturn, {
      isActive: false,
      nowMs: 20_000,
      minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS,
    });
    const realReturn = advanceWebAppActivity(away, {
      isActive: true,
      nowMs: 20_000 + WEB_APP_RESUME_COOLDOWN_MS,
      minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS,
    });
    expect(realReturn.isActive).toBe(true);
    expect(realReturn.resumeEpoch).toBe(1);

    // Explicit online / BFCache forceResume always fires immediately even within 1 second.
    const quickOffline = advanceWebAppActivity(realReturn, {
      isActive: false,
      nowMs: 50_000,
      minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS,
    });
    const backOnline = advanceWebAppActivity(quickOffline, {
      isActive: true,
      forceResume: true,
      nowMs: 51_000,
      minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS,
    });
    expect(backOnline.resumeEpoch).toBe(2);
  });

  it("keeps directory freshness window, stable profile hydration keys, and lazy off-screen avatars wired", () => {
    const activityController = read("apps/web/src/controllers/useWebAppActivityController.ts");
    const directoryLifecycle = read("shared/useCommunityDirectoryLifecycle.ts");
    const profileHydration = read("apps/web/src/controllers/useWebCommunityProfileHydrationController.ts");
    const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
    const membersTable = read("apps/web/src/v1/KitMembersTable.tsx");
    const rosterPanel = read("apps/web/src/components/ChannelRosterPanel.tsx");

    expect(activityController).toContain("minInactiveDurationMs: WEB_APP_RESUME_COOLDOWN_MS");
    expect(directoryLifecycle).toContain("DIRECTORY_TAB_FRESHNESS_MS");
    expect(directoryLifecycle).toContain("if (loaded === false) return;");
    expect(directoryLifecycle).toContain("lastLoadedRef.current = { scope, at: Date.now() };");
    expect(profileHydration).toContain("visibleProfileIdsKey");
    expect(interactionFeed).toMatch(/loading="lazy"[\s\S]{0,60}fetchPriority="low"/);
    expect(membersTable).toMatch(/loading="lazy"\s+fetchPriority="low"/);
    expect(rosterPanel).toMatch(/loading="lazy"\s+fetchPriority="low"/);
  });
});
