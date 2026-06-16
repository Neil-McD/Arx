import { useCallback, useRef, useState } from "react";

import type {
  AddPrivateCommunityMcpAppResult,
  ConnectCommunityAppInput,
  CommunityMountedApp,
  PrivateCommunityMcpOption,
  SetupImportedCommunityMcpAppInput,
} from "../../../../shared/communityAppMountTypes";
import {
  addCloudPrivateCommunityMcpApp,
  connectCloudCommunityApp,
  listCloudCommunityAppMounts,
  listCloudPrivateCommunityMcpOptions,
  refreshCloudCommunityApp,
  setupCloudImportedCommunityMcpApp,
  unmountCloudCommunityApp,
  updateCloudCommunityAppMount,
} from "../../../../shared/cloudCommunityAppMountGateway";
import { resolveUsableSession, type EnsureSessionFn } from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebCommunityAppsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebCommunityAppsController<SessionT extends SessionLike>(
  args: UseWebCommunityAppsControllerArgs<SessionT>,
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
  const [privateCommunityMcpOptions, setPrivateCommunityMcpOptions] = useState<PrivateCommunityMcpOption[]>([]);
  const [isLoadingPrivateCommunityMcpOptions, setIsLoadingPrivateCommunityMcpOptions] = useState(false);
  const [privateCommunityMcpOptionsError, setPrivateCommunityMcpOptionsError] = useState<string | null>(null);
  const [addingPrivateCommunityMcpRegistryId, setAddingPrivateCommunityMcpRegistryId] = useState<string | null>(null);
  const communityAppMountsLoadedCommunityIdRef = useRef<string | null>(null);
  const communityAppMountsLoadRequestIdRef = useRef(0);
  const privateCommunityMcpOptionsLoadedCommunityIdRef = useRef<string | null>(null);
  const privateCommunityMcpOptionsLoadRequestIdRef = useRef(0);

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
    privateCommunityMcpOptionsLoadRequestIdRef.current += 1;
    setCommunityAppMounts([]);
    setIsLoadingCommunityAppMounts(false);
    setCommunityAppMountError(null);
    setCommunityAppMutationError(null);
    setUpdatingCommunityAppMountId(null);
    setRefreshingCommunityAppMountId(null);
    setRemovingCommunityAppMountId(null);
    setPrivateCommunityMcpOptions([]);
    setIsLoadingPrivateCommunityMcpOptions(false);
    setPrivateCommunityMcpOptionsError(null);
    setAddingPrivateCommunityMcpRegistryId(null);
    communityAppMountsLoadedCommunityIdRef.current = null;
    privateCommunityMcpOptionsLoadedCommunityIdRef.current = null;
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
      const rows = await listCloudCommunityAppMounts({
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
      const mounted = await connectCloudCommunityApp({
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

  const loadPrivateCommunityMcpOptions = useCallback(async (): Promise<boolean> => {
    const requestId = privateCommunityMcpOptionsLoadRequestIdRef.current + 1;
    privateCommunityMcpOptionsLoadRequestIdRef.current = requestId;
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!usableSession || !communityId) {
      if (privateCommunityMcpOptionsLoadRequestIdRef.current === requestId) {
        setIsLoadingPrivateCommunityMcpOptions(false);
      }
      return false;
    }
    const loadedUserId = usableSession.user.id;
    const loadedCommunityId = communityId;
    const isCurrentRequest = () => {
      if (privateCommunityMcpOptionsLoadRequestIdRef.current !== requestId) return false;
      const latest = argsRef.current;
      if (latest.session?.user.id !== loadedUserId) return false;
      return latest.activeCommunityId === loadedCommunityId;
    };
    setIsLoadingPrivateCommunityMcpOptions(true);
    setPrivateCommunityMcpOptionsError(null);
    if (privateCommunityMcpOptionsLoadedCommunityIdRef.current !== loadedCommunityId) {
      setPrivateCommunityMcpOptions([]);
    }
    try {
      const rows = await listCloudPrivateCommunityMcpOptions({
        session: usableSession,
        communityId: loadedCommunityId,
      });
      if (!isCurrentRequest()) return true;
      setPrivateCommunityMcpOptions(rows);
      privateCommunityMcpOptionsLoadedCommunityIdRef.current = loadedCommunityId;
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      setPrivateCommunityMcpOptionsError(
        toErrorMessage(error, "Failed to load reviewed MCP options."),
      );
      privateCommunityMcpOptionsLoadedCommunityIdRef.current = loadedCommunityId;
      return false;
    } finally {
      if (privateCommunityMcpOptionsLoadRequestIdRef.current === requestId) {
        setIsLoadingPrivateCommunityMcpOptions(false);
      }
    }
  }, []);

  const addPrivateCommunityMcpApp = useCallback(
    async (mcpRegistryId: string): Promise<AddPrivateCommunityMcpAppResult | null> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(current.session, current.ensureSession);
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return null;
      setAddingPrivateCommunityMcpRegistryId(mcpRegistryId);
      setCommunityAppMutationError(null);
      try {
        const result = await addCloudPrivateCommunityMcpApp({
          session: usableSession,
          communityId,
          mcpRegistryId,
        });
        if (!isCurrentCommunitySession(usableSession, communityId)) return result;
        if (!result.ok) {
          setCommunityAppMutationError(
            result.error_message ?? `Failed to add ${result.name ?? "MCP"}.`,
          );
          return result;
        }
        try {
          const rows = await listCloudCommunityAppMounts({
            session: usableSession,
            communityId,
          });
          if (isCurrentCommunitySession(usableSession, communityId)) {
            setCommunityAppMounts(rows);
            communityAppMountsLoadedCommunityIdRef.current = communityId;
          }
        } catch {
          if (isCurrentCommunitySession(usableSession, communityId)) {
            communityAppMountsLoadedCommunityIdRef.current = null;
            setCommunityAppMutationError(
              "Added, but couldn't refresh the community app list. Refresh to see latest state.",
            );
          }
        }
        return result;
      } catch (error) {
        if (isCurrentCommunitySession(usableSession, communityId)) {
          setCommunityAppMutationError(
            toErrorMessage(error, "Failed to add reviewed MCP."),
          );
        }
        return null;
      } finally {
        setAddingPrivateCommunityMcpRegistryId(null);
      }
    },
    [isCurrentCommunitySession],
  );

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
      const mounted = await refreshCloudCommunityApp({
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

  const setupImportedCommunityMcpApp = useCallback(
    async (input: SetupImportedCommunityMcpAppInput): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(current.session, current.ensureSession);
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setRefreshingCommunityAppMountId(input.community_app_mount_id);
      setCommunityAppMutationError(null);
      try {
        const mounted = await setupCloudImportedCommunityMcpApp({
          session: usableSession,
          communityId,
          input,
        });
        if (!mounted) return false;
        if (!isCurrentCommunitySession(usableSession, communityId)) return true;
        setCommunityAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        if (isCurrentCommunitySession(usableSession, communityId)) {
          setCommunityAppMutationError(
            toErrorMessage(error, "Failed to set up imported MCP app."),
          );
        }
        return false;
      } finally {
        setRefreshingCommunityAppMountId(null);
      }
    },
    [isCurrentCommunitySession],
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

  const hasLoadedPrivateCommunityMcpOptionsForActiveCommunity =
    Boolean(args.activeCommunityId) &&
    privateCommunityMcpOptionsLoadedCommunityIdRef.current === args.activeCommunityId;

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
    privateCommunityMcpOptions,
    isLoadingPrivateCommunityMcpOptions,
    privateCommunityMcpOptionsError,
    addingPrivateCommunityMcpRegistryId,
    hasLoadedPrivateCommunityMcpOptionsForActiveCommunity,
    communityAppMountsLoadedCommunityIdRef,
    privateCommunityMcpOptionsLoadedCommunityIdRef,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    connectCommunityApp,
    loadPrivateCommunityMcpOptions,
    addPrivateCommunityMcpApp,
    updateCommunityAppMount,
    refreshCommunityApp,
    setupImportedCommunityMcpApp,
    unmountCommunityApp,
  };
}
