import { useCallback, useRef, useState } from "react";

import type { ConnectCommunityAppInput, CommunityMountedApp } from "../../../../shared/communityAppMountTypes";
import {
  connectCloudCommunityApp,
  listCloudCommunityAppMounts,
  reconnectCloudCommunityApp,
  refreshCloudCommunityApp,
  unmountCloudCommunityApp,
  updateCloudCommunityAppMount,
} from "../../../../shared/cloudCommunityAppMountGateway";
import { resolveUsableSession, type EnsureSessionFn } from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebCommunityAppMountsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebCommunityAppMountsController<SessionT extends SessionLike>(
  args: UseWebCommunityAppMountsControllerArgs<SessionT>,
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
  const [reconnectingCommunityAppMountId, setReconnectingCommunityAppMountId] = useState<string | null>(null);
  const [removingCommunityAppMountId, setRemovingCommunityAppMountId] = useState<string | null>(null);
  const communityAppMountsLoadedCommunityIdRef = useRef<string | null>(null);

  const clearCommunityAppMounts = useCallback(() => {
    setCommunityAppMounts([]);
    setCommunityAppMountError(null);
    setCommunityAppMutationError(null);
    communityAppMountsLoadedCommunityIdRef.current = null;
  }, []);

  const loadCommunityAppMounts = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    setIsLoadingCommunityAppMounts(true);
    setCommunityAppMountError(null);
    try {
      const rows = await listCloudCommunityAppMounts({
        session: usableSession,
        communityId,
      });
      setCommunityAppMounts(rows);
      communityAppMountsLoadedCommunityIdRef.current = communityId;
    } catch (error) {
      setCommunityAppMountError(toErrorMessage(error, "Failed to load community apps."));
      communityAppMountsLoadedCommunityIdRef.current = communityId;
    } finally {
      setIsLoadingCommunityAppMounts(false);
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
      const mounted = await connectCloudCommunityApp({
        session: usableSession,
        communityId,
        input,
      });
      if (!mounted) return false;
      setCommunityAppMounts((prev) => {
        const next = prev.filter((entry) => entry.id !== mounted.id);
        next.unshift(mounted);
        return next;
      });
      return true;
    } catch (error) {
      setCommunityAppMutationError(toErrorMessage(error, "Failed to connect app."));
      return false;
    } finally {
      setIsConnectingCommunityApp(false);
    }
  }, []);

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
        const mounted = await updateCloudCommunityAppMount({
          session: usableSession,
          communityId,
          communityAppMountId,
          enabled: patch.enabled,
          enabledTools: patch.enabledTools,
        });
        if (!mounted) return false;
        setCommunityAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        setCommunityAppMutationError(toErrorMessage(error, "Failed to update app mount."));
        return false;
      } finally {
        setUpdatingCommunityAppMountId(null);
      }
    },
    [],
  );

  const refreshCommunityApp = useCallback(async (communityAppMountId: string): Promise<boolean> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!usableSession || !communityId) return false;
    setRefreshingCommunityAppMountId(communityAppMountId);
    setCommunityAppMutationError(null);
    try {
      const mounted = await refreshCloudCommunityApp({
        session: usableSession,
        communityId,
        communityAppMountId,
      });
      if (!mounted) return false;
      setCommunityAppMounts((prev) =>
        prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
      );
      return true;
    } catch (error) {
      setCommunityAppMutationError(toErrorMessage(error, "Failed to refresh app."));
      return false;
    } finally {
      setRefreshingCommunityAppMountId(null);
    }
  }, []);

  const reconnectCommunityApp = useCallback(
    async (communityAppMountId: string, secret: string): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(current.session, current.ensureSession);
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setReconnectingCommunityAppMountId(communityAppMountId);
      setCommunityAppMutationError(null);
      try {
        const mounted = await reconnectCloudCommunityApp({
          session: usableSession,
          communityId,
          communityAppMountId,
          secret,
        });
        if (!mounted) return false;
        setCommunityAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        setCommunityAppMutationError(toErrorMessage(error, "Failed to reconnect app."));
        return false;
      } finally {
        setReconnectingCommunityAppMountId(null);
      }
    },
    [],
  );

  const unmountCommunityApp = useCallback(async (communityAppMountId: string): Promise<boolean> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!usableSession || !communityId) return false;
    setRemovingCommunityAppMountId(communityAppMountId);
    setCommunityAppMutationError(null);
    try {
      const removed = await unmountCloudCommunityApp({
        session: usableSession,
        communityId,
        communityAppMountId,
      });
      if (!removed) return false;
      setCommunityAppMounts((prev) => prev.filter((entry) => entry.id !== communityAppMountId));
      return true;
    } catch (error) {
      setCommunityAppMutationError(toErrorMessage(error, "Failed to remove app."));
      return false;
    } finally {
      setRemovingCommunityAppMountId(null);
    }
  }, []);

  return {
    communityAppMounts,
    setCommunityAppMounts,
    isLoadingCommunityAppMounts,
    communityAppMountError,
    isConnectingCommunityApp,
    communityAppMutationError,
    updatingCommunityAppMountId,
    refreshingCommunityAppMountId,
    reconnectingCommunityAppMountId,
    removingCommunityAppMountId,
    communityAppMountsLoadedCommunityIdRef,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    connectCommunityApp,
    updateCommunityAppMount,
    refreshCommunityApp,
    reconnectCommunityApp,
    unmountCommunityApp,
  };
}
