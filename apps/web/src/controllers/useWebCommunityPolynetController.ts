import { useCallback, useEffect, useRef, useState } from "react";

import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import {
  fetchCloudCommunityArchiveHealth,
  processCloudCommunityArchivePending,
  requestCloudCommunityArchiveBackfill,
  retryCloudCommunityArchiveFailures,
  type CloudCommunityArchiveHealthRow,
} from "../../../../shared/cloudCommunityAdminGateway";

function formatCommunityArchiveError(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Unable to load Polynet health.";
  if (value.includes("community_not_found")) return "Community not found.";
  if (value.includes("community_manage_access_required")) return "Only owners and admins can access Polynet.";
  return value;
}

type EnsureSessionFn<SessionT> = (session?: SessionT | null) => Promise<SessionT | null>;

type UseWebCommunityPolynetControllerArgs<SessionT> = {
  activePage: AppPage;
  communityTab: CommunityTab;
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession: EnsureSessionFn<SessionT>;
  openAuthGate: () => void;
  canManagePolynet: boolean;
};

export function useWebCommunityPolynetController<SessionT>(
  args: UseWebCommunityPolynetControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [communityArchiveHealth, setCommunityArchiveHealth] = useState<CloudCommunityArchiveHealthRow | null>(null);
  const [isLoadingCommunityArchiveHealth, setIsLoadingCommunityArchiveHealth] = useState(false);
  const [communityArchiveHealthError, setCommunityArchiveHealthError] = useState<string | null>(null);
  const [isBackfillingCommunityArchive, setIsBackfillingCommunityArchive] = useState(false);
  const [isProcessingCommunityArchive, setIsProcessingCommunityArchive] = useState(false);
  const [isRetryingCommunityArchive, setIsRetryingCommunityArchive] = useState(false);
  const requestSeqRef = useRef(0);

  const isStaleRequest = useCallback((requestSeq: number, communityId: string) => {
    const current = argsRef.current;
    return (
      requestSeq !== requestSeqRef.current
      || current.activePage !== "community"
      || current.communityTab !== "polynet"
      || current.activeCommunityId !== communityId
      || !current.canManagePolynet
    );
  }, []);

  const isActivePolynetContext = useCallback((communityId: string) => {
    const current = argsRef.current;
    return (
      current.activePage === "community"
      && current.communityTab === "polynet"
      && current.activeCommunityId === communityId
      && current.canManagePolynet
    );
  }, []);

  const resetPolynetState = useCallback(() => {
    requestSeqRef.current += 1;
    setCommunityArchiveHealth(null);
    setCommunityArchiveHealthError(null);
    setIsLoadingCommunityArchiveHealth(false);
    setIsBackfillingCommunityArchive(false);
    setIsProcessingCommunityArchive(false);
    setIsRetryingCommunityArchive(false);
  }, []);

  const loadCommunityArchiveHealth = useCallback(async (
    communityId: string,
    sessionInput?: SessionT | null,
  ) => {
    const requestSeq = ++requestSeqRef.current;
    setIsLoadingCommunityArchiveHealth(true);
    setCommunityArchiveHealthError(null);
    try {
      const usableSession = await argsRef.current.ensureSession(
        sessionInput ?? argsRef.current.session,
      );
      if (isStaleRequest(requestSeq, communityId)) return null;
      if (!usableSession) {
        setCommunityArchiveHealth(null);
        return null;
      }
      const health = await fetchCloudCommunityArchiveHealth<SessionT>({
        session: usableSession,
        communityId,
      });
      if (isStaleRequest(requestSeq, communityId)) return null;
      setCommunityArchiveHealth(health ?? null);
      return health ?? null;
    } catch (error) {
      if (isStaleRequest(requestSeq, communityId)) return null;
      setCommunityArchiveHealth(null);
      setCommunityArchiveHealthError(
        formatCommunityArchiveError(error instanceof Error ? error.message : error),
      );
      return null;
    } finally {
      if (!isStaleRequest(requestSeq, communityId)) {
        setIsLoadingCommunityArchiveHealth(false);
      }
    }
  }, [isStaleRequest]);

  const refresh = useCallback(async () => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const usableSession = await current.ensureSession();
    if (!usableSession) {
      current.openAuthGate();
      return;
    }
    await loadCommunityArchiveHealth(activeCommunityId, usableSession);
  }, [loadCommunityArchiveHealth]);

  const backfill = useCallback(async () => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const usableSession = await current.ensureSession();
    if (!usableSession) {
      current.openAuthGate();
      return;
    }
    setIsBackfillingCommunityArchive(true);
    setCommunityArchiveHealthError(null);
    try {
      await requestCloudCommunityArchiveBackfill<SessionT>({
        session: usableSession,
        communityId: activeCommunityId,
      });
      await loadCommunityArchiveHealth(activeCommunityId, usableSession);
    } catch (error) {
      if (isActivePolynetContext(activeCommunityId)) {
        setCommunityArchiveHealthError(
          formatCommunityArchiveError(error instanceof Error ? error.message : error),
        );
      }
    } finally {
      setIsBackfillingCommunityArchive(false);
    }
  }, [isActivePolynetContext, loadCommunityArchiveHealth]);

  const processPending = useCallback(async () => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const usableSession = await current.ensureSession();
    if (!usableSession) {
      current.openAuthGate();
      return;
    }
    setIsProcessingCommunityArchive(true);
    setCommunityArchiveHealthError(null);
    try {
      const result = await processCloudCommunityArchivePending<SessionT>({
        session: usableSession,
        communityId: activeCommunityId,
      });
      await loadCommunityArchiveHealth(activeCommunityId, usableSession);
      if (result?.error && isActivePolynetContext(activeCommunityId)) {
        setCommunityArchiveHealthError(formatCommunityArchiveError(result.error));
      }
    } catch (error) {
      if (isActivePolynetContext(activeCommunityId)) {
        setCommunityArchiveHealthError(
          formatCommunityArchiveError(error instanceof Error ? error.message : error),
        );
      }
    } finally {
      setIsProcessingCommunityArchive(false);
    }
  }, [isActivePolynetContext, loadCommunityArchiveHealth]);

  const retryFailed = useCallback(async () => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const usableSession = await current.ensureSession();
    if (!usableSession) {
      current.openAuthGate();
      return;
    }
    setIsRetryingCommunityArchive(true);
    setCommunityArchiveHealthError(null);
    try {
      const result = await retryCloudCommunityArchiveFailures<SessionT>({
        session: usableSession,
        communityId: activeCommunityId,
      });
      await loadCommunityArchiveHealth(activeCommunityId, usableSession);
      if (result?.error && isActivePolynetContext(activeCommunityId)) {
        setCommunityArchiveHealthError(formatCommunityArchiveError(result.error));
      }
    } catch (error) {
      if (isActivePolynetContext(activeCommunityId)) {
        setCommunityArchiveHealthError(
          formatCommunityArchiveError(error instanceof Error ? error.message : error),
        );
      }
    } finally {
      setIsRetryingCommunityArchive(false);
    }
  }, [isActivePolynetContext, loadCommunityArchiveHealth]);

  useEffect(() => {
    if (args.activePage !== "community" || args.communityTab !== "polynet" || !args.activeCommunityId) {
      resetPolynetState();
      return;
    }
    if (!args.session || !args.canManagePolynet) {
      resetPolynetState();
      return;
    }
    void loadCommunityArchiveHealth(args.activeCommunityId, args.session);
  }, [
    args.activeCommunityId,
    args.activePage,
    args.canManagePolynet,
    args.communityTab,
    args.session,
    loadCommunityArchiveHealth,
    resetPolynetState,
  ]);

  return {
    state: {
      health: communityArchiveHealth,
      isLoading: isLoadingCommunityArchiveHealth,
      error: communityArchiveHealthError,
      isBackfilling: isBackfillingCommunityArchive,
      isProcessingPending: isProcessingCommunityArchive,
      isRetrying: isRetryingCommunityArchive,
    },
    actions: {
      refresh: () => {
        void refresh();
      },
      backfill: () => {
        void backfill();
      },
      processPending: () => {
        void processPending();
      },
      retryFailed: () => {
        void retryFailed();
      },
    },
  };
}
