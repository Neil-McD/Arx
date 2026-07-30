import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CommunityTypingPresenceBundle,
  CommunityTypingPresenceUser,
} from "./communityTypes";
import {
  clearCloudCommunityTyping,
  createCloudCommunityChatLiveClient,
  setCloudCommunityTyping,
  subscribeCloudCommunityTyping,
  type CloudCommunityChatLiveClient,
} from "./cloudCommunityChatGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { TYPING_PRESENCE_RENEW_INTERVAL_MS } from "./typingPresenceContract";

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
};

type CommunityTypingPresenceController = {
  presence: CommunityTypingPresenceBundle;
  signalTyping: (rootId?: string | null) => void;
  clearTyping: (rootId?: string | null) => void;
};

const EMPTY_TYPING_PRESENCE: CommunityTypingPresenceBundle = {
  users: [],
  total_count: 0,
  total_count_capped: false,
};

function normalizeTypingRootId(value?: string | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeTypingPresencePayload(payload: unknown): CommunityTypingPresenceBundle {
  if (Array.isArray(payload)) {
    const users = payload as CommunityTypingPresenceUser[];
    return {
      users,
      total_count: users.length,
      total_count_capped: false,
    };
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const users = Array.isArray(record.users) ? (record.users as CommunityTypingPresenceUser[]) : [];
    const totalCount = Math.max(0, Math.floor(Number(record.total_count ?? users.length)));
    return {
      users,
      total_count: Math.max(users.length, totalCount),
      total_count_capped: Boolean(record.total_count_capped),
    };
  }
  return EMPTY_TYPING_PRESENCE;
}

export function useCommunityTypingPresence<SessionT extends SessionLike>(
  args: UseCommunityTypingPresenceArgs<SessionT>,
): CommunityTypingPresenceController {
  const argsRef = useRef(args);
  argsRef.current = args;
  const liveClientRef = useRef<CloudCommunityChatLiveClient | null>(null);
  const activeScopeRef = useRef<string | null | undefined>(undefined);
  const lastSentAtByScopeRef = useRef(new Map<string, number>());
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
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
    const capturedSession = args.session;
    const capturedEnsureSession = args.ensureSession;
    const capturedCommunityId = args.activeCommunityId;

    const subscribe = async () => {
      try {
        const usableSession = await resolveUsableSession(
          capturedSession,
          capturedEnsureSession,
        );
        if (!usableSession || cancelled) return;
        const liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: capturedEnsureSession,
        });
        liveClientRef.current?.close();
        liveClientRef.current = liveClient;
        dispose = subscribeCloudCommunityTyping<CommunityTypingPresenceBundle>({
          liveClient,
          communityId: capturedCommunityId,
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
      const activeScope = activeScopeRef.current;
      activeScopeRef.current = undefined;
      lastSentAtByScopeRef.current.clear();
      if (activeScope === undefined) return;
      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const usableSession = await resolveUsableSession(
              capturedSession,
              capturedEnsureSession,
            );
            if (!usableSession) return;
            await clearCloudCommunityTyping({
              session: usableSession,
              communityId: capturedCommunityId,
              rootId: activeScope,
            });
          } catch {
            // Lease expiry remains the crash-safe cleanup path.
          }
        });
    };
  }, [args.activeCommunityId, args.ensureSession, args.isEnabled, args.session]);

  useEffect(() => {
    if (presence.users.length === 0) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [presence.users.length]);

  const signalTyping = useCallback((rootId?: string | null) => {
    const latestArgs = argsRef.current;
    if (
      !latestArgs.isEnabled
      || !latestArgs.session
      || !latestArgs.activeCommunityId
      || !latestArgs.canPostMessages
    ) {
      return;
    }
    const scope = normalizeTypingRootId(rootId);
    const scopeKey = scope ?? "channel";
    const now = Date.now();
    const lastSentAt = lastSentAtByScopeRef.current.get(scopeKey) ?? 0;
    if (
      activeScopeRef.current === scope
      && now - lastSentAt < TYPING_PRESENCE_RENEW_INTERVAL_MS
    ) {
      return;
    }
    activeScopeRef.current = scope;
    lastSentAtByScopeRef.current.set(scopeKey, now);
    const communityId = latestArgs.activeCommunityId;
    const session = latestArgs.session;
    const ensureSession = latestArgs.ensureSession;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const usableSession = await resolveUsableSession(session, ensureSession);
          const currentArgs = argsRef.current;
          if (
            !usableSession
            || !currentArgs.isEnabled
            || currentArgs.activeCommunityId !== communityId
            || activeScopeRef.current !== scope
          ) {
            return;
          }
          await setCloudCommunityTyping({
            session: usableSession,
            communityId,
            rootId: scope,
          });
        } catch {
          // Soft failure: the typed message itself is still sent through the chat mutation path.
        }
      });
  }, []);

  const clearTyping = useCallback((rootId?: string | null) => {
    const scope = normalizeTypingRootId(rootId);
    if (activeScopeRef.current !== scope) return;
    activeScopeRef.current = undefined;
    lastSentAtByScopeRef.current.delete(scope ?? "channel");
    const latestArgs = argsRef.current;
    if (!latestArgs.session || !latestArgs.activeCommunityId) return;
    const communityId = latestArgs.activeCommunityId;
    const session = latestArgs.session;
    const ensureSession = latestArgs.ensureSession;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const usableSession = await resolveUsableSession(session, ensureSession);
          if (!usableSession) return;
          await clearCloudCommunityTyping({
            session: usableSession,
            communityId,
            rootId: scope,
          });
        } catch {
          // Lease expiry remains the crash-safe cleanup path.
        }
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
        total_count_capped: Boolean(presence.total_count_capped),
      };
    },
    [nowMs, presence],
  );

  return useMemo(
    () => ({
      presence: activePresence,
      signalTyping,
      clearTyping,
    }),
    [activePresence, clearTyping, signalTyping],
  );
}
