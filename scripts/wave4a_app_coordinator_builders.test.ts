import { describe, expect, it, vi } from "vitest";
import { buildWebCommunityAttentionView } from "../apps/web/src/controllers/buildWebCommunityAttentionView";
import {
  buildWebCommunityAgentHomeProps,
  buildWebShellAccountProps,
} from "../apps/web/src/controllers/buildWebCommunityAgentHomeProps";

describe("Wave 4A: extracted App coordinator builders", () => {
  it("projects community attention indicators across channels, tabs, and rail", () => {
    const view = buildWebCommunityAttentionView({
      activeCommunityId: "comm_1",
      attentionByCommunityId: {
        comm_1: {
          chat: true,
          resources: false,
          events: true,
          mentions: true,
          channels: [{ channel_slug: "builds", chat: true, mentions: false }],
        },
        comm_2: {
          chat: false,
          resources: false,
          events: false,
          mentions: false,
          channels: [],
        },
        comm_3: {
          chat: false,
          resources: true,
          events: false,
          mentions: false,
          channels: [],
        },
      },
    });

    expect(view.activeCommunityAttentionCount).toBe(2);
    expect(view.communityTabIndicators).toEqual({
      chat: true,
      resources: false,
      events: true,
      mentions: true,
    });
    expect(view.communityChannelIndicators).toEqual({
      builds: { chat: true, mentions: false },
    });
    expect(view.communityRailAttentionById).toEqual({
      comm_1: true,
      comm_3: true,
    });
  });

  it("derives general fallback channel attention when per-channel entries are absent", () => {
    const view = buildWebCommunityAttentionView({
      activeCommunityId: "comm_1",
      attentionByCommunityId: {
        comm_1: {
          chat: true,
          resources: false,
          events: false,
          mentions: true,
          channels: [],
        },
      },
    });

    expect(view.communityChannelIndicators).toEqual({
      general: { chat: true, mentions: true },
    });
  });

  it("keeps shell account role blank until active community access resolves and switches cleanly in member preview", () => {
    const base = {
      canonicalSessionUserId: "user_1",
      displayName: () => "Neil McDevitt",
      savedProfilesByUserId: {},
      activeCommunity: { id: "comm_1" },
      memberPreview: { available: true, active: false },
      onToggleMemberPreview: vi.fn(),
      appTheme: "dark" as const,
      onSetAppTheme: vi.fn(),
      onSignOut: vi.fn(async () => undefined),
    };

    expect(
      buildWebShellAccountProps({
        ...base,
        activeCommunityAccess: null,
      })?.roleLabel,
    ).toBe("");

    expect(
      buildWebShellAccountProps({
        ...base,
        activeCommunityAccess: {
          community_id: "comm_1",
          is_owner: true,
        } as never,
      })?.roleLabel,
    ).toBe("Host");

    expect(
      buildWebShellAccountProps({
        ...base,
        memberPreview: { available: true, active: true },
        activeCommunityAccess: {
          community_id: "comm_1",
          is_owner: true,
        } as never,
      })?.roleLabel,
    ).toBe("Viewing as a member");
  });

  it("returns null for Home props when design v1 is off or community access is unresolved", () => {
    const home = buildWebCommunityAgentHomeProps({
      designV1Active: false,
      activeCommunity: { id: "comm_1", name: "Builders" },
      canonicalSessionUserId: "user_1",
      activeCommunityAccess: {
        community_id: "comm_1",
        is_owner: true,
        can_read_chat: true,
      } as never,
      displayName: () => "Neil",
      canReviewJoinRequestsActiveCommunity: true,
      communityContextJoinRequests: [],
      hasLoadedCommunityJoinRequests: true,
      communityJoinRequestsError: null,
      decidingCommunityJoinRequestId: null,
      onApproveJoinRequest: vi.fn(),
      onDeclineJoinRequest: vi.fn(),
      selectedActiveCommunitySlug: "builders",
      activeCommunityChannels: [],
      leavePhoneHome: vi.fn(),
      onOpenJoinRequests: vi.fn(),
      onOpenMembers: vi.fn(),
      onSelectCommunityChannel: vi.fn(),
      navigateTo: vi.fn(),
      onSelectCommunityTab: vi.fn(),
      onTurnOnAgent: vi.fn(),
      presence: null,
    });

    expect(home).toBeNull();
  });
});
