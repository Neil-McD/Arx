import { useCallback, useRef, useState } from "react";

import type { ConnectCommunityAppInput, CommunityMountedApp } from "../../../../shared/communityAppMountTypes";
import {
  recommendCloudCommunityApp,
  listCloudCommunityAppGrants,
  refreshCloudCommunityAppGrant,
  removeCloudCommunityAppGrant,
  updateCloudCommunityAppGrant,
} from "../../../../shared/cloudCommunityAppMountGateway";
import { resolveUsableSession, type EnsureSessionFn } from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebCommunityAppGrantsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebCommunityAppGrantsController<SessionT extends SessionLike>(
  args: UseWebCommunityAppGrantsControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [communityAppMounts, setCommunityAppMounts] = useState<CommunityMountedApp[]>([]);
  const [isLoadingCommunityAppMounts, setIsLoadingCommunityAppMounts] = useState(false);
  const [communityAppMountError, setCommunityAppMountError] = useState<string | null>(null);
  const [isConnectingCommunityApp, setIsConnectingCommunityApp] = useState(false);
  const [communityAppMutationError, setCommunityAppMutationError] = useState<string | null>(null);
  const [updatingCommunityAppMountId, setUpdatingCommunityAppMountId] = useState<string | null>(null);
  const [refreshingCommunityAppMountId, setRefreshingCommunityAppMountId] = useState<string | null>(null);
  const [removingCommunityAppMountId, setRemovingCommunityAppMountId] = useState<string | null>(null);
  const communityAppMountsLoadedCommunityIdRef = useRef<string | null>(null);
  const communityAppMountsLoadRequestIdRef = useRef(0);

  const isCurrentCommunitySession = useCallback(
    (usableSession: SessionT, communityId: string) => {
      const latest = argsRef.current;
      return (
        latest.session?.user.id === usableSession.user.id &&
        latest.activeCommunityId === communityId
      );
    },
    [],
  );

  const clearCommunityAppMounts = useCallback(() => {
    communityAppMountsLoadRequestIdRef.current += 1;
    setCommunityAppMounts([]);
    setIsLoadingCommunityAppMounts(false);
    setCommunityAppMountError(null);
    setCommunityAppMutationError(null);
    setUpdatingCommunityAppMountId(null);
    setRefreshingCommunityAppMountId(null);
    setRemovingCommunityAppMountId(null);
    communityAppMountsLoadedCommunityIdRef.current = null;
  }, []);

  const loadCommunityAppMounts = useCallback(async (communityId: string, session: SessionT) => {
    const requestId = communityAppMountsLoadRequestIdRef.current + 1;
    communityAppMountsLoadRequestIdRef.current = requestId;
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) {
      if (communityAppMountsLoadRequestIdRef.current === requestId) {
        setIsLoadingCommunityAppMounts(false);
      }
      return;
    }
    const loadedCommunityId = communityId;
    const loadedUserId = usableSession.user.id;
    const isCurrentRequest = () => {
      if (communityAppMountsLoadRequestIdRef.current !== requestId) return false;
      const latest = argsRef.current;
      if (latest.session?.user.id !== loadedUserId) return false;
      return latest.activeCommunityId === loadedCommunityId;
    };
    setIsLoadingCommunityAppMounts(true);
    setCommunityAppMountError(null);
    try {
      const rows = await listCloudCommunityAppGrants({
        session: usableSession,
        communityId: loadedCommunityId,
      });
      if (!isCurrentRequest()) return;
      setCommunityAppMounts(rows);
      communityAppMountsLoadedCommunityIdRef.current = loadedCommunityId;
    } catch (error) {
      if (!isCurrentRequest()) return;
      setCommunityAppMountError(toErrorMessage(error, "Failed to load community apps."));
      communityAppMountsLoadedCommunityIdRef.current = loadedCommunityId;
    } finally {
      if (communityAppMountsLoadRequestIdRef.current === requestId) {
        setIsLoadingCommunityAppMounts(false);
      }
    }
  }, []);

  const connectCommunityApp = useCallback(async (input: ConnectCommunityAppInput): Promise<boolean> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!usableSession || !communityId) return false;
    setIsConnectingCommunityApp(true);
    setCommunityAppMutationError(null);
    try {
      const mounted = await recommendCloudCommunityApp({
        session: usableSession,
        communityId,
        input,
      });
      if (!mounted) return false;
      if (!isCurrentCommunitySession(usableSession, communityId)) return true;
      setCommunityAppMounts((prev) => {
        const next = prev.filter((entry) => entry.id !== mounted.id);
        next.unshift(mounted);
        return next;
      });
      return true;
    } catch (error) {
      if (isCurrentCommunitySession(usableSession, communityId)) {
        setCommunityAppMutationError(toErrorMessage(error, "Failed to connect app."));
      }
      return false;
    } finally {
      setIsConnectingCommunityApp(false);
    }
  }, [isCurrentCommunitySession]);

  const updateCommunityAppMount = useCallback(
    async (communityAppMountId: string, patch: {
      enabled?: boolean;
      enabledTools?: string[];
    }): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(current.session, current.ensureSession);
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setUpdatingCommunityAppMountId(communityAppMountId);
      setCommunityAppMutationError(null);
      try {
        const mounted = await updateCloudCommunityAppGrant({
          session: usableSession,
          communityId,
          communityAppMountId,
          enabled: patch.enabled,
          enabledTools: patch.enabledTools,
        });
        if (!mounted) return false;
        if (!isCurrentCommunitySession(usableSession, communityId)) return true;
        setCommunityAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        if (isCurrentCommunitySession(usableSession, communityId)) {
          setCommunityAppMutationError(toErrorMessage(error, "Failed to update app mount."));
        }
        return false;
      } finally {
        setUpdatingCommunityAppMountId(null);
      }
    },
    [isCurrentCommunitySession],
  );

  const refreshCommunityApp = useCallback(async (communityAppMountId: string): Promise<boolean> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!usableSession || !communityId) return false;
    setRefreshingCommunityAppMountId(communityAppMountId);
    setCommunityAppMutationError(null);
    try {
      const mounted = await refreshCloudCommunityAppGrant({
        session: usableSession,
        communityId,
        communityAppMountId,
      });
      if (!mounted) return false;
      if (!isCurrentCommunitySession(usableSession, communityId)) return true;
      setCommunityAppMounts((prev) =>
        prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
      );
      return true;
    } catch (error) {
      if (isCurrentCommunitySession(usableSession, communityId)) {
        setCommunityAppMutationError(toErrorMessage(error, "Failed to refresh app."));
      }
      return false;
    } finally {
      setRefreshingCommunityAppMountId(null);
    }
  }, [isCurrentCommunitySession]);

  const unmountCommunityApp = useCallback(async (communityAppMountId: string): Promise<boolean> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!usableSession || !communityId) return false;
    setRemovingCommunityAppMountId(communityAppMountId);
    setCommunityAppMutationError(null);
    try {
      const removed = await removeCloudCommunityAppGrant({
        session: usableSession,
        communityId,
        communityAppMountId,
      });
      if (!removed) return false;
      if (!isCurrentCommunitySession(usableSession, communityId)) return true;
      setCommunityAppMounts((prev) => prev.filter((entry) => entry.id !== communityAppMountId));
      return true;
    } catch (error) {
      if (isCurrentCommunitySession(usableSession, communityId)) {
        setCommunityAppMutationError(toErrorMessage(error, "Failed to remove app."));
      }
      return false;
    } finally {
      setRemovingCommunityAppMountId(null);
    }
  }, [isCurrentCommunitySession]);

  return {
    communityAppMounts,
    setCommunityAppMounts,
    isLoadingCommunityAppMounts,
    communityAppMountError,
    isConnectingCommunityApp,
    communityAppMutationError,
    updatingCommunityAppMountId,
    refreshingCommunityAppMountId,
    removingCommunityAppMountId,
    communityAppMountsLoadedCommunityIdRef,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    connectCommunityApp,
    updateCommunityAppMount,
    refreshCommunityApp,
    unmountCommunityApp,
  };
}
