import { describe, expect, it, vi } from "vitest";

import type { CloudCommunityChannel } from "../shared/cloudCommunityChannelsGateway";
import {
  buildOptimisticWebCommunityChannelOrder,
  resolveWebCommunityChannelSelection,
  resolveWebCommunityChannelDeleteCompletion,
  shouldResetWebCommunityChannelPresentation,
} from "../apps/web/src/controllers/useWebCommunityChannelsController";

const engineering: CloudCommunityChannel = {
  id: "engineering-id",
  community_id: "community-id",
  system_role: null,
  is_general: false,
  slug: "engineering",
  name: "Engineering",
  position: 2,
};

const general: CloudCommunityChannel = {
  id: "general-id",
  community_id: "community-id",
  system_role: "general",
  is_general: true,
  slug: "general",
  name: "General",
  position: 0,
};

const product: CloudCommunityChannel = {
  id: "product-id",
  community_id: "community-id",
  system_role: null,
  is_general: false,
  slug: "product-feedback",
  name: "Product feedback",
  position: 1,
};

describe("community channel selection", () => {
  it("keeps General usable while the catalog is still loading", () => {
    expect(resolveWebCommunityChannelSelection({
      channels: [general],
      requestedChannelSlug: null,
      hasResolvedChannels: false,
      channelsError: null,
    })).toMatchObject({
      status: "resolved",
      selectedChannel: general,
      selectedChannelSlug: "general",
    });
  });

  it("does not substitute General while a custom channel is loading", () => {
    expect(resolveWebCommunityChannelSelection({
      channels: [general],
      requestedChannelSlug: "product-feedback",
      hasResolvedChannels: false,
      channelsError: null,
    })).toEqual({
      status: "loading",
      selectedChannel: null,
      selectedChannelSlug: "product-feedback",
    });
  });

  it("does not substitute General when custom-channel loading fails", () => {
    expect(resolveWebCommunityChannelSelection({
      channels: [general],
      requestedChannelSlug: "product-feedback",
      hasResolvedChannels: false,
      channelsError: "Channels are temporarily unavailable. Try again.",
    })).toEqual({
      status: "failed",
      selectedChannel: null,
      selectedChannelSlug: "product-feedback",
    });
  });

  it("distinguishes a confirmed missing slug from a loading failure", () => {
    expect(resolveWebCommunityChannelSelection({
      channels: [general],
      requestedChannelSlug: "missing",
      hasResolvedChannels: true,
      channelsError: null,
    })).toEqual({
      status: "not_found",
      selectedChannel: null,
      selectedChannelSlug: "missing",
    });
  });

  it("resolves a known custom channel by stable slug", () => {
    expect(resolveWebCommunityChannelSelection({
      channels: [general, product],
      requestedChannelSlug: "PRODUCT-FEEDBACK",
      hasResolvedChannels: true,
      channelsError: null,
    })).toMatchObject({
      status: "resolved",
      selectedChannel: product,
      selectedChannelSlug: "product-feedback",
    });
  });
});

describe("community channel presentation continuity", () => {
  it("preserves resolved channels when credentials rotate for the same community", () => {
    expect(shouldResetWebCommunityChannelPresentation({
      scopedCommunityId: "community-id",
      nextCommunityId: "community-id",
      hasSession: true,
    })).toBe(false);
  });

  it("resets channels across a real community boundary", () => {
    expect(shouldResetWebCommunityChannelPresentation({
      scopedCommunityId: "community-a",
      nextCommunityId: "community-b",
      hasSession: true,
    })).toBe(true);
  });

  it("resets channels after confirmed sign-out", () => {
    expect(shouldResetWebCommunityChannelPresentation({
      scopedCommunityId: "community-id",
      nextCommunityId: "community-id",
      hasSession: false,
    })).toBe(true);
  });
});

describe("community channel optimistic order", () => {
  it("keeps General fixed while assigning contiguous custom positions", () => {
    expect(buildOptimisticWebCommunityChannelOrder(
      "community-id",
      [general, product, engineering],
      [engineering.id, product.id],
    )).toEqual([
      general,
      { ...engineering, position: 1 },
      { ...product, position: 2 },
    ]);
  });

  it("rejects duplicate, missing, and foreign channel ids", () => {
    const channels = [general, product, engineering];
    expect(buildOptimisticWebCommunityChannelOrder(
      "community-id",
      channels,
      [product.id, product.id],
    )).toBeNull();
    expect(buildOptimisticWebCommunityChannelOrder(
      "community-id",
      channels,
      [product.id],
    )).toBeNull();
    expect(buildOptimisticWebCommunityChannelOrder(
      "community-id",
      channels,
      [product.id, "foreign-id"],
    )).toBeNull();
  });
});

describe("community channel delete completion", () => {
  it("uses the latest route callback after an in-flight delete", () => {
    const staleRouteCallback = vi.fn();
    const latestRouteCallback = vi.fn();
    const paramsRef = {
      current: {
        activeCommunityId: "community-id" as string | null,
        onChannelDeleted: staleRouteCallback,
      },
    };

    paramsRef.current = {
      activeCommunityId: "community-id",
      onChannelDeleted: latestRouteCallback,
    };

    const completion = resolveWebCommunityChannelDeleteCompletion(
      paramsRef,
      "community-id",
    );
    completion.onChannelDeleted?.(product);

    expect(completion.shouldApply).toBe(true);
    expect(latestRouteCallback).toHaveBeenCalledWith(product);
    expect(staleRouteCallback).not.toHaveBeenCalled();
  });

  it("ignores a delete completion after leaving its community", () => {
    const routeCallback = vi.fn();
    const completion = resolveWebCommunityChannelDeleteCompletion({
      current: {
        activeCommunityId: "community-b",
        onChannelDeleted: routeCallback,
      },
    }, "community-a");

    completion.onChannelDeleted?.(product);

    expect(completion).toEqual({ shouldApply: false });
    expect(routeCallback).not.toHaveBeenCalled();
  });
});
