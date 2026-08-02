import { describe, expect, it } from "vitest";
import {
  resolveWebCommunityChatPresentationMode,
  type WebCommunityChatPresentationMode,
} from "../apps/web/src/controllers/resolveWebCommunityChatPresentationMode";

const canonicalReady = {
  hasActiveCommunity: true,
  hasAuthenticatedPresentation: true,
  isAuthRecoveringSignedIn: false,
  isResolvingSelectedCommunity: false,
};

describe("web community chat presentation mode", () => {
  it("keeps canonical chat mounted through auth refreshes", () => {
    expect(
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        isAuthRecoveringSignedIn: true,
      }),
    ).toBe("canonical");
  });

  it("uses a canonical geometry-compatible frame until the initial scope resolves", () => {
    expect(
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        hasActiveCommunity: false,
        isResolvingSelectedCommunity: true,
      }),
    ).toBe("canonical_bootstrap");
  });

  it("never hands an authenticated transition to a legacy chat owner", () => {
    const transition: WebCommunityChatPresentationMode[] = [
      resolveWebCommunityChatPresentationMode(canonicalReady),
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        isAuthRecoveringSignedIn: true,
        isResolvingSelectedCommunity: true,
      }),
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        hasActiveCommunity: false,
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
    expect(transition).not.toContain("legacy");
  });

  it("uses an inert empty shell for signed-out or empty app state", () => {
    expect(
      resolveWebCommunityChatPresentationMode({
        ...canonicalReady,
        hasActiveCommunity: false,
        hasAuthenticatedPresentation: false,
      }),
    ).toBe("empty");
  });
});
