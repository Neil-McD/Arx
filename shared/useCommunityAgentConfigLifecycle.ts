import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppPage, CommunitySettingsPane, CommunityTab } from "./appShellNavigation";

export function useCommunityAgentConfigLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  communitySettingsPane: CommunitySettingsPane;
  session: SessionT | null;
  activeCommunityId: string | null;
  canManageMembersActiveCommunity: boolean;
  loadCommunityAgentConfig: (communityId: string, session: SessionT) => Promise<void>;
  communityAgentConfigLoadedCommunityIdRef: MutableRefObject<string | null>;
  setCommunityAgentConfigError: Dispatch<SetStateAction<string | null>>;
}) {
  const session = params.session;

  useEffect(() => {
    if (
      params.activePage !== "community"
      || params.communityTab !== "settings"
      || params.communitySettingsPane !== "agent"
    ) return;
    if (!session || !params.activeCommunityId || !params.canManageMembersActiveCommunity) {
      params.setCommunityAgentConfigError(null);
      params.communityAgentConfigLoadedCommunityIdRef.current = null;
      return;
    }
    const communityId = params.activeCommunityId;
    if (params.communityAgentConfigLoadedCommunityIdRef.current === communityId) return;
    void params.loadCommunityAgentConfig(communityId, session);
  }, [
    params.activePage,
    params.communityTab,
    params.communitySettingsPane,
    session,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
    params.loadCommunityAgentConfig,
    params.communityAgentConfigLoadedCommunityIdRef,
    params.setCommunityAgentConfigError,
  ]);
}
