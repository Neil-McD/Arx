import { describe, expect, it, vi } from "vitest";

import {
  confirmDiscardUnsavedCommunitySettingsWeb,
} from "../shared/communityUnsavedGuard";

describe("community admin unsaved changes", () => {
  it("does not prompt when the active community is unchanged", () => {
    const confirmDiscard = vi.fn(() => false);
    expect(confirmDiscardUnsavedCommunitySettingsWeb({
      isCommunitySettingsDirty: false,
      isCommunityAgentConfigDirty: false,
      activeCommunityId: "community-a",
      nextCommunityId: "community-a",
      confirmDiscard,
    })).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it("protects dirty community settings when changing communities", () => {
    const confirmDiscard = vi.fn(() => false);
    expect(confirmDiscardUnsavedCommunitySettingsWeb({
      isCommunitySettingsDirty: true,
      isCommunityAgentConfigDirty: false,
      activeCommunityId: "community-a",
      nextCommunityId: "community-b",
      confirmDiscard,
    })).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledOnce();
  });

  it("allows the community change after explicit discard", () => {
    expect(confirmDiscardUnsavedCommunitySettingsWeb({
      isCommunitySettingsDirty: true,
      isCommunityAgentConfigDirty: true,
      activeCommunityId: "community-a",
      nextCommunityId: "community-b",
      confirmDiscard: () => true,
    })).toBe(true);
  });
});
