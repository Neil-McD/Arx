import { useEffect } from "react";

import { isDesignV1Active } from "../../../../shared/designSystem";
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
    // Pods are a design v1 page: the classic app has no way in, so an
    // address that names them opens the community's chat instead.
    const normalizedTab = params.communityTab === "pods" && !isDesignV1Active()
      ? "chat"
      : normalizeCommunityTabForAccess(
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
    params.applyCommunityShellState,
    params.canViewAnalytics,
    params.canManageMembers,
    params.canViewSettings,
    params.communityTab,
    params.isLoadingCommunityAccess,
    params.setCommunityResourceModuleId,
  ]);
}
