import { describe, expect, it } from "vitest";

import {
  buildCommunityFunnelPrimaryActionView,
  buildCommunityFunnelMemberProofView,
  deriveCommunityFunnelUiMode,
} from "../shared/communityFunnelUi";

describe("community funnel member proof", () => {
  it("hides missing and zero-count proof without reserving space", () => {
    expect(
      buildCommunityFunnelMemberProofView({ memberCount: null, faces: [] }),
    ).toBeNull();
    expect(
      buildCommunityFunnelMemberProofView({ memberCount: 0, faces: [] }),
    ).toBeNull();
  });

  it("deduplicates, bounds, and preserves public avatar framing", () => {
    const proof = buildCommunityFunnelMemberProofView({
      memberCount: 20,
      maxFaces: 2,
      faces: [
        {
          user_id: "one",
          display_name: "One",
          avatar_url: "https://images.example/one.png",
          avatar_focus_x: 0.25,
        },
        {
          user_id: "one",
          display_name: "Duplicate",
          avatar_url: "https://images.example/duplicate.png",
        },
        {
          user_id: "missing-avatar",
          display_name: "Missing",
          avatar_url: null,
        },
        {
          user_id: "two",
          display_name: "Two",
          avatar_url: "https://images.example/two.png",
        },
        {
          user_id: "three",
          display_name: "Three",
          avatar_url: "https://images.example/three.png",
        },
      ],
    });
    expect(proof?.faces.map((face) => face.user_id)).toEqual([
      "one",
      "missing-avatar",
    ]);
    expect(proof?.faces[0]?.avatar_focus_x).toBe(0.25);
    expect(proof?.hiddenFaceCount).toBe(18);
    expect(proof?.label).toBe("20 members and growing");
    expect(proof?.ariaLabel).toBe("20 community members");
  });

  it("never renders more faces than the canonical member count", () => {
    const proof = buildCommunityFunnelMemberProofView({
      memberCount: 1,
      faces: [
        {
          user_id: "one",
          display_name: "One",
          avatar_url: "https://images.example/one.png",
        },
        {
          user_id: "two",
          display_name: "Two",
          avatar_url: "https://images.example/two.png",
        },
      ],
    });
    expect(proof?.faces).toHaveLength(1);
    expect(proof?.hiddenFaceCount).toBe(0);
    expect(proof?.label).toBe("1 member");
    expect(proof?.ariaLabel).toBe("1 community member");
  });

  it("uses one canonical join-and-price label contract", () => {
    expect(buildCommunityFunnelPrimaryActionView({ mode: "join" }).label).toBe(
      "Join free",
    );
    expect(
      buildCommunityFunnelPrimaryActionView({ mode: "request_access" }).label,
    ).toBe("Join free");
    expect(
      buildCommunityFunnelPrimaryActionView({
        mode: "checkout",
        plan: {
          name: "Monthly",
          description: null,
          amount_base_units: "2900",
          currency: "USD",
          currency_decimals: 2,
          billing_period: "monthly",
        },
      }).label,
    ).toBe("Join $29/month");
    expect(
      buildCommunityFunnelPrimaryActionView({
        mode: "checkout",
        plan: {
          name: "Annual",
          description: null,
          amount_base_units: "29000",
          currency: "USD",
          currency_decimals: 2,
          billing_period: "annual",
        },
      }).label,
    ).toBe("Join $290/year");
  });

  it("derives one canonical access mode for preview and public rendering", () => {
    expect(
      deriveCommunityFunnelUiMode({
        canEnterCommunity: true,
        canJoinWithCheckout: true,
        canJoinWithApproval: true,
        canJoinForFree: true,
      }),
    ).toBe("enter");
    expect(
      deriveCommunityFunnelUiMode({
        canEnterCommunity: false,
        canJoinWithCheckout: true,
        canJoinWithApproval: true,
        canJoinForFree: true,
      }),
    ).toBe("checkout");
    expect(
      deriveCommunityFunnelUiMode({
        canEnterCommunity: false,
        canJoinWithCheckout: false,
        canJoinWithApproval: true,
        canJoinForFree: true,
      }),
    ).toBe("request_access");
    expect(
      deriveCommunityFunnelUiMode({
        canEnterCommunity: false,
        canJoinWithCheckout: false,
        canJoinWithApproval: false,
        canJoinForFree: true,
      }),
    ).toBe("join");
    expect(
      deriveCommunityFunnelUiMode({
        canEnterCommunity: false,
        canJoinWithCheckout: false,
        canJoinWithApproval: false,
        canJoinForFree: false,
      }),
    ).toBe("private");
  });

  it("fails closed when paid access has no valid positive plan", () => {
    const missing = buildCommunityFunnelPrimaryActionView({
      mode: "checkout",
      plan: null,
    });
    expect(missing.label).toBe("Join unavailable");
    expect(missing.hasValidPaidPlan).toBe(false);

    const zero = buildCommunityFunnelPrimaryActionView({
      mode: "checkout",
      plan: {
        name: "Invalid",
        description: null,
        amount_base_units: "0",
        currency: "USD",
        currency_decimals: 2,
        billing_period: "monthly",
      },
    });
    expect(zero.label).toBe("Join unavailable");
    expect(zero.hasValidPaidPlan).toBe(false);
  });

  it("preserves entry and approval lifecycle state labels", () => {
    expect(buildCommunityFunnelPrimaryActionView({ mode: "enter" }).label).toBe(
      "Enter community",
    );
    expect(
      buildCommunityFunnelPrimaryActionView({
        mode: "request_access",
        approvalPending: true,
      }).label,
    ).toBe("Request pending");
    expect(
      buildCommunityFunnelPrimaryActionView({
        mode: "request_access",
        approvalDenied: true,
        canRequestAgain: true,
      }).label,
    ).toBe("Request again");
    expect(
      buildCommunityFunnelPrimaryActionView({ mode: "join", isBusy: true })
        .label,
    ).toBe("Joining…");
  });
});
