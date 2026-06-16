import { useCallback, useEffect, useRef, useState } from "react";

import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import {
  fetchCloudCommunityPolynetOverview,
  type CloudCommunityPolynetOverview,
} from "../../../../shared/cloudCommunityPolynetGateway";

function formatCommunityPolynetError(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Unable to load Polynet.";
  if (value.includes("Could not find public function")) return "Polynet backend changes are not live in Convex yet.";
  if (value.includes("community_not_found")) return "Community not found.";
  if (value.includes("community_access_required") || value.includes("community_chat_access_required")) {
    return "You do not have access to this community.";
  }
  return value;
}

type EnsureSessionFn<SessionT> = (session?: SessionT | null) => Promise<SessionT | null>;

type UseWebCommunityPolynetControllerArgs<SessionT> = {
  activePage: AppPage;
  communityTab: CommunityTab;
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession: EnsureSessionFn<SessionT>;
  requireSignIn: () => void;
  canViewPolynet: boolean;
};

export function useWebCommunityPolynetController<SessionT>(
  args: UseWebCommunityPolynetControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [overview, setOverview] = useState<CloudCommunityPolynetOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const isStaleRequest = useCallback((requestSeq: number, communityId: string) => {
    const current = argsRef.current;
    return (
      requestSeq !== requestSeqRef.current
      || current.activePage !== "community"
      || current.communityTab !== "polynet"
      || current.activeCommunityId !== communityId
      || !current.canViewPolynet
    );
  }, []);

  const resetPolynetState = useCallback(() => {
    requestSeqRef.current += 1;
    setOverview(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const loadOverview = useCallback(async (
    communityId: string,
    sessionInput?: SessionT | null,
  ) => {
    const requestSeq = ++requestSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const usableSession = await argsRef.current.ensureSession(sessionInput ?? argsRef.current.session);
      if (isStaleRequest(requestSeq, communityId)) return null;
      if (!usableSession) {
        setOverview(null);
        return null;
      }
      const nextOverview = await fetchCloudCommunityPolynetOverview<SessionT>({
        session: usableSession,
        communityId,
      });
      if (isStaleRequest(requestSeq, communityId)) return null;
      setOverview(nextOverview ?? null);
      return nextOverview ?? null;
    } catch (err) {
      if (isStaleRequest(requestSeq, communityId)) return null;
      setOverview(null);
      setError(formatCommunityPolynetError(err instanceof Error ? err.message : err));
      return null;
    } finally {
      if (!isStaleRequest(requestSeq, communityId)) {
        setIsLoading(false);
      }
    }
  }, [isStaleRequest]);

  const refresh = useCallback(async () => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const usableSession = await current.ensureSession();
    if (!usableSession) {
      current.requireSignIn();
      return;
    }
    await loadOverview(activeCommunityId, usableSession);
  }, [loadOverview]);

  useEffect(() => {
    if (args.activePage !== "community" || args.communityTab !== "polynet" || !args.activeCommunityId) {
      resetPolynetState();
      return;
    }
    if (!args.session || !args.canViewPolynet) {
      resetPolynetState();
      return;
    }
    void loadOverview(args.activeCommunityId, args.session);
  }, [
    args.activeCommunityId,
    args.activePage,
    args.canViewPolynet,
    args.communityTab,
    args.session,
    loadOverview,
    resetPolynetState,
  ]);

  return {
    state: {
      overview,
      isLoading,
      error,
    },
    actions: {
      refresh: () => {
        void refresh();
      },
    },
  };
}
