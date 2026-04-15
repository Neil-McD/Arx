import { useCallback, useRef, useState } from "react";

import type {
  ConnectUserPlatformAppInput,
  UserPlatformMountedApp,
} from "../../../../shared/userPlatformAppMountTypes";
import {
  connectCloudUserPlatformApp,
  listCloudUserPlatformAppMounts,
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
    async (input: ConnectUserPlatformAppInput): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setIsConnectingUserPlatformApp(true);
      setUserPlatformAppMutationError(null);
      try {
        const mounted = await connectCloudUserPlatformApp({
          session: usableSession,
          input,
        });
        if (!mounted) return false;
        setUserPlatformAppMounts((prev) => {
          const next = prev.filter((entry) => entry.id !== mounted.id);
          next.unshift(mounted);
          return next;
        });
        return true;
      } catch (error) {
        setUserPlatformAppMutationError(
          toErrorMessage(error, "Failed to connect app."),
        );
        return false;
      } finally {
        setIsConnectingUserPlatformApp(false);
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
    userPlatformAppMountsLoadedUserIdRef,
    clearUserPlatformAppMounts,
    loadUserPlatformAppMounts,
    connectUserPlatformApp,
  };
}
