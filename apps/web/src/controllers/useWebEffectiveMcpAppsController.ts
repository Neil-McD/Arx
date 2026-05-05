import { useCallback, useRef, useState } from "react";

import {
  listCloudEffectiveMcpApps,
} from "../../../../shared/cloudEffectiveMcpAppGateway";
import {
  resolveUsableSession,
  type EnsureSessionFn,
} from "../../../../shared/ensureUsableSession";
import type { EffectiveMcpApp } from "../../../../shared/effectiveMcpApps";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebEffectiveMcpAppsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebEffectiveMcpAppsController<SessionT extends SessionLike>(
  args: UseWebEffectiveMcpAppsControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [effectiveMcpApps, setEffectiveMcpApps] = useState<EffectiveMcpApp[]>([]);
  const [isLoadingEffectiveMcpApps, setIsLoadingEffectiveMcpApps] = useState(false);
  const [effectiveMcpAppsError, setEffectiveMcpAppsError] = useState<string | null>(null);
  const effectiveMcpAppsLoadedKeyRef = useRef<string | null>(null);
  const effectiveMcpAppsLoadRequestIdRef = useRef(0);

  const clearEffectiveMcpApps = useCallback(() => {
    effectiveMcpAppsLoadRequestIdRef.current += 1;
    setEffectiveMcpApps([]);
    setIsLoadingEffectiveMcpApps(false);
    setEffectiveMcpAppsError(null);
    effectiveMcpAppsLoadedKeyRef.current = null;
  }, []);

  const loadEffectiveMcpApps = useCallback(async (session: SessionT) => {
    const requestId = effectiveMcpAppsLoadRequestIdRef.current + 1;
    effectiveMcpAppsLoadRequestIdRef.current = requestId;
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(
      session,
      current.ensureSession,
    );
    if (!usableSession) {
      if (effectiveMcpAppsLoadRequestIdRef.current === requestId) {
        setIsLoadingEffectiveMcpApps(false);
      }
      return;
    }
    const loadedKey = `${usableSession.user.id}:${
      current.activeCommunityId ?? "personal"
    }`;
    const isCurrentRequest = () => {
      if (effectiveMcpAppsLoadRequestIdRef.current !== requestId) return false;
      const latest = argsRef.current;
      if (latest.session?.user.id !== usableSession.user.id) return false;
      const latestKey = `${usableSession.user.id}:${
        latest.activeCommunityId ?? "personal"
      }`;
      return latestKey === loadedKey;
    };
    setIsLoadingEffectiveMcpApps(true);
    setEffectiveMcpAppsError(null);
    try {
      const effectiveRows = await listCloudEffectiveMcpApps({
        session: usableSession,
        communityId: current.activeCommunityId,
      });
      if (!isCurrentRequest()) return;
      setEffectiveMcpApps(effectiveRows);
      effectiveMcpAppsLoadedKeyRef.current = loadedKey;
    } catch (error) {
      if (!isCurrentRequest()) return;
      setEffectiveMcpAppsError(
        toErrorMessage(error, "Failed to load MCP app status."),
      );
      effectiveMcpAppsLoadedKeyRef.current = loadedKey;
    } finally {
      if (effectiveMcpAppsLoadRequestIdRef.current === requestId) {
        setIsLoadingEffectiveMcpApps(false);
      }
    }
  }, []);

  return {
    effectiveMcpApps,
    setEffectiveMcpApps,
    isLoadingEffectiveMcpApps,
    effectiveMcpAppsError,
    effectiveMcpAppsLoadedKeyRef,
    clearEffectiveMcpApps,
    loadEffectiveMcpApps,
  };
}
