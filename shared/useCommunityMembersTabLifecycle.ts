import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

export function useCommunityMembersTabLifecycle<SessionT, CommunityInviteT, CommunityMemoryCandidateT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  canInviteActiveCommunity: boolean;
  canManageMembersActiveCommunity: boolean;
  loadCommunityInvites: (communityId: string, session: SessionT) => Promise<void>;
  setCommunityInvites: Dispatch<SetStateAction<CommunityInviteT[]>>;
  loadCommunityMemoryCandidates: (communityId: string, session: SessionT) => Promise<void>;
  setCommunityMemoryCandidates: Dispatch<SetStateAction<CommunityMemoryCandidateT[]>>;
  setCommunityMemoryCandidatesError: Dispatch<SetStateAction<string | null>>;
}) {
  const session = params.session;

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "members") return;
    if (!session || !params.activeCommunityId) {
      params.setCommunityInvites([]);
      return;
    }
    if (!params.canInviteActiveCommunity) {
      params.setCommunityInvites([]);
      return;
    }
    void params.loadCommunityInvites(params.activeCommunityId, session);
  }, [
    params.activePage,
    params.communityTab,
    session,
    params.activeCommunityId,
    params.canInviteActiveCommunity,
    params.loadCommunityInvites,
    params.setCommunityInvites,
  ]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "members") return;
    if (!session || !params.activeCommunityId) {
      params.setCommunityMemoryCandidates([]);
      params.setCommunityMemoryCandidatesError(null);
      return;
    }
    if (!params.canManageMembersActiveCommunity) {
      params.setCommunityMemoryCandidates([]);
      params.setCommunityMemoryCandidatesError(null);
      return;
    }
    void params.loadCommunityMemoryCandidates(params.activeCommunityId, session);
  }, [
    params.activePage,
    params.communityTab,
    session,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
    params.loadCommunityMemoryCandidates,
    params.setCommunityMemoryCandidates,
    params.setCommunityMemoryCandidatesError,
  ]);
}
