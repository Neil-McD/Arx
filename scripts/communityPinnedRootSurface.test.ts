import { describe, expect, it } from "vitest";

import { resolveCommunityPinnedRootOverflowState } from "../apps/web/src/components/CommunityPinnedRootSurface";

describe("community pinned root surface overflow", () => {
  it("keeps naturally short pinned posts unmarked", () => {
    expect(resolveCommunityPinnedRootOverflowState({
      scrollHeight: 220,
      clientHeight: 220,
    })).toEqual({ overflowing: false });
  });

  it("marks a bounded pinned post for a visual cutoff", () => {
    expect(resolveCommunityPinnedRootOverflowState({
      scrollHeight: 620,
      clientHeight: 300,
    })).toEqual({ overflowing: true });
  });

  it("ignores one-pixel layout rounding at either cutoff boundary", () => {
    expect(resolveCommunityPinnedRootOverflowState({
      scrollHeight: 221,
      clientHeight: 220,
    })).toEqual({ overflowing: false });
  });
});
