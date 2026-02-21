import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

export function useCommunityAgentMembersLifecycle<SessionT, CommunityAgentDraftT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  supabaseSession: SessionT | null;
  activeCommunityId: string | null;
  canManageMembersActiveCommunity: boolean;
  activeCommunityOwnerIsPro: boolean | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
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
  useEffect(() => {
    if (!params.supabaseSession || !params.activeCommunityId || !params.canManageMembersActiveCommunity) {
      params.setActiveCommunityOwnerIsPro(null);
      params.activeCommunityOwnerIsProLoadedCommunityIdRef.current = null;
      return;
    }
    const session = params.supabaseSession;
    const communityId = params.activeCommunityId;
    if (params.activeCommunityOwnerIsProLoadedCommunityIdRef.current === params.activeCommunityId) return;
    params.activeCommunityOwnerIsProLoadedCommunityIdRef.current = params.activeCommunityId;

    const url = params.getSupabaseUrl();
    if (!url) return;

    void (async () => {
      try {
        const response = await params.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/community_owner_is_pro`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session,
        );
        if (!response.ok) {
          params.setActiveCommunityOwnerIsPro(null);
          return;
        }
        const data = (await response.json()) as unknown;
        params.setActiveCommunityOwnerIsPro(typeof data === "boolean" ? data : null);
      } catch {
        params.setActiveCommunityOwnerIsPro(null);
      }
    })();
  }, [
    params.supabaseSession,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
    params.getSupabaseUrl,
    params.fetchWithSupabaseAuth,
  ]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "ai_agent") return;
    if (!params.supabaseSession || !params.activeCommunityId || !params.canManageMembersActiveCommunity) {
      params.setCommunityAgentDrafts([]);
      params.setCommunityAgentDraftsError(null);
      params.communityAgentDraftsLoadedCommunityIdRef.current = null;
      return;
    }
    const session = params.supabaseSession;
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
    params.supabaseSession,
    params.activeCommunityId,
    params.canManageMembersActiveCommunity,
    params.activeCommunityOwnerIsPro,
    params.loadCommunityAgentDrafts,
    params.enforceProDraftGate,
  ]);

  useEffect(() => {
    if (!params.supabaseSession || !params.activeCommunityId || params.activePage !== "community") return;
    const session = params.supabaseSession;
    const communityId = params.activeCommunityId;
    void params.loadCommunityMembers(communityId, session, {
      includeStatus: params.canManageMembersActiveCommunity,
    });
  }, [
    params.supabaseSession,
    params.activeCommunityId,
    params.activePage,
    params.canManageMembersActiveCommunity,
    params.loadCommunityMembers,
  ]);
}
