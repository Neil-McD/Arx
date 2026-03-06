import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

import { fetchCloudCommunityOwnerIsPro } from "./cloudCommunityAdminGateway";

export function useCommunityAgentMembersLifecycle<SessionT, CommunityAgentDraftT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  canManageMembersActiveCommunity: boolean;
  activeCommunityOwnerIsPro: boolean | null;
  setActiveCommunityOwnerIsPro: Dispatch<SetStateAction<boolean | null>>;
  activeCommunityOwnerIsProLoadedCommunityIdRef: MutableRefObject<string | null>;
  loadCommunityAgentDrafts: (communityId: string, session: SessionT) => Promise<void>;
  communityAgentDraftsLoadedCommunityIdRef: MutableRefObject<string | null>;
  setCommunityAgentDrafts: Dispatch<SetStateAction<CommunityAgentDraftT[]>>;
  setCommunityAgentDraftsError: Dispatch<SetStateAction<string | null>>;
  loadCommunityMembers: (
    communityId: string,
    session: SessionT,
    options?: { includeStatus?: boolean },
  ) => Promise<void>;
  enforceProDraftGate?: boolean;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session || !params.activeCommunityId || !params.canManageMembersActiveCommunity) {
      params.setActiveCommunityOwnerIsPro(null);
      params.activeCommunityOwnerIsProLoadedCommunityIdRef.current = null;
      return;
    }
    const communityId = params.activeCommunityId;
    if (params.activeCommunityOwnerIsProLoadedCommunityIdRef.current === params.activeCommunityId) return;
    params.activeCommunityOwnerIsProLoadedCommunityIdRef.current = params.activeCommunityId;
    void (async () => {
      try {
        const isPro = await fetchCloudCommunityOwnerIsPro({
          session,
          communityId,
        });
        params.setActiveCommunityOwnerIsPro(isPro);
      } catch {
        params.setActiveCommunityOwnerIsPro(null);
      }
    })();
  }, [
    session,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
  ]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "ai_agent") return;
    if (!session || !params.activeCommunityId || !params.canManageMembersActiveCommunity) {
      params.setCommunityAgentDrafts([]);
      params.setCommunityAgentDraftsError(null);
      params.communityAgentDraftsLoadedCommunityIdRef.current = null;
      return;
    }
    const communityId = params.activeCommunityId;
    if ((params.enforceProDraftGate ?? true) && params.activeCommunityOwnerIsPro === false) {
      params.setCommunityAgentDrafts([]);
      params.setCommunityAgentDraftsError("pro_plan_required");
      params.communityAgentDraftsLoadedCommunityIdRef.current = communityId;
      return;
    }
    if (params.communityAgentDraftsLoadedCommunityIdRef.current === communityId) return;
    void params.loadCommunityAgentDrafts(communityId, session);
  }, [
    params.activePage,
    params.communityTab,
    session,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
    params.activeCommunityOwnerIsPro,
    params.loadCommunityAgentDrafts,
    params.enforceProDraftGate,
  ]);

  useEffect(() => {
    if (!session || !params.activeCommunityId || params.activePage !== "community") return;
    const communityId = params.activeCommunityId;
    void params.loadCommunityMembers(communityId, session, {
      includeStatus: params.canManageMembersActiveCommunity,
    });
  }, [
    session,
    params.activeCommunityId,
    params.activePage,
    params.canManageMembersActiveCommunity,
    params.loadCommunityMembers,
  ]);
}
