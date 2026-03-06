import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction, } from "react";

import { listCloudMessageReactions, listCloudThreadMessages } from "./cloudCommunityChatGateway";

type SessionLike = {
  access_token: string;
  user: { id: string };
};

type MessageRowLike = {
  id: string;
  thread_id: string;
};

type ChatMessageLike = {
  id: string;
  sender_id: string;
  seq: number;
};

type ReactionLike = {
  id: string;
  message_id: string;
};

type UseCommunityChatRealtimeArgs<
  SessionT extends SessionLike,
  MessageRowT extends MessageRowLike,
  ChatMessageT extends ChatMessageLike,
  ReactionT extends ReactionLike,
> = {
  isEnabled: boolean;
  session: SessionT | null;
  activeCommunityId: string | null;
  ensureCommunityChatThread: (communityId: string, session: SessionT) => Promise<string>;
  toCommunityChatMessage: (row: MessageRowT) => ChatMessageT | null;
  communityMessageIdsRef: MutableRefObject<Set<string>>;
  isUserAtBottomRef: MutableRefObject<boolean>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  setCommunityMessages: Dispatch<SetStateAction<ChatMessageT[]>>;
  setMessageReactions: Dispatch<SetStateAction<ReactionT[]>>;
  onLoadProfiles?: (userIds: string[], session: SessionT) => void | Promise<void>;
  pollIntervalMs?: number;
};

function mergeMessagesById<ChatMessageT extends ChatMessageLike>(
  prev: ChatMessageT[],
  nextRows: ChatMessageT[],
): ChatMessageT[] {
  if (nextRows.length === 0) return prev;
  const byId = new Map<string, ChatMessageT>();
  for (const message of prev) byId.set(message.id, message);
  for (const incoming of nextRows) {
    const existing = byId.get(incoming.id);
    byId.set(incoming.id, existing ? { ...existing, ...incoming } : incoming);
  }
  return Array.from(byId.values()).sort((a, b) => a.seq - b.seq);
}

function mergeReactionsById<ReactionT extends ReactionLike>(prev: ReactionT[], rows: ReactionT[]): ReactionT[] {
  if (rows.length === 0) return prev;
  const byId = new Map<string, ReactionT>();
  for (const reaction of prev) byId.set(reaction.id, reaction);
  for (const reaction of rows) {
    const existing = byId.get(reaction.id);
    byId.set(reaction.id, existing ? { ...existing, ...reaction } : reaction);
  }
  return Array.from(byId.values());
}

export function useCommunityChatRealtime<
  SessionT extends SessionLike,
  MessageRowT extends MessageRowLike,
  ChatMessageT extends ChatMessageLike,
  ReactionT extends ReactionLike,
>(args: UseCommunityChatRealtimeArgs<SessionT, MessageRowT, ChatMessageT, ReactionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const [communityTypingUserIds, setCommunityTypingUserIds] = useState<string[]>([]);
  const onLoadProfilesRef = useRef(args.onLoadProfiles);
  const pollTimerRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    onLoadProfilesRef.current = args.onLoadProfiles;
  }, [args.onLoadProfiles]);

  const clearRuntimeState = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setCommunityTypingUserIds((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const maybeBroadcastCommunityTyping = useCallback((_nextValue: string) => {
    // Typing broadcast is intentionally disabled during the Convex realtime lane cut.
  }, []);

  useEffect(() => {
    const session = args.session;
    if (!args.isEnabled || !session || !args.activeCommunityId) {
      clearRuntimeState();
      return;
    }

    let cancelled = false;

    const pollOnce = async () => {
      if (cancelled || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const latestArgs = argsRef.current;
        const threadId = await latestArgs.ensureCommunityChatThread(args.activeCommunityId!, session);
        if (cancelled) return;

        const rowsDesc = await listCloudThreadMessages<SessionT, MessageRowT>({
          session,
          threadId,
          limit: 100,
        });
        if (cancelled) return;
        const mappedRows = rowsDesc
          .map((row) => latestArgs.toCommunityChatMessage(row))
          .filter(Boolean) as ChatMessageT[];
        mappedRows.sort((a, b) => a.seq - b.seq);

        if (mappedRows.length > 0) {
          const knownIds = latestArgs.communityMessageIdsRef.current;
          const newSenderIds = mappedRows
            .filter((message) => !knownIds.has(message.id))
            .map((message) => message.sender_id);
          if (newSenderIds.length > 0) {
            const uniqueSenders = Array.from(new Set(newSenderIds));
            void onLoadProfilesRef.current?.(uniqueSenders, session);
          }

          let unreadDelta = 0;
          if (!latestArgs.isUserAtBottomRef.current) {
            for (const message of mappedRows) {
              if (knownIds.has(message.id)) continue;
              if (message.sender_id === session.user.id) continue;
              unreadDelta += 1;
            }
          }

          latestArgs.setCommunityMessages((prev) => mergeMessagesById(prev, mappedRows));
          if (unreadDelta > 0) {
            latestArgs.setUnreadCount((prev) => prev + unreadDelta);
          }

          const messageIds = mappedRows.map((message) => message.id);
          const reactionRowsRaw = await listCloudMessageReactions<SessionT, ReactionT>({
            session,
            messageIds,
          });
          if (!cancelled) {
            const messageIdSet = new Set(messageIds);
            const reactionRows = reactionRowsRaw.filter((row) =>
              messageIdSet.has(row.message_id),
            );
            latestArgs.setMessageReactions((prev) => mergeReactionsById(prev, reactionRows));
          }
        }
      } catch {
        // Poll failures are soft; next tick retries.
      } finally {
        pollInFlightRef.current = false;
      }
    };

    void pollOnce();
    const intervalMs = Math.max(1000, Math.floor(args.pollIntervalMs ?? 2500));
    pollTimerRef.current = window.setInterval(() => {
      void pollOnce();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearRuntimeState();
    };
  }, [
    args.activeCommunityId,
    args.ensureCommunityChatThread,
    args.isEnabled,
    args.pollIntervalMs,
    args.session,
    clearRuntimeState,
  ]);

  return {
    communityTypingUserIds,
    maybeBroadcastCommunityTyping,
  };
}
