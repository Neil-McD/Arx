import { describe, expect, it } from "vitest";

import {
  buildCommunityFunnelThreadKey,
  isCommunityFunnelThreadKeyForCommunity,
  resolveRuntimeInvocationSurfaceForThread,
  restrictToolNamesForInvocationSurface,
} from "../shared/runtimeInvocationSurface";

describe("community funnel runtime surface", () => {
  it("binds one canonical thread to one community", () => {
    const threadKey = buildCommunityFunnelThreadKey("community-1");
    expect(threadKey).toBe("community-funnel:community-1");
    expect(
      isCommunityFunnelThreadKeyForCommunity(threadKey, "community-1"),
    ).toBe(true);
    expect(
      isCommunityFunnelThreadKeyForCommunity(threadKey, "community-2"),
    ).toBe(false);
    expect(
      resolveRuntimeInvocationSurfaceForThread({
        requestedSurface: "workspace",
        threadKey,
      }),
    ).toBe("community_funnel_builder");
  });

  it("exposes only discovery, read, and canonical call tools", () => {
    expect(
      restrictToolNamesForInvocationSurface({
        invocationSurface: "community_funnel_builder",
        toolNames: [
          "polynet_list",
          "polynet_read",
          "polynet_search",
          "polynet_write",
          "polynet_call",
        ],
      }),
    ).toEqual(["polynet_list", "polynet_read", "polynet_call"]);
  });
});
