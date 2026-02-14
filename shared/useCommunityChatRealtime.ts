import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

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
  supabaseSession: SessionT | null;
  activeCommunityId: string | null;
  getSupabaseUrl: () => string | null;
  getSupabaseAnonKey: () => string | null;
  ensureCommunityChatThread: (communityId: string, session: SessionT) => Promise<string>;
  toCommunityChatMessage: (row: MessageRowT) => ChatMessageT | null;
  communityMessageIdsRef: MutableRefObject<Set<string>>;
  isUserAtBottomRef: MutableRefObject<boolean>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  setCommunityMessages: Dispatch<SetStateAction<ChatMessageT[]>>;
  setMessageReactions: Dispatch<SetStateAction<ReactionT[]>>;
  onLoadProfiles?: (userIds: string[], session: SessionT) => void | Promise<void>;
};

export function useCommunityChatRealtime<
  SessionT extends SessionLike,
  MessageRowT extends MessageRowLike,
  ChatMessageT extends ChatMessageLike,
  ReactionT extends ReactionLike,
>(args: UseCommunityChatRealtimeArgs<SessionT, MessageRowT, ChatMessageT, ReactionT>) {
  const [communityTypingUserIds, setCommunityTypingUserIds] = useState<string[]>([]);
  const onLoadProfilesRef = useRef(args.onLoadProfiles);
  const communitySocketRef = useRef<WebSocket | null>(null);
  const communityHeartbeatRef = useRef<number | null>(null);
  const communityTypingTopicRef = useRef<string | null>(null);
  const communityTypingTimeoutsRef = useRef<Map<string, number>>(new Map());
  const lastCommunityTypingSentAtRef = useRef<number>(0);

  useEffect(() => {
    onLoadProfilesRef.current = args.onLoadProfiles;
  }, [args.onLoadProfiles]);

  const clearRuntimeState = useCallback(() => {
    if (communitySocketRef.current) {
      communitySocketRef.current.close();
      communitySocketRef.current = null;
    }
    if (communityHeartbeatRef.current) {
      window.clearInterval(communityHeartbeatRef.current);
      communityHeartbeatRef.current = null;
    }
    communityTypingTopicRef.current = null;
    for (const timeoutId of communityTypingTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    communityTypingTimeoutsRef.current.clear();
    setCommunityTypingUserIds((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const maybeBroadcastCommunityTyping = useCallback(
    (nextValue: string) => {
      if (!args.isEnabled || !args.supabaseSession || !args.activeCommunityId) return;
      if (!nextValue.trim()) return;
      const socket = communitySocketRef.current;
      const topic = communityTypingTopicRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !topic) return;
      const now = Date.now();
      if (now - lastCommunityTypingSentAtRef.current < 1200) return;
      lastCommunityTypingSentAtRef.current = now;
      socket.send(
        JSON.stringify({
          topic,
          event: "broadcast",
          payload: {
            event: "typing",
            payload: {
              user_id: args.supabaseSession.user.id,
            },
          },
          ref: `${now}`,
        }),
      );
    },
    [args.activeCommunityId, args.isEnabled, args.supabaseSession],
  );

  useEffect(() => {
    if (!args.isEnabled || !args.supabaseSession || !args.activeCommunityId) {
      clearRuntimeState();
      return;
    }

    const url = args.getSupabaseUrl();
    const apiKey = args.getSupabaseAnonKey();
    if (!url || !apiKey) {
      clearRuntimeState();
      return;
    }

    const wsUrl = `${url.replace("https://", "wss://").replace("http://", "ws://")}/realtime/v1/websocket?apikey=${apiKey}&vsn=1.0.0`;
    let socket: WebSocket | null = null;
    let cancelled = false;
    const joinRef = `${Date.now()}`;
    const messagesTopic = "realtime:public:messages";
    const reactionsJoinRef = `${Date.now()}-reactions`;
    const reactionsTopic = "realtime:public:message_reactions";

    void (async () => {
      let threadId: string;
      try {
        threadId = await args.ensureCommunityChatThread(args.activeCommunityId, args.supabaseSession);
      } catch {
        return;
      }
      if (cancelled) return;

      const typingJoinRef = `${Date.now()}-typing`;
      const typingTopic = `realtime:typing_${threadId}`;
      communityTypingTopicRef.current = typingTopic;

      socket = new WebSocket(wsUrl);
      communitySocketRef.current = socket;

      socket.addEventListener("open", () => {
        if (!socket) return;

        socket.send(
          JSON.stringify({
            topic: messagesTopic,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { ack: false },
                postgres_changes: [
                  {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `thread_id=eq.${threadId}`,
                  },
                  {
                    event: "UPDATE",
                    schema: "public",
                    table: "messages",
                    filter: `thread_id=eq.${threadId}`,
                  },
                  {
                    event: "DELETE",
                    schema: "public",
                    table: "messages",
                    filter: `thread_id=eq.${threadId}`,
                  },
                ],
              },
              access_token: args.supabaseSession.access_token,
            },
            ref: joinRef,
          }),
        );

        socket.send(
          JSON.stringify({
            topic: reactionsTopic,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { ack: false },
                postgres_changes: [
                  { event: "INSERT", schema: "public", table: "message_reactions" },
                  { event: "UPDATE", schema: "public", table: "message_reactions" },
                  { event: "DELETE", schema: "public", table: "message_reactions" },
                ],
              },
              access_token: args.supabaseSession.access_token,
            },
            ref: reactionsJoinRef,
          }),
        );

        socket.send(
          JSON.stringify({
            topic: typingTopic,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { ack: false },
              },
              access_token: args.supabaseSession.access_token,
            },
            ref: typingJoinRef,
          }),
        );

        communityHeartbeatRef.current = window.setInterval(() => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
          socket.send(
            JSON.stringify({
              topic: "phoenix",
              event: "heartbeat",
              payload: {},
              ref: `${Date.now()}`,
            }),
          );
        }, 25000);
      });

      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data) as {
            topic?: string;
            event?: string;
            payload?: Record<string, unknown>;
          };

          if (data.event === "broadcast" && data.topic === typingTopic) {
            const payload = data.payload as { event?: unknown; payload?: unknown; type?: unknown };
            const name =
              (typeof payload.event === "string" ? payload.event : null)
              ?? (typeof payload.type === "string" ? payload.type : null)
              ?? "";
            if (name !== "typing") return;
            const details = payload.payload as { user_id?: unknown; userId?: unknown } | null;
            const userId =
              (details && typeof details.user_id === "string" ? details.user_id : null)
              ?? (details && typeof details.userId === "string" ? details.userId : null);
            if (!userId) return;
            if (userId === args.supabaseSession.user.id) return;
            void onLoadProfilesRef.current?.([userId], args.supabaseSession);

            const existing = communityTypingTimeoutsRef.current.get(userId);
            if (existing) window.clearTimeout(existing);
            const timeoutId = window.setTimeout(() => {
              communityTypingTimeoutsRef.current.delete(userId);
              setCommunityTypingUserIds(Array.from(communityTypingTimeoutsRef.current.keys()));
            }, 2500);
            communityTypingTimeoutsRef.current.set(userId, timeoutId);
            setCommunityTypingUserIds(Array.from(communityTypingTimeoutsRef.current.keys()));
            return;
          }

          if (data.event !== "postgres_changes") return;

          if (data.topic === messagesTopic) {
            const payload = data.payload as {
              eventType?: string;
              type?: string;
              new?: MessageRowT;
              old?: MessageRowT;
              record?: MessageRowT;
              old_record?: MessageRowT;
              data?: {
                type?: string;
                new?: MessageRowT;
                old?: MessageRowT;
                record?: MessageRowT;
                old_record?: MessageRowT;
              };
            };

            const eventType = (payload.eventType ?? payload.type ?? payload.data?.type ?? "").toUpperCase();
            const newRecord = payload.new ?? payload.record ?? payload.data?.new ?? payload.data?.record;
            const oldRecord = payload.old ?? payload.old_record ?? payload.data?.old ?? payload.data?.old_record;

            if (eventType === "DELETE") {
              const deleted = oldRecord ?? newRecord;
              if (!deleted) return;
              if (deleted.thread_id !== threadId) return;
              args.setCommunityMessages((prev) => prev.filter((m) => m.id !== deleted.id));
              args.setMessageReactions((prev) => prev.filter((r) => r.message_id !== deleted.id));
              return;
            }

            if (!newRecord) return;
            if (newRecord.thread_id !== threadId) return;
            const mapped = args.toCommunityChatMessage(newRecord);
            if (!mapped) return;
            void onLoadProfilesRef.current?.([mapped.sender_id], args.supabaseSession);
            args.setCommunityMessages((prev) => {
              const idx = prev.findIndex((item) => item.id === mapped.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...mapped };
                next.sort((a, b) => a.seq - b.seq);
                return next;
              }
              const next = [...prev, mapped];
              next.sort((a, b) => a.seq - b.seq);
              return next;
            });
            if (
              eventType === "INSERT"
              && mapped.sender_id !== args.supabaseSession.user.id
              && !args.isUserAtBottomRef.current
            ) {
              args.setUnreadCount((prev) => prev + 1);
            }
            return;
          }

          if (data.topic === reactionsTopic) {
            const payload = data.payload as {
              eventType?: string;
              type?: string;
              new?: ReactionT;
              old?: ReactionT;
              record?: ReactionT;
              old_record?: ReactionT;
              data?: {
                type?: string;
                new?: ReactionT;
                old?: ReactionT;
                record?: ReactionT;
                old_record?: ReactionT;
              };
            };

            const eventType = (payload.eventType ?? payload.type ?? payload.data?.type ?? "").toUpperCase();
            const newRecord = payload.new ?? payload.record ?? payload.data?.new ?? payload.data?.record;
            const oldRecord = payload.old ?? payload.old_record ?? payload.data?.old ?? payload.data?.old_record;
            const target = eventType === "DELETE" ? oldRecord ?? newRecord : newRecord;
            if (!target) return;
            if (!args.communityMessageIdsRef.current.has(target.message_id)) return;

            if (eventType === "DELETE") {
              args.setMessageReactions((prev) => prev.filter((r) => r.id !== target.id));
              return;
            }

            args.setMessageReactions((prev) => {
              const idx = prev.findIndex((item) => item.id === target.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...target };
                return next;
              }
              return [...prev, target];
            });
          }
        } catch {
          // Ignore malformed payloads.
        }
      });

      socket.addEventListener("close", () => {
        if (communityHeartbeatRef.current) {
          window.clearInterval(communityHeartbeatRef.current);
          communityHeartbeatRef.current = null;
        }
      });
    })();

    return () => {
      cancelled = true;
      socket?.close();
      clearRuntimeState();
    };
  }, [
    args.activeCommunityId,
    args.communityMessageIdsRef,
    args.ensureCommunityChatThread,
    args.getSupabaseAnonKey,
    args.getSupabaseUrl,
    args.isEnabled,
    args.isUserAtBottomRef,
    args.setCommunityMessages,
    args.setMessageReactions,
    args.setUnreadCount,
    args.supabaseSession,
    args.toCommunityChatMessage,
    clearRuntimeState,
  ]);

  return {
    communityTypingUserIds,
    maybeBroadcastCommunityTyping,
  };
}
