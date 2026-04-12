import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction, } from "react";
import {
  abortAllScopedRequests, beginScopedAbortRequest, finishScopedAbortRequest, isAbortError, } from "./communityFetchAbortScope";

import {
  ensureCloudCommunityChatThread,
  listCloudMessageReactions,
  listCloudThreadMessages,
} from "./cloudCommunityChatGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type CommunityChatRow = {
  id: string;
  thread_id: string;
  seq: number;
  role: string;
  content_json: unknown;
  sender_id: string | null;
  reply_to_id: string | null;
  created_at: string;
};

type UseCommunityChatDataControllerArgs<
  SessionT,
  AttachmentT,
  MessageT extends {
    id: string;
    community_id: string;
    sender_id: string;
    body: string;
    attachments?: AttachmentT[];
    reply_to_id: string | null;
    created_at: string;
    seq: number;
  },
  ReactionT extends {
    id: string;
    message_id: string;
  },
> = {
  extractTextFromContentJson: (contentJson: unknown) => string;
  parseMessageAttachments: (contentJson: unknown) => AttachmentT[];
  pageSize: number;

  setCommunityMessages: Dispatch<SetStateAction<MessageT[]>>;
  setMessageReactions: Dispatch<SetStateAction<ReactionT[]>>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  setIsUserAtBottom: Dispatch<SetStateAction<boolean>>;
  isUserAtBottomRef: MutableRefObject<boolean>;

  capturePrependAnchor: () => void;
  clearPendingPrependAnchor: () => void;

  onLoadChatStart?: () => void;
  onLoadChatError?: (message: string) => void;
  onHydrateProfiles?: (userIds: string[], session: SessionT) => void | Promise<void>;
  ensureSession?: EnsureSessionFn<SessionT>;
};

type LoadOlderStatus = "appended" | "noop" | "error";

function formatCommunityChatLoadError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Failed to load community chat.";
  const normalized = raw.trim().toLowerCase();
  if (
    normalized.includes("community_entitlement_required") ||
    normalized.includes("community_forbidden") ||
    normalized.includes("not_entitled")
  ) {
    return "Join this community to access chat.";
  }
  if (
    normalized.includes("not authenticated") ||
    normalized.includes("authentication") ||
    normalized.includes("user_not_found")
  ) {
    return "Sign in to access community chat.";
  }
  if (normalized.includes("thread_not_found")) {
    return "Community chat is unavailable right now. Try again.";
  }
  return "Failed to load community chat.";
}

export function useCommunityChatDataController<
  SessionT,
  AttachmentT,
  MessageT extends {
    id: string;
    community_id: string;
    sender_id: string;
    body: string;
    attachments?: AttachmentT[];
    reply_to_id: string | null;
    created_at: string;
    seq: number;
  },
  ReactionT extends {
    id: string;
    message_id: string;
  },
