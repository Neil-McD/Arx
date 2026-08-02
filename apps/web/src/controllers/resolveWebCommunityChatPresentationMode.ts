export type WebCommunityChatPresentationMode =
  | "canonical"
  | "canonical_bootstrap"
  | "empty";

type ResolveWebCommunityChatPresentationModeInput = {
  hasActiveCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  isResolvingSelectedCommunity: boolean;
};

/**
 * Chooses one structural owner for the community chat surface.
 *
 * Canonical community chat never falls through to the legacy loader. While a
 * community scope is unknown, it owns a geometry-compatible bootstrap frame
 * even before auth restoration finishes;
 * once a scope exists, transient auth or data refreshes keep that projection
 * mounted and let its data boundaries fail closed independently.
 */
export function resolveWebCommunityChatPresentationMode(
  input: ResolveWebCommunityChatPresentationModeInput,
): WebCommunityChatPresentationMode {
  if (input.hasAuthenticatedPresentation && input.hasActiveCommunity) {
    return "canonical";
  }
  if (input.isAuthRecoveringSignedIn || input.isResolvingSelectedCommunity) {
    return "canonical_bootstrap";
  }
  return "empty";
}
