import { useEffect } from "react";

import type { AppPage } from "../../../../shared/appShellNavigation";

export function useWebMissingCommunityRouteGuard(params: {
  publicRouteKind: string;
  activePage: AppPage;
  hasSelectedCommunity: boolean;
  navigateTo: (
    path: string,
    options: { replace: true },
  ) => void;
}) {
  useEffect(() => {
    if (
      params.publicRouteKind !== "app" ||
      params.activePage !== "community" ||
      params.hasSelectedCommunity
    ) {
      return;
    }
    params.navigateTo("/discover", { replace: true });
  }, [
    params.activePage,
    params.hasSelectedCommunity,
    params.navigateTo,
    params.publicRouteKind,
  ]);
}
