import { describe, expect, test } from "vitest";

import { buildAccountSetupStatus } from "../shared/accountSetup";
import { resolveCommunityEntrySetupAction } from "../apps/web/src/controllers/useWebCommunityEntryBridgeController";

describe("community entry account-setup admission", () => {
  test("waits while account setup is unresolved", () => {
    expect(
      resolveCommunityEntrySetupAction({
        publicRouteKind: "community_funnel",
        isAccountSetupResolved: false,
        accountSetupStatus: null,
      }),
    ).toBe("wait");
  });

  test("opens setup for a resolved incomplete account", () => {
    expect(
      resolveCommunityEntrySetupAction({
        publicRouteKind: "community_funnel",
        isAccountSetupResolved: true,
        accountSetupStatus: buildAccountSetupStatus({}),
      }),
    ).toBe("setup");
  });

  test("enters only after setup is complete", () => {
    expect(
      resolveCommunityEntrySetupAction({
        publicRouteKind: "community_funnel",
        isAccountSetupResolved: true,
        accountSetupStatus: buildAccountSetupStatus({
          displayName: "Member",
          handle: "member",
          avatarUrl: "https://example.com/member.png",
          hasAcceptedPlatformLegal: true,
        }),
      }),
    ).toBe("enter");
  });
});
