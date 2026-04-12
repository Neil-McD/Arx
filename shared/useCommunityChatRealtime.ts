import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction, } from "react";

import {
  createCloudCommunityChatLiveClient,
  subscribeCloudMessageReactions,
  subscribeCloudThreadMessages,
  type CloudCommunityChatLiveClient,
} from "./cloudCommunityChatGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

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
  ensureSession?: EnsureSessionFn<SessionT>;
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

function reconcileLatestMessages<ChatMessageT extends ChatMessageLike>(
  prev: ChatMessageT[],
  nextRows: ChatMessageT[],
): ChatMessageT[] {
  const pending = prev.filter((message) => String(message.id).startsWith("pending-"));
  if (nextRows.length === 0) return pending;
  const incomingIds = new Set(nextRows.map((message) => message.id));
  const minIncomingSeq = nextRows.reduce((min, message) => Math.min(min, message.seq), Number.POSITIVE_INFINITY);
  const older = prev.filter((message) => {
    if (String(message.id).startsWith("pending-")) return false;
    if (incomingIds.has(message.id)) return false;
    return message.seq < minIncomingSeq;
  });
  return [...older, ...nextRows, ...pending].sort((a, b) => a.seq - b.seq);
}

function reconcileWatchedReactions<ReactionT extends ReactionLike>(
  prev: ReactionT[],
  rows: ReactionT[],
  watchedMessageIds: Set<string>,
): ReactionT[] {
  const keep = prev.filter((reaction) => !watchedMessageIds.has(reaction.message_id));
  if (rows.length === 0) return keep;
  const byId = new Map<string, ReactionT>();
  for (const reaction of keep) byId.set(reaction.id, reaction);
  for (const reaction of rows) byId.set(reaction.id, reaction);
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
  const onLoadProfilesRef = useRef(args.onLoadProfiles);
  const liveClientRef = useRef<CloudCommunityChatLiveClient | null>(null);
  const messageUpdateSeqRef = useRef(0);

  useEffect(() => {
    onLoadProfilesRef.current = args.onLoadProfiles;
  }, [args.onLoadProfiles]);

  const clearRuntimeState = useCallback(() => {
    liveClientRef.current?.close();
    liveClientRef.current = null;
  }, []);

  useEffect(() => {
    const session = args.session;
    if (!args.isEnabled || !session || !args.activeCommunityId) {
      clearRuntimeState();
      return;
    }

    let cancelled = false;
    let disposeMessages: (() => void) | null = null;
    let disposeReactions: (() => void) | null = null;
    let watchedReactionKey = "";

    const subscribe = async () => {
      try {
        const latestArgs = argsRef.current;
        const usableSession = await resolveUsableSession(session, latestArgs.ensureSession);
        if (!usableSession) return;
        const threadId = await latestArgs.ensureCommunityChatThread(args.activeCommunityId!, usableSession);
        if (cancelled) return;

        const liveClient = createCloudCommunityChatLiveClient({ session: usableSession });
        liveClientRef.current?.close();
        liveClientRef.current = liveClient;

        const refreshReactionSubscription = (messageIds: string[]) => {
          const normalizedIds = Array.from(new Set(messageIds.filter(Boolean)));
          const nextKey = normalizedIds.join("|");
          if (nextKey === watchedReactionKey) return;
          watchedReactionKey = nextKey;
          disposeReactions?.();
          disposeReactions = null;
          if (normalizedIds.length === 0) {
            latestArgs.setMessageReactions([]);
            return;
          }
          const watchedMessageIds = new Set(normalizedIds);
          disposeReactions = subscribeCloudMessageReactions<ReactionT>({
            liveClient,
            messageIds: normalizedIds,
            onUpdate: (rows) => {
              if (cancelled) return;
              latestArgs.setMessageReactions((prev) =>
                reconcileWatchedReactions(prev, rows, watchedMessageIds),
              );
            },
          });
        };

        disposeMessages = subscribeCloudThreadMessages<MessageRowT>({
          liveClient,
          threadId,
          limit: 100,
          onUpdate: (rowsDesc) => {
            const updateSeq = (messageUpdateSeqRef.current += 1);
            void (async () => {
              if (cancelled) return;
              const mappedRows = rowsDesc
                .map((row) => latestArgs.toCommunityChatMessage(row))
                .filter(Boolean) as ChatMessageT[];
              mappedRows.sort((a, b) => a.seq - b.seq);

              const knownIds = latestArgs.communityMessageIdsRef.current;
              const newMessages = mappedRows.filter((message) => !knownIds.has(message.id));
              if (newMessages.length > 0) {
                const uniqueSenders = Array.from(new Set(newMessages.map((message) => message.sender_id)));
                if (uniqueSenders.length > 0) {
                  await onLoadProfilesRef.current?.(uniqueSenders, usableSession);
                  if (cancelled || messageUpdateSeqRef.current !== updateSeq) return;
                }
              }

              let unreadDelta = 0;
              if (!latestArgs.isUserAtBottomRef.current) {
                for (const message of newMessages) {
                  if (message.sender_id === usableSession.user.id) continue;
                  unreadDelta += 1;
                }
              }

              latestArgs.setCommunityMessages((prev) => reconcileLatestMessages(prev, mappedRows));
              for (const message of mappedRows) knownIds.add(message.id);
              if (unreadDelta > 0) {
                latestArgs.setUnreadCount((prev) => prev + unreadDelta);
              }

              refreshReactionSubscription(mappedRows.map((message) => message.id));
            })();
          },
        });
      } catch {
        // Live subscription failures are soft; initial load remains the primary UX path.
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      disposeReactions?.();
      disposeMessages?.();
      clearRuntimeState();
    };
  }, [
    args.activeCommunityId,
    args.ensureCommunityChatThread,
    args.isEnabled,
    args.session,
    clearRuntimeState,
  ]);

  return {
  };
}
