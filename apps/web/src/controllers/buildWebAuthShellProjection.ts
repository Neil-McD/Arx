import type { AppPage } from "../../../../shared/appShellNavigation";
import {
  isLegacyWorkspaceRoutePath,
  isRootAppRoutePath,
  type PublicRoute,
} from "../../../../shared/webAppRouteState";
import type {
  WebAccountGraphHydrationPhase,
} from "../webAppContracts";

type AuthPresentationState =
  | "signed_out"
  | "recovering_signed_in"
  | "signed_in";

export function buildWebAuthShellProjection(params: {
  publicRouteKind: PublicRoute["kind"];
  activePage: AppPage;
  authPresentationState: AuthPresentationState;
  accountGraphHydrationPhase: WebAccountGraphHydrationPhase;
  pathname: string;
}) {
  const isAppRoute = params.publicRouteKind === "app";

  return {
    hasAuthenticatedAppShellPresentation:
      isAppRoute && params.authPresentationState !== "signed_out",
    isAuthRecoveringSignedInAppShell:
      isAppRoute &&
      params.authPresentationState === "recovering_signed_in",
    shouldHoldLandingForAuth:
      isAppRoute &&
      params.activePage === "landing" &&
      (isLegacyWorkspaceRoutePath(params.pathname) ||
        (params.authPresentationState !== "signed_out" &&
          isRootAppRoutePath(params.pathname))),
    isAccountGraphHydratingCriticalAppShell:
      isAppRoute &&
      params.authPresentationState === "signed_in" &&
      params.accountGraphHydrationPhase === "critical",
  };
}
