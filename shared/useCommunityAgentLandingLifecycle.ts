import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

const COMMUNITY_AGENT_LANDING_RPC_TIMEOUT_MS = 5000;

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
  const fetchWithSupabaseAuthRef = useRef(params.fetchWithSupabaseAuth);
  const inFlightCommunityIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseAuthRef.current = params.fetchWithSupabaseAuth;
  }, [params.fetchWithSupabaseAuth]);

  useEffect(() => {
    const session = params.supabaseSession;
    const communityId = params.activeCommunityId;
    const canView = params.canViewCommunity;
    if (!session || !communityId || !canView) {
      inFlightCommunityIdRef.current = null;
      params.setActiveCommunityAgentLanding(null);
      params.activeCommunityAgentLandingCommunityIdRef.current = null;
      return;
    }
    if (params.activeCommunityAgentLandingCommunityIdRef.current === communityId) return;
    if (inFlightCommunityIdRef.current === communityId) return;

    const url = params.getSupabaseUrl();
    if (!url) return;

    inFlightCommunityIdRef.current = communityId;
    params.communityAgentLandingFetchSeqRef.current += 1;
    const fetchSeq = params.communityAgentLandingFetchSeqRef.current;
    const abortController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      abortController.abort();
    }, COMMUNITY_AGENT_LANDING_RPC_TIMEOUT_MS);

    void (async () => {
      try {
        const response = await fetchWithSupabaseAuthRef.current(
          `${url}/rest/v1/rpc/get_active_community_agent_landing`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
            signal: abortController.signal,
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
      } finally {
        globalThis.clearTimeout(timeoutId);
        if (inFlightCommunityIdRef.current === communityId) {
          inFlightCommunityIdRef.current = null;
        }
      }
    })();
    return () => {
      globalThis.clearTimeout(timeoutId);
      abortController.abort();
      if (inFlightCommunityIdRef.current === communityId) {
        inFlightCommunityIdRef.current = null;
      }
    };
  }, [
    params.supabaseSession,
    params.activeCommunityId,
    params.canViewCommunity,
    params.getSupabaseUrl,
    params.activeCommunityIdRef,
    params.activeCommunityAgentLandingCommunityIdRef,
    params.communityAgentLandingFetchSeqRef,
    params.setActiveCommunityAgentLanding,
  ]);
}
