import { useEffect } from "react";

import {
  normalizeCommunityTabForAccess,
  type AppPage,
  type CommunityTab,
} from "../../../../shared/appShellNavigation";

export function useWebCommunityTabAccessGuard(params: {
  activePage: AppPage;
  activeCommunityId: string | null;
  activeCommunityAccessId: string | null;
  isLoadingCommunityAccess: boolean;
  communityTab: CommunityTab;
  canViewSettings: boolean;
  canViewPolynet: boolean;
  canManageMembers: boolean;
  canViewAnalytics: boolean;
  setCommunityResourceModuleId: (value: null) => void;
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
        canViewPolynet: params.canViewPolynet,
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
    params.applyCommunityShellState,
    params.canManageMembers,
    params.canViewAnalytics,
    params.canViewPolynet,
    params.canViewSettings,
    params.communityTab,
    params.isLoadingCommunityAccess,
    params.setCommunityResourceModuleId,
  ]);
}
