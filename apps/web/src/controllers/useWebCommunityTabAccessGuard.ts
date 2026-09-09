import { useEffect } from "react";

import {
  normalizeCommunityTabForAccess,
  type AppPage,
  type AppView,
  type CommunityTab,
} from "../../../../shared/appShellNavigation";

export function useWebCommunityTabAccessGuard(params: {
  activePage: AppPage;
  activeView: AppView;
  activeCommunityId: string | null;
  activeCommunityAccessId: string | null;
  isLoadingCommunityAccess: boolean;
  communityTab: CommunityTab;
  canViewSettings: boolean;
  canViewMembers: boolean;
  canManageMembers: boolean;
  canViewAnalytics: boolean;
  setCommunityResourceModuleId: (value: null) => void;
  setActiveView: (view: AppView) => void;
  applyCommunityShellState: (value: {
    communityTab: CommunityTab;
  }) => void;
}) {
  useEffect(() => {
    if (
      params.activePage !== "community" ||
      !params.activeCommunityId ||
      params.isLoadingCommunityAccess ||
      params.activeCommunityAccessId !== params.activeCommunityId
    ) {
      return;
    }
    const normalizedTab = normalizeCommunityTabForAccess(
      params.communityTab,
      {
        canViewSettings: params.canViewSettings,
        canManageMembers: params.canManageMembers,
        canViewAnalytics: params.canViewAnalytics,
      },
    );
    if (normalizedTab === params.communityTab) return;
    params.setCommunityResourceModuleId(null);
    params.applyCommunityShellState({ communityTab: normalizedTab });
  }, [
    params.activeCommunityAccessId,
    params.activeCommunityId,
    params.activePage,
    params.activeView,
    params.applyCommunityShellState,
    params.canViewAnalytics,
    params.canManageMembers,
    params.canViewMembers,
    params.canViewSettings,
    params.communityTab,
    params.isLoadingCommunityAccess,
    params.setCommunityResourceModuleId,
    params.setActiveView,
  ]);
}
