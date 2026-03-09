import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

import { fetchCloudCommunityOwnerHasBuilderAccess } from "./cloudCommunityAdminGateway";

export function useCommunityAgentMembersLifecycle<SessionT, CommunityAgentDraftT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  canManageMembersActiveCommunity: boolean;
  activeCommunityOwnerHasBuilderAccess: boolean | null;
  setActiveCommunityOwnerHasBuilderAccess: Dispatch<SetStateAction<boolean | null>>;
  activeCommunityOwnerHasBuilderAccessLoadedCommunityIdRef: MutableRefObject<string | null>;
  loadCommunityAgentDrafts: (communityId: string, session: SessionT) => Promise<void>;
  communityAgentDraftsLoadedCommunityIdRef: MutableRefObject<string | null>;
  setCommunityAgentDrafts: Dispatch<SetStateAction<CommunityAgentDraftT[]>>;
  setCommunityAgentDraftsError: Dispatch<SetStateAction<string | null>>;
  loadCommunityMembers: (
    communityId: string,
    session: SessionT,
    options?: { includeStatus?: boolean },
  ) => Promise<void>;
  enforceBuilderDraftGate?: boolean;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session || !params.activeCommunityId || !params.canManageMembersActiveCommunity) {
      params.setActiveCommunityOwnerHasBuilderAccess(null);
      params.activeCommunityOwnerHasBuilderAccessLoadedCommunityIdRef.current = null;
      return;
    }
    const communityId = params.activeCommunityId;
    if (params.activeCommunityOwnerHasBuilderAccessLoadedCommunityIdRef.current === params.activeCommunityId) return;
    params.activeCommunityOwnerHasBuilderAccessLoadedCommunityIdRef.current = params.activeCommunityId;
    void (async () => {
      try {
        const hasBuilderAccess = await fetchCloudCommunityOwnerHasBuilderAccess({
          session,
          communityId,
        });
        params.setActiveCommunityOwnerHasBuilderAccess(hasBuilderAccess);
      } catch {
        params.setActiveCommunityOwnerHasBuilderAccess(null);
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
    if ((params.enforceBuilderDraftGate ?? true) && params.activeCommunityOwnerHasBuilderAccess === false) {
      params.setCommunityAgentDrafts([]);
      params.setCommunityAgentDraftsError("builder_plan_required");
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
    params.activeCommunityOwnerHasBuilderAccess,
    params.loadCommunityAgentDrafts,
    params.enforceBuilderDraftGate,
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
