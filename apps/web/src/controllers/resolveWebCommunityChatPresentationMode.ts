export type WebCommunityChatPresentationMode =
  | "canonical"
  | "canonical_bootstrap"
  | "legacy_bootstrap"
  | "legacy";

type ResolveWebCommunityChatPresentationModeInput = {
  canonicalProjectionEnabled: boolean;
  hasActiveCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  isResolvingSelectedCommunity: boolean;
  hasCommunityTimelineItems: boolean;
  hasCommunityChatError: boolean;
  isLoadingChat: boolean;
  hasResolvedCommunityChat: boolean;
};

/**
 * Chooses one structural owner for the community chat surface.
 *
 * Canonical community chat never falls through to the legacy loader. While a
 * community scope is unknown, it owns a geometry-compatible bootstrap frame;
 * once a scope exists, transient auth or data refreshes keep that projection
 * mounted and let its data boundaries fail closed independently.
 */
export function resolveWebCommunityChatPresentationMode(
  input: ResolveWebCommunityChatPresentationModeInput,
): WebCommunityChatPresentationMode {
  if (input.canonicalProjectionEnabled) {
    if (input.hasAuthenticatedPresentation && input.hasActiveCommunity) {
      return "canonical";
    }
    if (
      input.hasAuthenticatedPresentation &&
      (input.isAuthRecoveringSignedIn || input.isResolvingSelectedCommunity)
    ) {
      return "canonical_bootstrap";
    }
    return "legacy";
  }

  if (
    input.hasAuthenticatedPresentation &&
    (input.isAuthRecoveringSignedIn ||
      input.isResolvingSelectedCommunity ||
      (input.hasActiveCommunity &&
        !input.hasCommunityTimelineItems &&
        !input.hasCommunityChatError &&
        (input.isLoadingChat || !input.hasResolvedCommunityChat)))
  ) {
    return "legacy_bootstrap";
  }

  return "legacy";
}
