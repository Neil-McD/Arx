import { useCallback, useRef, useState } from "react";

import type {
  ConnectUserPlatformAppResult,
  ConnectUserPlatformAppInput,
  UserPlatformMountedApp,
} from "../../../../shared/userPlatformAppMountTypes";
import {
  connectCloudUserPlatformApp,
  listCloudUserPlatformAppMounts,
  reconnectCloudUserPlatformApp,
  refreshCloudUserPlatformApp,
  unmountCloudUserPlatformApp,
  updateCloudUserPlatformAppMount,
} from "../../../../shared/cloudUserPlatformAppMountGateway";
import {
  resolveUsableSession,
  type EnsureSessionFn,
} from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebUserPlatformAppMountsControllerArgs<SessionT extends SessionLike> = {
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebUserPlatformAppMountsController<
  SessionT extends SessionLike,
>(args: UseWebUserPlatformAppMountsControllerArgs<SessionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [userPlatformAppMounts, setUserPlatformAppMounts] = useState<
    UserPlatformMountedApp[]
  >([]);
  const [isLoadingUserPlatformAppMounts, setIsLoadingUserPlatformAppMounts] =
    useState(false);
  const [userPlatformAppMountError, setUserPlatformAppMountError] = useState<
    string | null
  >(null);
  const [isConnectingUserPlatformApp, setIsConnectingUserPlatformApp] =
    useState(false);
  const [userPlatformAppMutationError, setUserPlatformAppMutationError] =
    useState<string | null>(null);
  const [updatingUserPlatformAppMountId, setUpdatingUserPlatformAppMountId] =
    useState<string | null>(null);
  const [refreshingUserPlatformAppMountId, setRefreshingUserPlatformAppMountId] =
    useState<string | null>(null);
  const [reconnectingUserPlatformAppMountId, setReconnectingUserPlatformAppMountId] =
    useState<string | null>(null);
  const [removingUserPlatformAppMountId, setRemovingUserPlatformAppMountId] =
    useState<string | null>(null);
  const userPlatformAppMountsLoadedUserIdRef = useRef<string | null>(null);

  const clearUserPlatformAppMounts = useCallback(() => {
    setUserPlatformAppMounts([]);
    setUserPlatformAppMountError(null);
    setUserPlatformAppMutationError(null);
    userPlatformAppMountsLoadedUserIdRef.current = null;
  }, []);

  const loadUserPlatformAppMounts = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(
      session,
      current.ensureSession,
    );
    if (!usableSession) return;
    setIsLoadingUserPlatformAppMounts(true);
    setUserPlatformAppMountError(null);
    try {
      const rows = await listCloudUserPlatformAppMounts({
        session: usableSession,
      });
      setUserPlatformAppMounts(rows);
      userPlatformAppMountsLoadedUserIdRef.current = usableSession.user.id;
    } catch (error) {
      setUserPlatformAppMountError(
        toErrorMessage(error, "Failed to load your apps."),
      );
      userPlatformAppMountsLoadedUserIdRef.current = usableSession.user.id;
    } finally {
      setIsLoadingUserPlatformAppMounts(false);
    }
  }, []);

  const connectUserPlatformApp = useCallback(
    async (input: ConnectUserPlatformAppInput): Promise<ConnectUserPlatformAppResult> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) {
        return {
          ok: false,
          mount: null,
          validation_report: null,
          error_message: null,
        };
      }
      setIsConnectingUserPlatformApp(true);
      setUserPlatformAppMutationError(null);
      try {
        const result = await connectCloudUserPlatformApp({
          session: usableSession,
          input,
        });
        if (result.mount) {
          setUserPlatformAppMounts((prev) => {
            const next = prev.filter((entry) => entry.id !== result.mount?.id);
            next.unshift(result.mount as UserPlatformMountedApp);
            return next;
          });
        }
        if (!result.ok && result.error_message && !result.validation_report) {
          setUserPlatformAppMutationError(result.error_message);
        }
        return result;
      } catch (error) {
        const message = toErrorMessage(error, "Failed to connect app.");
        setUserPlatformAppMutationError(message);
        return {
          ok: false,
          mount: null,
          validation_report: null,
          error_message: message,
        };
      } finally {
        setIsConnectingUserPlatformApp(false);
      }
    },
    [],
  );

  const updateUserPlatformAppMount = useCallback(
    async (
      userPlatformAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setUpdatingUserPlatformAppMountId(userPlatformAppMountId);
      setUserPlatformAppMutationError(null);
      try {
        const mounted = await updateCloudUserPlatformAppMount({
          session: usableSession,
          userPlatformAppMountId,
          enabled: patch.enabled,
          enabledTools: patch.enabledTools,
        });
        if (!mounted) return false;
        setUserPlatformAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        setUserPlatformAppMutationError(
          toErrorMessage(error, "Failed to update app."),
        );
        return false;
      } finally {
        setUpdatingUserPlatformAppMountId(null);
      }
    },
    [],
  );

  const refreshUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setRefreshingUserPlatformAppMountId(userPlatformAppMountId);
      setUserPlatformAppMutationError(null);
      try {
        const mounted = await refreshCloudUserPlatformApp({
          session: usableSession,
          userPlatformAppMountId,
        });
        if (!mounted) return false;
        setUserPlatformAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        setUserPlatformAppMutationError(
          toErrorMessage(error, "Failed to refresh app."),
        );
        return false;
      } finally {
        setRefreshingUserPlatformAppMountId(null);
      }
    },
    [],
  );

  const reconnectUserPlatformApp = useCallback(
    async (
      userPlatformAppMountId: string,
      secret: string,
    ): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setReconnectingUserPlatformAppMountId(userPlatformAppMountId);
      setUserPlatformAppMutationError(null);
      try {
        const mounted = await reconnectCloudUserPlatformApp({
          session: usableSession,
          userPlatformAppMountId,
          secret,
        });
        if (!mounted) return false;
        setUserPlatformAppMounts((prev) =>
          prev.map((entry) => (entry.id === mounted.id ? mounted : entry)),
        );
        return true;
      } catch (error) {
        setUserPlatformAppMutationError(
          toErrorMessage(error, "Failed to reconnect app."),
        );
        return false;
      } finally {
        setReconnectingUserPlatformAppMountId(null);
      }
    },
    [],
  );

  const unmountUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setRemovingUserPlatformAppMountId(userPlatformAppMountId);
      setUserPlatformAppMutationError(null);
      try {
        const removed = await unmountCloudUserPlatformApp({
          session: usableSession,
          userPlatformAppMountId,
        });
        if (!removed) return false;
        setUserPlatformAppMounts((prev) =>
          prev.filter((entry) => entry.id !== userPlatformAppMountId),
        );
        return true;
      } catch (error) {
        setUserPlatformAppMutationError(
          toErrorMessage(error, "Failed to remove app."),
        );
        return false;
      } finally {
        setRemovingUserPlatformAppMountId(null);
      }
    },
    [],
  );

  return {
    userPlatformAppMounts,
    setUserPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    isConnectingUserPlatformApp,
    userPlatformAppMutationError,
    updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId,
    reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId,
    userPlatformAppMountsLoadedUserIdRef,
    clearUserPlatformAppMounts,
    loadUserPlatformAppMounts,
    connectUserPlatformApp,
    updateUserPlatformAppMount,
    refreshUserPlatformApp,
    reconnectUserPlatformApp,
    unmountUserPlatformApp,
  };
}
