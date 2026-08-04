import { describe, expect, it } from "vitest";

import { resolveCommunityPinnedRootOverflowState } from "../apps/web/src/components/CommunityPinnedRootSurface";

describe("community pinned root surface overflow", () => {
  it("keeps naturally short pinned posts unmarked", () => {
    expect(resolveCommunityPinnedRootOverflowState({
      scrollHeight: 220,
      clientHeight: 220,
      scrollTop: 0,
    })).toEqual({ overflowing: false, atEnd: true });
  });

  it("shows that a bounded pinned post has more content below", () => {
    expect(resolveCommunityPinnedRootOverflowState({
      scrollHeight: 620,
      clientHeight: 300,
      scrollTop: 0,
    })).toEqual({ overflowing: true, atEnd: false });
  });

  it("clears the fade when the pinned viewport reaches the end", () => {
    expect(resolveCommunityPinnedRootOverflowState({
      scrollHeight: 620,
      clientHeight: 300,
      scrollTop: 320,
    })).toEqual({ overflowing: true, atEnd: true });
  });
});
