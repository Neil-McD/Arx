import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type {
  DirectMessageConversation,
  DirectMessageNetworkPerson,
} from "../../../../../shared/communityTypes";
import {
  blockCloudDirectMessageUser,
  setCloudDirectConversationMuted,
  unblockCloudDirectMessageUser,
} from "../../../../../shared/cloudDirectMessagesGateway";
import {
  isVirtualDirectConversationId,
  resolveDirectMessageSession,
  toErrorMessage,
  type DirectMessagePanelState,
  type EnsureDirectMessageSession,
} from "./directMessageHostHelpers";

export function useDirectMessageModerationActions<SessionT>(params: {
  session: SessionT | null;
  ensureSession?: EnsureDirectMessageSession<SessionT>;
  sessionUserId: string | null;
  directMessagePanelRef: MutableRefObject<DirectMessagePanelState | null>;
  setConversations: Dispatch<SetStateAction<DirectMessageConversation[]>>;
  setDirectMessagePanel: Dispatch<SetStateAction<DirectMessagePanelState | null>>;
  setNetworkPeople: Dispatch<SetStateAction<DirectMessageNetworkPerson[]>>;
}) {
  const {
    session,
    ensureSession,
    sessionUserId,
    directMessagePanelRef,
    setConversations,
    setDirectMessagePanel,
    setNetworkPeople,
  } = params;

  const toggleMuteForActiveConversation = useCallback(async () => {
    const current = directMessagePanelRef.current;
    if (!current || !session) return;
    const conversation = current.conversation;
    if (isVirtualDirectConversationId(conversation.id)) return;
    const nextMuted = !conversation.viewer_muted;
    try {
      const usableSession = await resolveDirectMessageSession(
        session,
        ensureSession,
        "direct_messages_mute",
      );
      if (!usableSession) throw new Error("Sign in to mute conversations.");
      const updated = await setCloudDirectConversationMuted({
        session: usableSession,
        conversationId: conversation.id,
        muted: nextMuted,
      });
      setConversations((previous) =>
        previous.map((row) => (row.id === updated.id ? updated : row)),
      );
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === updated.id
          ? {
              ...previous,
              conversation: updated,
              error: null,
            }
          : previous,
      );
    } catch (error) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === conversation.id
          ? {
              ...previous,
              error: toErrorMessage(error, "Failed to update the conversation."),
            }
          : previous,
      );
    }
  }, [directMessagePanelRef, ensureSession, session, setConversations, setDirectMessagePanel]);

  const toggleBlockForActivePeer = useCallback(async () => {
    const current = directMessagePanelRef.current;
    if (!current || !session) return;
    const conversation = current.conversation;
    if (isVirtualDirectConversationId(conversation.id)) return;
    const peer =
      conversation.participants.find(
        (participant) =>
          participant.status === "active" &&
          participant.participant_type === "user" &&
          participant.user_id &&
          participant.user_id !== sessionUserId,
      ) ?? null;
    const targetUserId = String(peer?.user_id ?? "").trim();
    if (!targetUserId) return;
    const nextBlocked = !conversation.viewer_has_blocked_peer;
    try {
      const usableSession = await resolveDirectMessageSession(
        session,
        ensureSession,
        "direct_messages_block",
      );
      if (!usableSession) throw new Error("Sign in to manage blocked people.");
      if (nextBlocked) {
        await blockCloudDirectMessageUser({ session: usableSession, targetUserId });
      } else {
        await unblockCloudDirectMessageUser({ session: usableSession, targetUserId });
      }
      setConversations((previous) =>
        previous.map((row) =>
          row.id === conversation.id ? { ...row, viewer_has_blocked_peer: nextBlocked } : row,
        ),
      );
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === conversation.id
          ? {
              ...previous,
              conversation: {
                ...previous.conversation,
                viewer_has_blocked_peer: nextBlocked,
              },
              error: null,
            }
          : previous,
      );
      if (nextBlocked) {
        setNetworkPeople((previous) => previous.filter((person) => person.user_id !== targetUserId));
      }
    } catch (error) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === conversation.id
          ? {
              ...previous,
              error: toErrorMessage(error, "Failed to update blocked people."),
            }
          : previous,
      );
    }
  }, [
    directMessagePanelRef,
    ensureSession,
    session,
    sessionUserId,
    setConversations,
    setDirectMessagePanel,
    setNetworkPeople,
  ]);

  return {
    toggleMuteForActiveConversation,
    toggleBlockForActivePeer,
  };
}