>(args: UseCommunityChatDataControllerArgs<SessionT, AttachmentT, MessageT, ReactionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingMoreChat, setIsLoadingMoreChat] = useState(false);
  const [communityChatHasMore, setCommunityChatHasMore] = useState(true);
  const [hasResolvedCommunityChat, setHasResolvedCommunityChat] = useState(false);

  const isLoadingChatRef = useRef(false);
  const isLoadingMoreChatRef = useRef(false);
  const communityChatHasMoreRef = useRef(true);
  const communityChatOldestSeqRef = useRef<number | null>(null);
  const fetchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const ensureThreadInFlightByKeyRef = useRef<Map<string, Promise<string>>>(new Map());
  const ensureThreadCacheByKeyRef = useRef<Map<string, { threadId: string; expiresAt: number }>>(new Map());
  const activeCommunityIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  const COMMUNITY_THREAD_CACHE_TTL_MS = 30_000;

  const setIsLoadingChatTracked = useCallback((value: boolean) => {
    isLoadingChatRef.current = value;
    setIsLoadingChat(value);
  }, []);

  const setIsLoadingMoreChatTracked = useCallback((value: boolean) => {
    isLoadingMoreChatRef.current = value;
    setIsLoadingMoreChat(value);
  }, []);

  const setCommunityChatHasMoreTracked = useCallback((value: boolean) => {
    communityChatHasMoreRef.current = value;
    setCommunityChatHasMore(value);
  }, []);

  const beginCommunityLoadGeneration = useCallback((communityId: string): number => {
    abortAllScopedRequests(fetchAbortControllersRef.current);
    activeCommunityIdRef.current = communityId;
    loadGenerationRef.current += 1;
    return loadGenerationRef.current;
  }, []);

  const isStale = useCallback((communityId: string, generation: number): boolean => {
    return loadGenerationRef.current !== generation || activeCommunityIdRef.current !== communityId;
  }, []);

  const toCommunityChatMessage = useCallback(
    (row: CommunityChatRow): MessageT | null => {
      const threadId = (row.thread_id ?? "").trim();
      if (!threadId) return null;
      const communityId = (activeCommunityIdRef.current ?? "").trim();
      if (!communityId) return null;
      const id = (row.id ?? "").trim();
      if (!id) return null;
      if ((row.role ?? "").trim() !== "user") return null;
      const senderId = (row.sender_id ?? "").trim() || "unknown";
      const body = argsRef.current.extractTextFromContentJson(row.content_json);
      const attachments = argsRef.current.parseMessageAttachments(row.content_json);
      return {
        id,
        community_id: communityId,
        sender_id: senderId,
        body,
        attachments: attachments.length > 0 ? attachments : undefined,
        reply_to_id: row.reply_to_id ?? null,
        created_at: row.created_at,
        seq: Number(row.seq) || 0,
      } as MessageT;
    },
    [],
  );

  const ensureCommunityChatThread = useCallback(
    async (communityId: string, session: SessionT): Promise<string> => {
      const usableSession = await resolveUsableSession(session, argsRef.current.ensureSession);
      if (!usableSession) throw new Error("not_authenticated");
      const normalizedCommunityId = String(communityId ?? "").trim();
      if (!normalizedCommunityId) throw new Error("Missing community id.");
      activeCommunityIdRef.current = normalizedCommunityId;

      const sessionUserId = (
        usableSession as { user?: { id?: unknown } } | null
      )?.user?.id;
      const normalizedUserId = typeof sessionUserId === "string" ? sessionUserId.trim() : "";
      const cacheKey = `${normalizedUserId}::${normalizedCommunityId}`;
      const now = Date.now();

      const cached = ensureThreadCacheByKeyRef.current.get(cacheKey);
      if (cached && cached.expiresAt > now && cached.threadId) {
        return cached.threadId;
      }
      if (cached && cached.expiresAt <= now) {
        ensureThreadCacheByKeyRef.current.delete(cacheKey);
      }

      const inFlight = ensureThreadInFlightByKeyRef.current.get(cacheKey);
      if (inFlight) {
        return await inFlight;
      }

      const request = (async (): Promise<string> => {
        const threadId = await ensureCloudCommunityChatThread({
          session: usableSession,
          communityId: normalizedCommunityId,
        });
        ensureThreadCacheByKeyRef.current.set(cacheKey, {
          threadId,
          expiresAt: Date.now() + COMMUNITY_THREAD_CACHE_TTL_MS,
        });
        return threadId;
      })();

      ensureThreadInFlightByKeyRef.current.set(cacheKey, request);
      try {
        return await request;
      } finally {
        const active = ensureThreadInFlightByKeyRef.current.get(cacheKey);
        if (active === request) {
          ensureThreadInFlightByKeyRef.current.delete(cacheKey);
        }
      }
    },
    [],
  );

  const loadMessageReactions = useCallback(
    async (
      messageIds: string[],
      session: SessionT,
      guard: { communityId: string; generation: number },
    ): Promise<void> => {
      const usableSession = await resolveUsableSession(session, argsRef.current.ensureSession);
      if (!usableSession) return;
      if (messageIds.length === 0) return;
      const reactionsFetchController = beginScopedAbortRequest({
        inFlightByKind: fetchAbortControllersRef.current,
        kind: "community_chat_reactions",
      });
      try {
        const rows = await listCloudMessageReactions<SessionT, ReactionT>({
          session: usableSession,
          messageIds,
          init: { signal: reactionsFetchController.signal },
        });
        if (isStale(guard.communityId, guard.generation)) return;
        argsRef.current.setMessageReactions((prev) => {
          if (prev.length === 0) return rows;
          const byId = new Map<string, ReactionT>();
          for (const reaction of prev) {
            byId.set(reaction.id, reaction);
          }
          for (const reaction of rows) {
            byId.set(reaction.id, reaction);
          }
          return Array.from(byId.values());
        });
      } catch (error) {
        if (isAbortError(error)) return;
        return;
      } finally {
        finishScopedAbortRequest({
          inFlightByKind: fetchAbortControllersRef.current,
          kind: "community_chat_reactions",
          controller: reactionsFetchController,
        });
      }
    },
    [isStale],
  );

  const loadCommunityChat = useCallback(
    async (communityId: string, session: SessionT): Promise<void> => {
      const usableSession = await resolveUsableSession(session, argsRef.current.ensureSession);
      if (!usableSession) {
        argsRef.current.onLoadChatError?.("Sign in to access community chat.");
        return;
      }
      const generation = beginCommunityLoadGeneration(communityId);
      argsRef.current.onLoadChatStart?.();
      setIsLoadingChatTracked(true);
      setIsLoadingMoreChatTracked(false);
      setCommunityChatHasMoreTracked(true);
      communityChatOldestSeqRef.current = null;
      argsRef.current.clearPendingPrependAnchor();

      try {
        const threadId = await ensureCommunityChatThread(communityId, usableSession);
        if (isStale(communityId, generation)) return;

        const messagesFetchController = beginScopedAbortRequest({
          inFlightByKind: fetchAbortControllersRef.current,
          kind: "community_chat_initial",
        });
        try {
          const rowsDesc = await listCloudThreadMessages<SessionT, CommunityChatRow>({
            session: usableSession,
            threadId,
            limit: argsRef.current.pageSize,
            init: { signal: messagesFetchController.signal },
          });
          if (isStale(communityId, generation)) return;

          const mappedDesc = rowsDesc.map(toCommunityChatMessage).filter(Boolean) as MessageT[];
          const hasMore = mappedDesc.length >= argsRef.current.pageSize;
          const rows = [...mappedDesc].reverse();
          const userIds = rows.length > 0
            ? Array.from(new Set(rows.map((row) => row.sender_id)))
            : [];

          if (userIds.length > 0) {
            await argsRef.current.onHydrateProfiles?.(userIds, usableSession);
            if (isStale(communityId, generation)) return;
          }

          setCommunityChatHasMoreTracked(hasMore);
          argsRef.current.setCommunityMessages(rows);
          communityChatOldestSeqRef.current = rows[0]?.seq ?? null;

          argsRef.current.setUnreadCount(0);
          argsRef.current.setIsUserAtBottom(true);
          argsRef.current.isUserAtBottomRef.current = true;

          if (rows.length > 0) {
            const messageIds = rows.map((row) => row.id);
            void loadMessageReactions(messageIds, usableSession, { communityId, generation });
          }
        } catch (error) {
          if (isAbortError(error)) return;
          argsRef.current.onLoadChatError?.(formatCommunityChatLoadError(error));
          return;
        } finally {
          finishScopedAbortRequest({
            inFlightByKind: fetchAbortControllersRef.current,
            kind: "community_chat_initial",
            controller: messagesFetchController,
          });
        }
      } catch (error) {
        argsRef.current.onLoadChatError?.(formatCommunityChatLoadError(error));
        // Keep behavior fail-safe: best-effort fetch paths should not crash the shell.
      } finally {
        if (!isStale(communityId, generation)) {
          setIsLoadingChatTracked(false);
          setHasResolvedCommunityChat(true);
        }
      }
    },
    [
      beginCommunityLoadGeneration,
      ensureCommunityChatThread,
      isStale,
      loadMessageReactions,
      setCommunityChatHasMoreTracked,
      setIsLoadingChatTracked,
      setIsLoadingMoreChatTracked,
    ],
  );

  const loadOlderCommunityChat = useCallback(
    async (communityId: string, session: SessionT): Promise<LoadOlderStatus> => {
      const usableSession = await resolveUsableSession(session, argsRef.current.ensureSession);
      if (!usableSession) return "error";
      if (isLoadingChatRef.current || isLoadingMoreChatRef.current) return "noop";
      if (!communityChatHasMoreRef.current) return "noop";

      const cursor = communityChatOldestSeqRef.current;
      if (!cursor) {
        setCommunityChatHasMoreTracked(false);
        return "noop";
      }

      const generation = loadGenerationRef.current;
      if (activeCommunityIdRef.current !== communityId) return "noop";

      argsRef.current.capturePrependAnchor();
      setIsLoadingMoreChatTracked(true);

      try {
        const threadId = await ensureCommunityChatThread(communityId, usableSession);
        if (isStale(communityId, generation)) return "noop";

        const olderFetchController = beginScopedAbortRequest({
          inFlightByKind: fetchAbortControllersRef.current,
          kind: "community_chat_older",
        });
        try {
          const rowsDesc = await listCloudThreadMessages<SessionT, CommunityChatRow>({
            session: usableSession,
            threadId,
            beforeSeq: cursor,
            limit: argsRef.current.pageSize,
            init: { signal: olderFetchController.signal },
          });
          if (isStale(communityId, generation)) {
            argsRef.current.clearPendingPrependAnchor();
            return "noop";
          }

          const mappedDesc = rowsDesc.map(toCommunityChatMessage).filter(Boolean) as MessageT[];
          if (mappedDesc.length === 0) {
            setCommunityChatHasMoreTracked(false);
            argsRef.current.clearPendingPrependAnchor();
            return "noop";
          }

          const hasMore = mappedDesc.length >= argsRef.current.pageSize;
          const rows = [...mappedDesc].reverse();
          const userIds = Array.from(new Set(rows.map((row) => row.sender_id)));

          if (userIds.length > 0) {
            await argsRef.current.onHydrateProfiles?.(userIds, usableSession);
            if (isStale(communityId, generation)) {
              argsRef.current.clearPendingPrependAnchor();
              return "noop";
            }
          }

          setCommunityChatHasMoreTracked(hasMore);
          communityChatOldestSeqRef.current = rows[0]?.seq ?? cursor;

          let appended = false;
          argsRef.current.setCommunityMessages((prev) => {
            const existing = new Set(prev.map((item) => item.id));
            const unique = rows.filter((item) => !existing.has(item.id));
            if (unique.length === 0) {
              argsRef.current.clearPendingPrependAnchor();
              return prev;
            }
            appended = true;
            return [...unique, ...prev];
          });

          if (!appended) return "noop";

          void loadMessageReactions(rows.map((row) => row.id), usableSession, { communityId, generation });
          return "appended";
        } catch (error) {
          argsRef.current.clearPendingPrependAnchor();
          if (isAbortError(error)) return "noop";
          return "error";
        } finally {
          finishScopedAbortRequest({
            inFlightByKind: fetchAbortControllersRef.current,
            kind: "community_chat_older",
            controller: olderFetchController,
          });
        }
      } catch {
        argsRef.current.clearPendingPrependAnchor();
        return "error";
      } finally {
        if (!isStale(communityId, generation)) {
          setIsLoadingMoreChatTracked(false);
        }
      }
    },
    [
      ensureCommunityChatThread,
      isStale,
      loadMessageReactions,
      setCommunityChatHasMoreTracked,
      setIsLoadingMoreChatTracked,
    ],
  );

  const resetCommunityChatDataState = useCallback(() => {
    abortAllScopedRequests(fetchAbortControllersRef.current);
    loadGenerationRef.current += 1;
    activeCommunityIdRef.current = null;
    communityChatOldestSeqRef.current = null;
    setIsLoadingChatTracked(false);
    setIsLoadingMoreChatTracked(false);
    setCommunityChatHasMoreTracked(true);
    setHasResolvedCommunityChat(false);
  }, [setCommunityChatHasMoreTracked, setIsLoadingChatTracked, setIsLoadingMoreChatTracked]);

  useEffect(() => {
    return () => {
      abortAllScopedRequests(fetchAbortControllersRef.current);
    };
  }, []);

  return {
    isLoadingChat,
    isLoadingMoreChat,
    communityChatHasMore,
    hasResolvedCommunityChat,
    toCommunityChatMessage,
    ensureCommunityChatThread,
    loadCommunityChat,
    loadOlderCommunityChat,
    resetCommunityChatDataState,
  };
}
