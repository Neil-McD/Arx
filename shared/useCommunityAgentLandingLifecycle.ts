import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

export function useCommunityAgentLandingLifecycle<SessionT>(params: {
  supabaseSession: SessionT | null;
  activeCommunityId: string | null;
  canViewCommunity: boolean;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  activeCommunityIdRef: MutableRefObject<string | null>;
  activeCommunityAgentLandingCommunityIdRef: MutableRefObject<string | null>;
  communityAgentLandingFetchSeqRef: MutableRefObject<number>;
  setActiveCommunityAgentLanding: Dispatch<SetStateAction<unknown | null>>;
}) {
  useEffect(() => {
    const session = params.supabaseSession;
    const communityId = params.activeCommunityId;
    const canView = params.canViewCommunity;
    if (!session || !communityId || !canView) {
      params.setActiveCommunityAgentLanding(null);
      params.activeCommunityAgentLandingCommunityIdRef.current = null;
      return;
    }
    if (params.activeCommunityAgentLandingCommunityIdRef.current === communityId) return;

    const url = params.getSupabaseUrl();
    if (!url) return;

    params.communityAgentLandingFetchSeqRef.current += 1;
    const fetchSeq = params.communityAgentLandingFetchSeqRef.current;

    void (async () => {
      try {
        const response = await params.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_active_community_agent_landing`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session,
        );
        const data = response.ok ? ((await response.json()) as unknown) : null;
        if (params.communityAgentLandingFetchSeqRef.current !== fetchSeq) return;
        if (params.activeCommunityIdRef.current !== communityId) return;
        params.setActiveCommunityAgentLanding(data ?? null);
        params.activeCommunityAgentLandingCommunityIdRef.current = communityId;
      } catch {
        if (params.communityAgentLandingFetchSeqRef.current !== fetchSeq) return;
        if (params.activeCommunityIdRef.current !== communityId) return;
        params.setActiveCommunityAgentLanding(null);
        params.activeCommunityAgentLandingCommunityIdRef.current = communityId;
      }
    })();
  }, [
    params.supabaseSession,
    params.activeCommunityId,
    params.canViewCommunity,
    params.getSupabaseUrl,
    params.fetchWithSupabaseAuth,
    params.activeCommunityIdRef,
    params.activeCommunityAgentLandingCommunityIdRef,
    params.communityAgentLandingFetchSeqRef,
    params.setActiveCommunityAgentLanding,
  ]);
}
