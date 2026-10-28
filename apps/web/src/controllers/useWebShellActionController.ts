import { useCallback } from "react";

import { deriveOpenDiscoverTransition } from "../../../../shared/appNavTransitions";
import type {
  AppPage,
  AppView,
} from "../../../../shared/appShellNavigation";

export function useWebShellActionController(params: {
  activePage: AppPage;
  activeCommunitySlug: string | null;
  selectedActiveCommunitySlug: string | null;
  isAuthenticated: boolean;
  goBack: () => boolean;
  openCommunityChat: (communitySlug: string) => void;
  resolveAndEnterMemberDestination: (options: {
    replace: true;
  }) => Promise<boolean>;
  navigateTo: (
    path: string,
    options?: { replace?: boolean },
  ) => void;
  pushNavSnapshot: () => void;
  setActivePage: (page: AppPage) => void;
  setActiveView: (view: AppView) => void;
}) {
  const handleTopbarBackToCommunity = useCallback(() => {
    if (params.goBack()) return;
    const communitySlug = String(
      params.selectedActiveCommunitySlug ??
        params.activeCommunitySlug ??
        "",
    ).trim();
    if (communitySlug) {
      params.openCommunityChat(communitySlug);
      return;
    }
    if (params.isAuthenticated) {
      void params
        .resolveAndEnterMemberDestination({ replace: true })
        .then((entered) => {
          if (!entered) {
            params.navigateTo("/discover", { replace: true });
          }
        });
      return;
    }
    params.navigateTo("/discover", { replace: true });
  }, [
    params.activeCommunitySlug,
    params.goBack,
    params.isAuthenticated,
    params.navigateTo,
    params.openCommunityChat,
    params.resolveAndEnterMemberDestination,
    params.selectedActiveCommunitySlug,
  ]);

  const handleOpenDiscover = useCallback(() => {
    const transition = deriveOpenDiscoverTransition({
      activePage: params.activePage,
    });
    if (transition.shouldPushSnapshot) params.pushNavSnapshot();
    params.setActiveView(transition.nextView);
    params.setActivePage(transition.nextPage);
  }, [
    params.activePage,
    params.pushNavSnapshot,
    params.setActivePage,
    params.setActiveView,
  ]);

  return {
    handleTopbarBackFromSettings: handleTopbarBackToCommunity,
    handleTopbarBackFromPublicFunnel: () => {
      void params.goBack();
    },
    handleTopbarBackToCommunity,
    handleOpenDiscover,
  };
}
