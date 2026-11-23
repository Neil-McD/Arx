import { useEffect, useRef, useState } from "react";
import type {
  DirectMessageConversation,
  DirectMessageNetworkPerson,
} from "../../../../../shared/communityTypes";
import { listCloudDirectMessagePeerPresence } from "../../../../../shared/cloudDirectMessagesGateway";
import {
  findConversationPeerUserId,
  resolveDirectMessageSession,
  type EnsureDirectMessageSession,
} from "./directMessageHostHelpers";

export function useDirectMessagePeerPresence<SessionT>(params: {
  isOpen: boolean;
  session: SessionT | null;
  ensureSession?: EnsureDirectMessageSession<SessionT>;
  sessionUserId: string | null;
  conversations: readonly DirectMessageConversation[];
  networkPeople: readonly DirectMessageNetworkPerson[];
}): Record<string, string | null> {
  const { isOpen, session, ensureSession, sessionUserId, conversations, networkPeople } = params;
  const [peerPresenceByUserId, setPeerPresenceByUserId] = useState<Record<string, string | null>>({});
  const peerPresenceFetchRef = useRef<{ key: string; atMs: number }>({ key: "", atMs: 0 });

  useEffect(() => {
    if (networkPeople.length === 0) return;
    setPeerPresenceByUserId((previous) => {
      const next = { ...previous };
      for (const person of networkPeople) {
        const userId = String(person.user_id ?? "").trim();
        if (userId) next[userId] = person.last_active_at ?? null;
      }
      return next;
    });
  }, [networkPeople]);

  useEffect(() => {
    if (!isOpen || !session) return;
    const peerUserIds = Array.from(
      new Set(
        conversations
          .map((conversation) => findConversationPeerUserId(conversation, sessionUserId))
          .filter(Boolean),
      ),
    ).slice(0, 50);
    if (peerUserIds.length === 0) return;
    const fetchKey = [...peerUserIds].sort().join(",");
    const nowMs = Date.now();
    if (
      peerPresenceFetchRef.current.key === fetchKey &&
      nowMs - peerPresenceFetchRef.current.atMs < 60_000
    ) {
      return;
    }
    peerPresenceFetchRef.current = { key: fetchKey, atMs: nowMs };

    let isDisposed = false;
    void (async () => {
      try {
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_peer_presence",
        );
        if (!usableSession || isDisposed) return;
        const peers = await listCloudDirectMessagePeerPresence({
          session: usableSession,
          targetUserIds: peerUserIds,
        });
        if (isDisposed) return;
        setPeerPresenceByUserId((previous) => {
          const next = { ...previous };
          for (const peer of peers) {
            next[peer.user_id] = peer.last_active_at;
          }
          return next;
        });
      } catch {
        // Presence is decorative; rows fall back to no dot.
      }
    })();
    return () => {
      isDisposed = true;
    };
  }, [conversations, ensureSession, isOpen, session, sessionUserId]);

  return peerPresenceByUserId;
}
