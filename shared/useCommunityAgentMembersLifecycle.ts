import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

export function useCommunityAgentMembersLifecycle<SessionT, CommunityAgentConfigT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  canManageMembersActiveCommunity: boolean;
  loadCommunityAgentConfig: (communityId: string, session: SessionT) => Promise<void>;
  communityAgentConfigLoadedCommunityIdRef: MutableRefObject<string | null>;
  setCommunityAgentConfigError: Dispatch<SetStateAction<string | null>>;
  loadCommunityMembers: (communityId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "ai_agent") return;
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
    session,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
    params.loadCommunityAgentConfig,
  ]);

  useEffect(() => {
    if (!session || !params.activeCommunityId || params.activePage !== "community") return;
    const communityId = params.activeCommunityId;
    void params.loadCommunityMembers(communityId, session);
  }, [
    session,
    params.activeCommunityId,
    params.activePage,
    params.canManageMembersActiveCommunity,
    params.loadCommunityMembers,
  ]);
}
