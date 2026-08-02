import { describe, expect, it } from "vitest";
import {
  resolveWebCommunityChatPresentationMode,
  type WebCommunityChatPresentationMode,
} from "../apps/web/src/controllers/resolveWebCommunityChatPresentationMode";

const canonicalReady = {
  canonicalProjectionEnabled: true,
  hasActiveCommunity: true,
  hasAuthenticatedPresentation: true,
  isAuthRecoveringSignedIn: false,
  isResolvingSelectedCommunity: false,
  hasCommunityTimelineItems: true,
  hasCommunityChatError: false,
  isLoadingChat: false,
  hasResolvedCommunityChat: true,
};

describe("web community chat presentation mode", () => {
  it("keeps canonical chat mounted through auth and legacy-loader refreshes", () => {
    expect(
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        isAuthRecoveringSignedIn: true,
        hasCommunityTimelineItems: false,
        isLoadingChat: true,
        hasResolvedCommunityChat: false,
      }),
    ).toBe("canonical");
  });

  it("uses a canonical geometry-compatible frame until the initial scope resolves", () => {
    expect(
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        hasActiveCommunity: false,
        hasCommunityTimelineItems: false,
        isResolvingSelectedCommunity: true,
      }),
    ).toBe("canonical_bootstrap");
  });

  it("never hands a canonical transition to the legacy bootstrap owner", () => {
    const transition: WebCommunityChatPresentationMode[] = [
      resolveWebCommunityChatPresentationMode(canonicalReady),
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        hasCommunityTimelineItems: false,
        isLoadingChat: true,
        hasResolvedCommunityChat: false,
        isResolvingSelectedCommunity: true,
      }),
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        hasActiveCommunity: false,
        hasCommunityTimelineItems: false,
        isResolvingSelectedCommunity: true,
      }),
      resolveWebCommunityChatPresentationMode(canonicalReady),
    ];

    expect(transition).toEqual([
      "canonical",
      "canonical",
      "canonical_bootstrap",
      "canonical",
    ]);
    expect(transition).not.toContain("legacy_bootstrap");
  });

  it("preserves the legacy bootstrap only when canonical chat is disabled", () => {
    expect(
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        canonicalProjectionEnabled: false,
        hasCommunityTimelineItems: false,
        isLoadingChat: true,
        hasResolvedCommunityChat: false,
      }),
    ).toBe("legacy_bootstrap");
  });
});
