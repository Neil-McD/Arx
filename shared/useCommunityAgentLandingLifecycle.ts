import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { fetchActiveCloudCommunityAgentLanding } from "./cloudCommunityAgentGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

export function useCommunityAgentLandingLifecycle<SessionT>(params: {
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  activeCommunityId: string | null;
  canViewCommunity: boolean;
  activeCommunityIdRef: MutableRefObject<string | null>;
  activeCommunityAgentLandingCommunityIdRef: MutableRefObject<string | null>;
  communityAgentLandingFetchSeqRef: MutableRefObject<number>;
  setActiveCommunityAgentLanding: Dispatch<SetStateAction<unknown | null>>;
}) {
  const inFlightCommunityIdRef = useRef<string | null>(null);

  useEffect(() => {
    const session = params.session;
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
    inFlightCommunityIdRef.current = communityId;
    params.communityAgentLandingFetchSeqRef.current += 1;
    const fetchSeq = params.communityAgentLandingFetchSeqRef.current;

    void (async () => {
      try {
        const usableSession = await resolveUsableSession(session, params.ensureSession);
        if (!usableSession) return;
        const data = await fetchActiveCloudCommunityAgentLanding({
          session: usableSession,
          communityId,
        });
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
        if (inFlightCommunityIdRef.current === communityId) {
          inFlightCommunityIdRef.current = null;
        }
      }
    })();
    return () => {
      if (inFlightCommunityIdRef.current === communityId) {
        inFlightCommunityIdRef.current = null;
      }
    };
  }, [
    params.session,
    params.ensureSession,
    params.activeCommunityId,
    params.canViewCommunity,
    params.activeCommunityIdRef,
    params.activeCommunityAgentLandingCommunityIdRef,
    params.communityAgentLandingFetchSeqRef,
    params.setActiveCommunityAgentLanding,
  ]);
}
