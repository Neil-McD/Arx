import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DirectMessageTypingPresenceBundle,
  DirectMessageTypingPresenceUser,
} from "./communityTypes";
import {
  createCloudDirectMessagesLiveClient,
  setCloudDirectTyping,
  subscribeCloudDirectTyping,
  type CloudDirectMessagesLiveClient,
} from "./cloudDirectMessagesGateway";

type SessionLike = {
  access_token?: string;
  user?: { id?: string };
};

type UseDirectMessageTypingPresenceArgs<SessionT extends SessionLike> = {
  isEnabled: boolean;
  session: SessionT | null;
  ensureSession?: (session?: SessionT | null, source?: string) => Promise<SessionT | null>;
  conversationId: string | null;
  canSendMessages: boolean;
  inputValue: string;
  throttleMs?: number;
};

const DEFAULT_TYPING_THROTTLE_MS = 2000;
const EMPTY_TYPING_PRESENCE: DirectMessageTypingPresenceBundle = {
  users: [],
  total_count: 0,
};

function normalizeTypingPresencePayload(payload: unknown): DirectMessageTypingPresenceBundle {
  if (Array.isArray(payload)) {
    const users = payload as DirectMessageTypingPresenceUser[];
    return {
      users,
      total_count: users.length,
    };
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const users = Array.isArray(record.users) ? (record.users as DirectMessageTypingPresenceUser[]) : [];
    const totalCount = Math.max(0, Math.floor(Number(record.total_count ?? users.length)));
    return {
      users,
      total_count: Math.max(users.length, totalCount),
    };
  }
  return EMPTY_TYPING_PRESENCE;
}

export function useDirectMessageTypingPresence<SessionT extends SessionLike>(
  args: UseDirectMessageTypingPresenceArgs<SessionT>,
): DirectMessageTypingPresenceBundle {
  const argsRef = useRef(args);
  argsRef.current = args;
  const liveClientRef = useRef<CloudDirectMessagesLiveClient | null>(null);
  const lastSentAtRef = useRef(0);
  const [presence, setPresence] = useState<DirectMessageTypingPresenceBundle>(EMPTY_TYPING_PRESENCE);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!args.isEnabled || !args.session || !args.conversationId) {
      liveClientRef.current?.close();
      liveClientRef.current = null;
      setPresence(EMPTY_TYPING_PRESENCE);
      return;
    }

    let isDisposed = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      try {
        const usableSession = args.ensureSession
          ? await args.ensureSession(args.session, "direct_messages_typing_presence")
          : args.session;
        if (isDisposed || !usableSession || !args.conversationId) return;
        const liveClient = createCloudDirectMessagesLiveClient({
          session: usableSession,
          ensureSession: args.ensureSession,
        });
        if (isDisposed) {
          liveClient.close();
          return;
        }
        liveClientRef.current?.close();
        liveClientRef.current = liveClient;
        unsubscribe = subscribeCloudDirectTyping<DirectMessageTypingPresenceBundle>({
          liveClient,
          conversationId: args.conversationId,
          onUpdate: (nextPresence) => {
            if (isDisposed) return;
            setPresence(normalizeTypingPresencePayload(nextPresence));
            setNowMs(Date.now());
          },
        });
      } catch {
        // Typing presence is opportunistic; message loading and sending remain authoritative.
      }
    })();

    return () => {
      isDisposed = true;
      unsubscribe?.();
      liveClientRef.current?.close();
      liveClientRef.current = null;
      setPresence(EMPTY_TYPING_PRESENCE);
    };
  }, [args.conversationId, args.ensureSession, args.isEnabled, args.session]);

  useEffect(() => {
    if (presence.users.length === 0) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [presence.users.length]);

  useEffect(() => {
    lastSentAtRef.current = 0;
  }, [args.conversationId]);

  useEffect(() => {
    if (
      !args.isEnabled ||
      !args.session ||
      !args.conversationId ||
      !args.canSendMessages ||
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
        if (!latestArgs.session || !latestArgs.conversationId) return;
        const usableSession = latestArgs.ensureSession
          ? await latestArgs.ensureSession(latestArgs.session, "direct_messages_typing_write")
          : latestArgs.session;
        if (!usableSession) return;
        await setCloudDirectTyping({
          session: usableSession,
          conversationId: latestArgs.conversationId,
        });
      } catch {
        // Soft failure: the typed message itself is still sent through the DM mutation path.
      }
    })();
  }, [
    args.canSendMessages,
    args.conversationId,
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
