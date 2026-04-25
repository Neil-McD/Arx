import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CommunityTypingPresenceBundle,
  CommunityTypingPresenceUser,
} from "./communityTypes";
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
const EMPTY_TYPING_PRESENCE: CommunityTypingPresenceBundle = {
  users: [],
  total_count: 0,
};

function normalizeTypingPresencePayload(payload: unknown): CommunityTypingPresenceBundle {
  if (Array.isArray(payload)) {
    const users = payload as CommunityTypingPresenceUser[];
    return {
      users,
      total_count: users.length,
    };
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const users = Array.isArray(record.users) ? (record.users as CommunityTypingPresenceUser[]) : [];
    const totalCount = Math.max(0, Math.floor(Number(record.total_count ?? users.length)));
    return {
      users,
      total_count: Math.max(users.length, totalCount),
    };
  }
  return EMPTY_TYPING_PRESENCE;
}

export function useCommunityTypingPresence<SessionT extends SessionLike>(
  args: UseCommunityTypingPresenceArgs<SessionT>,
): CommunityTypingPresenceBundle {
  const argsRef = useRef(args);
  argsRef.current = args;
  const liveClientRef = useRef<CloudCommunityChatLiveClient | null>(null);
  const lastSentAtRef = useRef(0);
  const [presence, setPresence] = useState<CommunityTypingPresenceBundle>(EMPTY_TYPING_PRESENCE);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!args.isEnabled || !args.session || !args.activeCommunityId) {
      liveClientRef.current?.close();
      liveClientRef.current = null;
      setPresence(EMPTY_TYPING_PRESENCE);
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
        dispose = subscribeCloudCommunityTyping<CommunityTypingPresenceBundle>({
          liveClient,
          communityId: args.activeCommunityId!,
          onUpdate: (nextPresence) => {
            if (cancelled) return;
            setPresence(normalizeTypingPresencePayload(nextPresence));
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
      setPresence(EMPTY_TYPING_PRESENCE);
    };
  }, [args.activeCommunityId, args.ensureSession, args.isEnabled, args.session]);

  useEffect(() => {
    if (presence.users.length === 0) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [presence.users.length]);

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
    () => {
      const users = presence.users.filter(
        (row) => Number.isFinite(row.display_until_ms) && row.display_until_ms > nowMs,
      );
      if (users.length === 0) return EMPTY_TYPING_PRESENCE;
      return {
        users,
        total_count: Math.max(users.length, presence.total_count),
      };
    },
    [nowMs, presence],
  );
}
