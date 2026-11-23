import { describe, expect, it, vi } from "vitest";
import {
  buildChannelSelectPath,
  buildWebCommunityContextJoinRequests,
  deriveActiveChannelScope,
} from "../apps/web/src/controllers/buildWebCommunityInteractionProjectionProps";
import {
  buildWebAppGlobalOverlayProps,
  deriveWebCommunityAttentionChrome,
} from "../apps/web/src/controllers/buildWebAppHostProps";

describe("Slice 4: extracted App shell builders", () => {
  it("derives active channel scope and resolution errors accurately", () => {
    expect(
      deriveActiveChannelScope({
        activeCommunityId: "comm_1",
        isChannelContextReady: false,
        channelResolutionStatus: "loading",
        channelsError: null,
      }),
    ).toEqual({
      activeChannelCommunityId: null,
      isActiveCommunityChannelLoading: true,
      activeCommunityChannelResolutionError: null,
      isAwaitingActiveCommunityInteractionScope: true,
    });

    expect(
      deriveActiveChannelScope({
        activeCommunityId: "comm_1",
        isChannelContextReady: false,
        channelResolutionStatus: "not_found",
        channelsError: null,
      }),
    ).toEqual({
      activeChannelCommunityId: null,
      isActiveCommunityChannelLoading: false,
      activeCommunityChannelResolutionError: "This channel does not exist or is no longer available.",
      isAwaitingActiveCommunityInteractionScope: false,
    });

    expect(
      deriveActiveChannelScope({
        activeCommunityId: "comm_1",
        isChannelContextReady: true,
        channelResolutionStatus: "ready",
        channelsError: null,
      }),
    ).toEqual({
      activeChannelCommunityId: "comm_1",
      isActiveCommunityChannelLoading: false,
      activeCommunityChannelResolutionError: null,
      isAwaitingActiveCommunityInteractionScope: false,
    });
  });

  it("filters and hydrates pending join requests strictly for the active community", () => {
    const items = buildWebCommunityContextJoinRequests({
      activeCommunityId: "comm_1",
      joinRequests: [
        {
          id: "req_pending",
          community_id: "comm_1",
          user_id: "user_a",
          status: "pending",
          message: "  Excited to join!  ",
          created_at: new Date().toISOString(),
        } as any,
        {
          id: "req_other_community",
          community_id: "comm_2",
          user_id: "user_b",
          status: "pending",
          message: "Wrong community",
          created_at: new Date().toISOString(),
        } as any,
        {
          id: "req_approved",
          community_id: "comm_1",
          user_id: "user_c",
          status: "approved",
          message: "Already approved",
          created_at: new Date().toISOString(),
        } as any,
      ],
      profilesByUserId: {
        user_a: {
          user_id: "user_a",
          display_name: "Ada Lovelace",
          avatar_url: "https://cdn.example.com/ada.png",
          avatar_focus_x: 0.4,
          avatar_focus_y: 0.6,
          avatar_zoom: 1.2,
        } as any,
      },
      displayName: (id) => `Fallback ${id}`,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "req_pending",
      userId: "user_a",
      displayName: "Ada Lovelace",
      avatarUrl: "https://cdn.example.com/ada.png",
      message: "Excited to join!",
    });
  });

  it("derives active community attention indicators, counts, and per-community rail dots", () => {
    const result = deriveWebCommunityAttentionChrome({
      activeCommunityId: "comm_1",
      attentionByCommunityId: {
        comm_1: { chat: true, resources: false, events: true, mentions: true, channels: [] },
        comm_2: { chat: false, resources: false, events: false, mentions: false, channels: [] },
        comm_3: { chat: false, resources: true, events: false, mentions: false, channels: [] },
      },
    });

    expect(result.activeCommunityAttentionCount).toBe(2);
    expect(result.communityTabIndicators).toEqual({
      chat: true,
      resources: false,
      events: true,
      mentions: true,
    });
    expect(result.communityRailAttentionById).toEqual({
      comm_1: true,
      comm_3: true,
    });
  });

  it("builds overlay props with host preview identity and suppresses launch modal when signed out", () => {
    const common = {
      communityModalHostProps: {
        createModal: { isOpen: true },
      } as any,
      canonicalSessionUserId: "user_host",
      displayName: () => "Neil",
      savedProfilesByUserId: {
        user_host: { avatar_url: "https://cdn.example.com/neil.png" } as any,
      },
      builderOffer: { community: null, close: vi.fn(), confirm: vi.fn() },
      founderBilling: { actionCommunityId: null, error: null },
      pendingLaunchCommunity: { id: "comm_new", slug: "new-club", name: "New Club" },
      ensureSession: vi.fn(),
      completePendingCommunityLaunch: vi.fn(),
      appToast: null,
    };

    const signedOut = buildWebAppGlobalOverlayProps({ ...common, session: null });
    expect(signedOut.communityModalHostProps.createModal).toMatchObject({
      hostName: "Neil",
      hostAvatarUrl: "https://cdn.example.com/neil.png",
    });
    expect(signedOut.communityLaunchProps).toBeNull();

    const signedIn = buildWebAppGlobalOverlayProps({
      ...common,
      session: { accessToken: "tok", user: { id: "user_host" } } as any,
    });
    expect(signedIn.communityLaunchProps).toMatchObject({
      hostName: "Neil",
      hostAvatarUrl: "https://cdn.example.com/neil.png",
    });

    expect(buildChannelSelectPath("harbor", { is_general: true, slug: "general" })).toBe("/c/harbor/chat");
    expect(buildChannelSelectPath("harbor", { is_general: false, slug: "announcements" })).toBe(
      "/c/harbor/chat/announcements",
    );
  });
});
