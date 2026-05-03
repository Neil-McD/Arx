import { useCallback, useRef, useState } from "react";

import { listCloudHarnessMounts } from "../../../../shared/cloudHarnessMountGateway";
import {
  resolveUsableSession,
  type EnsureSessionFn,
} from "../../../../shared/ensureUsableSession";
import type { HarnessMount } from "../../../../shared/harnessMountTypes";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebHarnessMountsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebHarnessMountsController<SessionT extends SessionLike>(
  args: UseWebHarnessMountsControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [harnessMounts, setHarnessMounts] = useState<HarnessMount[]>([]);
  const [isLoadingHarnessMounts, setIsLoadingHarnessMounts] = useState(false);
  const [harnessMountError, setHarnessMountError] = useState<string | null>(null);
  const harnessMountsLoadedKeyRef = useRef<string | null>(null);
  const harnessMountsLoadRequestIdRef = useRef(0);

  const clearHarnessMounts = useCallback(() => {
    harnessMountsLoadRequestIdRef.current += 1;
    setHarnessMounts([]);
    setIsLoadingHarnessMounts(false);
    setHarnessMountError(null);
    harnessMountsLoadedKeyRef.current = null;
  }, []);

  const loadHarnessMounts = useCallback(async (session: SessionT) => {
    const requestId = harnessMountsLoadRequestIdRef.current + 1;
    harnessMountsLoadRequestIdRef.current = requestId;
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(
      session,
      current.ensureSession,
    );
    if (!usableSession) {
      if (harnessMountsLoadRequestIdRef.current === requestId) {
        setIsLoadingHarnessMounts(false);
      }
      return;
    }
    const loadedKey = `${usableSession.user.id}:${
      current.activeCommunityId ?? "personal"
    }`;
    const isCurrentRequest = () => {
      if (harnessMountsLoadRequestIdRef.current !== requestId) return false;
      const latest = argsRef.current;
      if (latest.session?.user.id !== usableSession.user.id) return false;
      const latestKey = `${usableSession.user.id}:${
        latest.activeCommunityId ?? "personal"
      }`;
      return latestKey === loadedKey;
    };
    setIsLoadingHarnessMounts(true);
    setHarnessMountError(null);
    try {
      const rows = await listCloudHarnessMounts({
        session: usableSession,
        communityId: current.activeCommunityId,
      });
      if (!isCurrentRequest()) return;
      setHarnessMounts(rows);
      harnessMountsLoadedKeyRef.current = loadedKey;
    } catch (error) {
      if (!isCurrentRequest()) return;
      setHarnessMountError(
        toErrorMessage(error, "Failed to load harness apps."),
      );
      harnessMountsLoadedKeyRef.current = loadedKey;
    } finally {
      if (harnessMountsLoadRequestIdRef.current === requestId) {
        setIsLoadingHarnessMounts(false);
      }
    }
  }, []);

  return {
    harnessMounts,
    setHarnessMounts,
    isLoadingHarnessMounts,
    harnessMountError,
    harnessMountsLoadedKeyRef,
    clearHarnessMounts,
    loadHarnessMounts,
  };
}
