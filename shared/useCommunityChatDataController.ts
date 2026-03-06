import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction, } from "react";
import {
  abortAllScopedRequests, beginScopedAbortRequest, finishScopedAbortRequest, isAbortError, } from "./communityFetchAbortScope";

import {
  ensureCloudCommunityChatThread,
  listCloudMessageReactions,
  listCloudThreadMessages,
} from "./cloudCommunityChatGateway";

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
  onHydrateProfiles?: (userIds: string[], session: SessionT) => void | Promise<void>;
};

type LoadOlderStatus = "appended" | "noop" | "error";

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
      const id = (row.id ?? "").trim();
      if (!id) return null;
      if ((row.role ?? "").trim() !== "user") return null;
      const senderId = (row.sender_id ?? "").trim() || "unknown";
      const body = argsRef.current.extractTextFromContentJson(row.content_json);
      const attachments = argsRef.current.parseMessageAttachments(row.content_json);
      return {
        id,
        community_id: threadId,
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
      const normalizedCommunityId = String(communityId ?? "").trim();
      if (!normalizedCommunityId) throw new Error("Missing community id.");

      const sessionUserId = (
        session as { user?: { id?: unknown } } | null
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
          session,
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
      if (messageIds.length === 0) return;
      const reactionsFetchController = beginScopedAbortRequest({
        inFlightByKind: fetchAbortControllersRef.current,
        kind: "community_chat_reactions",
      });
      try {
        const rows = await listCloudMessageReactions<SessionT, ReactionT>({
          session,
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
      const generation = beginCommunityLoadGeneration(communityId);
      argsRef.current.onLoadChatStart?.();
      setIsLoadingChatTracked(true);
      setIsLoadingMoreChatTracked(false);
      setCommunityChatHasMoreTracked(true);
      communityChatOldestSeqRef.current = null;
      argsRef.current.clearPendingPrependAnchor();

      try {
        const threadId = await ensureCommunityChatThread(communityId, session);
        if (isStale(communityId, generation)) return;

        const messagesFetchController = beginScopedAbortRequest({
          inFlightByKind: fetchAbortControllersRef.current,
          kind: "community_chat_initial",
        });
        try {
          const rowsDesc = await listCloudThreadMessages<SessionT, CommunityChatRow>({
            session,
            threadId,
            limit: argsRef.current.pageSize,
            init: { signal: messagesFetchController.signal },
          });
          if (isStale(communityId, generation)) return;

          const mappedDesc = rowsDesc.map(toCommunityChatMessage).filter(Boolean) as MessageT[];
          const hasMore = mappedDesc.length >= argsRef.current.pageSize;
          const rows = [...mappedDesc].reverse();

          setCommunityChatHasMoreTracked(hasMore);
          argsRef.current.setCommunityMessages(rows);
          communityChatOldestSeqRef.current = rows[0]?.seq ?? null;

          if (rows.length > 0) {
            const userIds = Array.from(new Set(rows.map((row) => row.sender_id)));
            void argsRef.current.onHydrateProfiles?.(userIds, session);
          }

          argsRef.current.setUnreadCount(0);
          argsRef.current.setIsUserAtBottom(true);
          argsRef.current.isUserAtBottomRef.current = true;

          if (rows.length > 0) {
            const messageIds = rows.map((row) => row.id);
            void loadMessageReactions(messageIds, session, { communityId, generation });
          }
        } catch (error) {
          if (isAbortError(error)) return;
          return;
        } finally {
          finishScopedAbortRequest({
            inFlightByKind: fetchAbortControllersRef.current,
            kind: "community_chat_initial",
            controller: messagesFetchController,
          });
        }
      } catch {
        // Keep behavior fail-safe: best-effort fetch paths should not crash the shell.
      } finally {
        if (!isStale(communityId, generation)) {
          setIsLoadingChatTracked(false);
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
        const threadId = await ensureCommunityChatThread(communityId, session);
        if (isStale(communityId, generation)) return "noop";

        const olderFetchController = beginScopedAbortRequest({
          inFlightByKind: fetchAbortControllersRef.current,
          kind: "community_chat_older",
        });
        try {
          const rowsDesc = await listCloudThreadMessages<SessionT, CommunityChatRow>({
            session,
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

          setCommunityChatHasMoreTracked(hasMore);
          communityChatOldestSeqRef.current = rows[0]?.seq ?? cursor;

          const userIds = Array.from(new Set(rows.map((row) => row.sender_id)));
          void argsRef.current.onHydrateProfiles?.(userIds, session);

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

          void loadMessageReactions(rows.map((row) => row.id), session, { communityId, generation });
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
    toCommunityChatMessage,
    ensureCommunityChatThread,
    loadCommunityChat,
    loadOlderCommunityChat,
    resetCommunityChatDataState,
  };
}
