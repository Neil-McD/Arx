import type { AppPage } from "../../../../shared/appShellNavigation";
import {
  isLegacyWorkspaceRoutePath,
  isRootAppRoutePath,
  type PublicRoute,
} from "../../../../shared/webAppRouteState";
type AuthPresentationState =
  | "signed_out"
  | "recovering_signed_in"
  | "verification_failed"
  | "signed_in";

export function buildWebAuthShellProjection(params: {
  publicRouteKind: PublicRoute["kind"];
  activePage: AppPage;
  authPresentationState: AuthPresentationState;
  pathname: string;
}) {
  const isAppRoute = params.publicRouteKind === "app";

  return {
    hasAuthenticatedAppShellPresentation:
      isAppRoute && params.authPresentationState !== "signed_out",
    isAuthRecoveringSignedInAppShell:
      isAppRoute &&
      (params.authPresentationState === "recovering_signed_in" ||
        params.authPresentationState === "verification_failed"),
    shouldHoldLandingForAuth:
      isAppRoute &&
      params.activePage === "landing" &&
      (isLegacyWorkspaceRoutePath(params.pathname) ||
        (params.authPresentationState !== "signed_out" &&
          isRootAppRoutePath(params.pathname))),
  };
}
