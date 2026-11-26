import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { needsLeaveCheck } from "../shared/communityUnsavedGuard";

describe("community admin unsaved changes", () => {
  it("does not ask when staying in the same community", () => {
    expect(needsLeaveCheck({ isCommunitySettingsDirty: true, isCommunityAgentConfigDirty: false, activeCommunityId: "community-a", nextCommunityId: "community-a" })).toBe(false);
  });

  it("does not ask when nothing is unsaved", () => {
    expect(needsLeaveCheck({ isCommunitySettingsDirty: false, isCommunityAgentConfigDirty: false, activeCommunityId: "community-a", nextCommunityId: "community-b" })).toBe(false);
  });

  it("asks before leaving unsaved settings or guide instructions for another community", () => {
    expect(needsLeaveCheck({ isCommunitySettingsDirty: true, isCommunityAgentConfigDirty: false, activeCommunityId: "community-a", nextCommunityId: "community-b" })).toBe(true);
    expect(needsLeaveCheck({ isCommunitySettingsDirty: false, isCommunityAgentConfigDirty: true, activeCommunityId: "community-a", nextCommunityId: "community-b" })).toBe(true);
  });

  it("asks with the app's own card, never the browser's box", () => {
    const source = readFileSync("apps/web/src/controllers/useWebCommunityNavigationActions.ts", "utf8");
    expect(source).toContain("askInApp(");
    expect(source).not.toContain("window.confirm");
  });
});
