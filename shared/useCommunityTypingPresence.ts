import { useEffect, useMemo, useRef, useState } from "react";

import type { CommunityTypingPresenceUser } from "./communityTypes";
import {
  createCloudCommunityChatLiveClient,
  setCloudCommunityTyping,
  subscribeCloudCommunityTyping,
  type CloudCommunityChatLiveClient,
} from "./cloudCommunityChatGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type SessionLike = {
  access_token: string;
  user: { id: string };
};

type UseCommunityTypingPresenceArgs<SessionT extends SessionLike> = {
  isEnabled: boolean;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  activeCommunityId: string | null;
  canPostMessages: boolean;
  inputValue: string;
  throttleMs?: number;
};

const DEFAULT_TYPING_THROTTLE_MS = 2000;

export function useCommunityTypingPresence<SessionT extends SessionLike>(
  args: UseCommunityTypingPresenceArgs<SessionT>,
): CommunityTypingPresenceUser[] {
  const argsRef = useRef(args);
  argsRef.current = args;
  const liveClientRef = useRef<CloudCommunityChatLiveClient | null>(null);
  const lastSentAtRef = useRef(0);
  const [rows, setRows] = useState<CommunityTypingPresenceUser[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!args.isEnabled || !args.session || !args.activeCommunityId) {
      liveClientRef.current?.close();
      liveClientRef.current = null;
      setRows([]);
      return;
    }

    let cancelled = false;
    let dispose: (() => void) | null = null;

    const subscribe = async () => {
      try {
        const latestArgs = argsRef.current;
        const usableSession = await resolveUsableSession(args.session, latestArgs.ensureSession);
        if (!usableSession || cancelled) return;
        const liveClient = createCloudCommunityChatLiveClient({ session: usableSession });
        liveClientRef.current?.close();
        liveClientRef.current = liveClient;
        dispose = subscribeCloudCommunityTyping<CommunityTypingPresenceUser>({
          liveClient,
          communityId: args.activeCommunityId!,
          onUpdate: (nextRows) => {
            if (cancelled) return;
            setRows(nextRows);
            setNowMs(Date.now());
          },
        });
      } catch {
        // Typing presence is opportunistic; chat loading and sending remain authoritative.
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      dispose?.();
      liveClientRef.current?.close();
      liveClientRef.current = null;
      setRows([]);
    };
  }, [args.activeCommunityId, args.ensureSession, args.isEnabled, args.session]);

  useEffect(() => {
    if (rows.length === 0) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [rows.length]);

  useEffect(() => {
    if (
      !args.isEnabled ||
      !args.session ||
      !args.activeCommunityId ||
      !args.canPostMessages ||
      args.inputValue.trim().length === 0
    ) {
      return;
    }

    const throttleMs = Math.max(500, args.throttleMs ?? DEFAULT_TYPING_THROTTLE_MS);
    const now = Date.now();
    if (now - lastSentAtRef.current < throttleMs) return;
    lastSentAtRef.current = now;

    void (async () => {
      try {
        const latestArgs = argsRef.current;
        const usableSession = await resolveUsableSession(args.session, latestArgs.ensureSession);
        if (!usableSession || !latestArgs.activeCommunityId) return;
        await setCloudCommunityTyping({
          session: usableSession,
          communityId: latestArgs.activeCommunityId,
        });
      } catch {
        // Soft failure: the typed message itself is still sent through the chat mutation path.
      }
    })();
  }, [
    args.activeCommunityId,
    args.canPostMessages,
    args.ensureSession,
    args.inputValue,
    args.isEnabled,
    args.session,
    args.throttleMs,
  ]);

  return useMemo(
    () =>
      rows
        .filter((row) => Number.isFinite(row.display_until_ms) && row.display_until_ms > nowMs),
    [nowMs, rows],
  );
}
