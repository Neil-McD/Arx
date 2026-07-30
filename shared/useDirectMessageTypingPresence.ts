import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DirectMessageTypingPresenceBundle,
  DirectMessageTypingPresenceUser,
} from "./communityTypes";
import {
  clearCloudDirectTyping,
  createCloudDirectMessagesLiveClient,
  setCloudDirectTyping,
  subscribeCloudDirectTyping,
  type CloudDirectMessagesLiveClient,
} from "./cloudDirectMessagesGateway";
import {
  createDirectMessageTypingWriteCoordinator,
  type DirectMessageTypingWriteCoordinator,
  type DirectMessageTypingWriteScope,
} from "./directMessageTypingWriteCoordinator";
import { TYPING_PRESENCE_RENEW_INTERVAL_MS } from "./typingPresenceContract";

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

type DirectMessageTypingPresenceController = {
  presence: DirectMessageTypingPresenceBundle;
  clearTyping: (conversationId?: string | null) => void;
};

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
): DirectMessageTypingPresenceController {
  const argsRef = useRef(args);
  argsRef.current = args;
  const liveClientRef = useRef<CloudDirectMessagesLiveClient | null>(null);
  const writeCoordinatorRef = useRef<DirectMessageTypingWriteCoordinator<SessionT> | null>(null);
  if (!writeCoordinatorRef.current) {
    writeCoordinatorRef.current = createDirectMessageTypingWriteCoordinator<SessionT>({
      setTyping: setCloudDirectTyping,
      clearTyping: clearCloudDirectTyping,
    });
  }
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
    const capturedSession = args.session;
    const capturedEnsureSession = args.ensureSession;
    const capturedConversationId = args.conversationId;

    void (async () => {
      try {
        const usableSession = capturedEnsureSession
          ? await capturedEnsureSession(capturedSession, "direct_messages_typing_presence")
          : capturedSession;
        if (isDisposed || !usableSession) return;
        const liveClient = createCloudDirectMessagesLiveClient({
          session: usableSession,
          ensureSession: capturedEnsureSession,
        });
        if (isDisposed) {
          liveClient.close();
          return;
        }
        liveClientRef.current?.close();
        liveClientRef.current = liveClient;
        unsubscribe = subscribeCloudDirectTyping<DirectMessageTypingPresenceBundle>({
          liveClient,
          conversationId: capturedConversationId,
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
    if (!args.isEnabled || !args.conversationId) return;
    const capturedConversationId = args.conversationId;
    const capturedSession = args.session;
    const capturedEnsureSession = args.ensureSession;
    return () => {
      const latestArgs = argsRef.current;
      const session = latestArgs.session ?? capturedSession;
      if (!session) return;
      writeCoordinatorRef.current?.clearTyping({
        conversationId: capturedConversationId,
        session,
        ensureSession: latestArgs.ensureSession ?? capturedEnsureSession,
      });
    };
  }, [args.conversationId, args.isEnabled]);

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
      !args.conversationId ||
      !args.canSendMessages ||
      args.inputValue.trim().length === 0
    ) {
      if (args.session && args.conversationId) {
        writeCoordinatorRef.current?.clearTyping({
          conversationId: args.conversationId,
          session: args.session,
          ensureSession: args.ensureSession,
        });
      }
      return;
    }

    const throttleMs = Math.max(
      500,
      args.throttleMs ?? TYPING_PRESENCE_RENEW_INTERVAL_MS,
    );
    const scope: DirectMessageTypingWriteScope<SessionT> = {
      conversationId: args.conversationId,
      session: args.session,
      ensureSession: args.ensureSession,
    };
    writeCoordinatorRef.current?.signalTyping(scope, throttleMs);
  }, [
    args.canSendMessages,
    args.conversationId,
    args.ensureSession,
    args.inputValue,
    args.isEnabled,
    args.session,
    args.throttleMs,
  ]);

  const clearTyping = useCallback((conversationId?: string | null) => {
    const latestArgs = argsRef.current;
    const normalizedConversationId = String(
      conversationId ?? latestArgs.conversationId ?? "",
    ).trim();
    if (!latestArgs.session || !normalizedConversationId) return;
    writeCoordinatorRef.current?.clearTyping({
      conversationId: normalizedConversationId,
      session: latestArgs.session,
      ensureSession: latestArgs.ensureSession,
    });
  }, []);

  const activePresence = useMemo(
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

  return useMemo(
    () => ({
      presence: activePresence,
      clearTyping,
    }),
    [activePresence, clearTyping],
  );
}
