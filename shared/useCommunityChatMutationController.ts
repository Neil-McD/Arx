import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  createCloudMessageReaction,
  createCloudThreadUserMessageRows,
  deleteCloudMessageReactionById,
  deleteCloudOwnMessage,
  patchCloudOwnMessageContent,
} from "./cloudCommunityChatGateway";
import { resolveAuthSubject } from "./authSession";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type SessionLike = {
  user: { id: string };
};

type ReplyPrefixLike = {
  sender: string;
  preview: string;
  rest: string;
};

type UseCommunityChatMutationControllerArgs<
  SessionT extends SessionLike,
  RowT,
  AttachmentT,
  MessageT extends {
    id: string;
    community_id: string;
    sender_id: string;
    body: string;
    attachments?: AttachmentT[];
    reply_to_id?: string | null;
    created_at: string;
    seq: number;
  },
  ReactionT extends {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
    created_at: string;
  },
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  sessionUserId: string | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  missingPayloadMessage: string;
  ensureCommunityChatThread: (communityId: string, session: SessionT) => Promise<string>;
  toCommunityChatMessage: (row: RowT) => MessageT | null;
  loadCommunityChat: (communityId: string, session: SessionT) => Promise<void>;
  parseReplyPrefix: (body: string) => ReplyPrefixLike | null;
  buildReplyPrefix: (sender: string, preview: string) => string;
  beforeSendValidate?: (text: string) => Promise<string | null>;
  prepareAttachmentsForSend?: (
    attachments: AttachmentT[],
    session: SessionT,
    communityId: string,
  ) => Promise<AttachmentT[]>;
  serializeAttachmentsForWrite?: (attachments: AttachmentT[]) => unknown[];
  onOptimisticSendScrollIntent: () => void;
  onCommunityMessageSent?: (params: {
    communityId: string;
    messageId: string;
    hasAttachments: boolean;
    hasReply: boolean;
  }) => void;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  communityAttachmentsRef: MutableRefObject<AttachmentT[]>;
  communityMessageInput: string;
  communityMessages: MessageT[];
  messageReactions: ReactionT[];
  replyingToMessage: Pick<MessageT, "id" | "sender_id" | "body"> | null;
  editingMessageId: string | null;
  editingMessageText: string;
  editingMessagePrefix: string | null;
  setCommunityMessages: Dispatch<SetStateAction<MessageT[]>>;
  setMessageReactions: Dispatch<SetStateAction<ReactionT[]>>;
  setCommunityMessageInput: Dispatch<SetStateAction<string>>;
  setCommunityAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  setReplyingToMessage: Dispatch<SetStateAction<Pick<MessageT, "id" | "sender_id" | "body"> | null>>;
  setReactionPickerMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingMessageText: Dispatch<SetStateAction<string>>;
  setEditingMessagePrefix: Dispatch<SetStateAction<string | null>>;
  setIsSendingCommunityMessage: Dispatch<SetStateAction<boolean>>;
  setCommunityChatError: Dispatch<SetStateAction<string | null>>;
};

export function useCommunityChatMutationController<
  SessionT extends SessionLike,
  RowT,
  AttachmentT,
  MessageT extends {
    id: string;
    community_id: string;
    sender_id: string;
    body: string;
    attachments?: AttachmentT[];
    reply_to_id?: string | null;
    created_at: string;
    seq: number;
  },
  ReactionT extends {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
    created_at: string;
  },
>(args: UseCommunityChatMutationControllerArgs<SessionT, RowT, AttachmentT, MessageT, ReactionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const resolveRuntimeSessionUserId = useCallback((session: SessionT): string | null => {
    const explicit = String(argsRef.current.sessionUserId ?? "").trim();
    if (explicit) return explicit;
    return resolveAuthSubject(session as any);
  }, []);

  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session) return;
    const sessionUserId = resolveRuntimeSessionUserId(session);
    if (!sessionUserId) return;
    const existingReaction = current.messageReactions.find(
      (reaction) => (
        reaction.message_id === messageId
        && reaction.user_id === sessionUserId
        && reaction.emoji === emoji
      ),
    );

    if (existingReaction) {
      current.setMessageReactions((prev) => prev.filter((reaction) => reaction.id !== existingReaction.id));
      try {
        await deleteCloudMessageReactionById({
          session,
          reactionId: existingReaction.id,
        });
      } catch {
        current.setMessageReactions((prev) => [...prev, existingReaction]);
      }
    } else {
      const optimisticId = `pending-${Date.now()}`;
      const optimisticReaction = {
        id: optimisticId,
        message_id: messageId,
        user_id: sessionUserId,
        emoji,
        created_at: new Date().toISOString(),
      } as ReactionT;
      current.setMessageReactions((prev) => [...prev, optimisticReaction]);

      try {
        const created = await createCloudMessageReaction<SessionT, ReactionT>({
          session,
          messageId,
          emoji,
        });
        if (created.length > 0) {
          current.setMessageReactions((prev) => prev.map((reaction) => (reaction.id === optimisticId ? created[0] : reaction)));
        } else {
          current.setMessageReactions((prev) => prev.filter((reaction) => reaction.id !== optimisticId));
        }
      } catch {
        current.setMessageReactions((prev) => prev.filter((reaction) => reaction.id !== optimisticId));
      }
    }

    current.setReactionPickerMessageId(null);
  }, []);

  const handleStartReply = useCallback((message: Pick<MessageT, "id" | "sender_id" | "body">) => {
    if (message.id.startsWith("pending-")) return;
    const current = argsRef.current;
    current.setReplyingToMessage(message);
    current.setReactionPickerMessageId(null);
    current.setEditingMessageId(null);
    current.setEditingMessageText("");
    current.setEditingMessagePrefix(null);
    setTimeout(() => current.chatInputRef.current?.focus(), 0);
  }, []);

  const handleStartEdit = useCallback((message: Pick<MessageT, "id" | "body">) => {
    const current = argsRef.current;
    const reply = current.parseReplyPrefix(message.body);
    current.setEditingMessageId(message.id);
    current.setEditingMessageText(reply ? reply.rest : message.body);
    current.setEditingMessagePrefix(reply ? current.buildReplyPrefix(reply.sender, reply.preview) : null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    const current = argsRef.current;
    current.setEditingMessageId(null);
    current.setEditingMessageText("");
    current.setEditingMessagePrefix(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.editingMessageId) return;
    const text = current.editingMessageText.trim();
    if (!text) return;
    const existingAttachments = current.communityMessages.find((message) => message.id === current.editingMessageId)?.attachments ?? [];
    const serializedAttachments = current.serializeAttachmentsForWrite
      ? current.serializeAttachmentsForWrite(existingAttachments)
      : existingAttachments;
    const bodyToSave = current.editingMessagePrefix ? current.editingMessagePrefix + text : text;

    current.setCommunityMessages((prev) => prev.map((message) => (
      message.id === current.editingMessageId ? { ...message, body: bodyToSave } : message
    )));
    current.setEditingMessageId(null);
    current.setEditingMessageText("");
    current.setEditingMessagePrefix(null);

    try {
      await patchCloudOwnMessageContent({
        session,
        messageId: current.editingMessageId,
        senderId: session.user.id,
        contentJson: {
          text: bodyToSave,
          ...(serializedAttachments.length > 0 ? { attachments: serializedAttachments } : {}),
        },
      });
    } catch {
      if (current.activeCommunityId) {
        await current.loadCommunityChat(current.activeCommunityId, session);
      }
    }
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session) return;
    current.setCommunityMessages((prev) => prev.filter((message) => message.id !== messageId));
    current.setMessageReactions((prev) => prev.filter((reaction) => reaction.message_id !== messageId));

    try {
      await deleteCloudOwnMessage({
        session,
        messageId,
        senderId: session.user.id,
      });
    } catch {
      if (current.activeCommunityId) {
        await current.loadCommunityChat(current.activeCommunityId, session);
      }
    }
  }, []);

  const handleSendCommunityMessage = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return;
    const sessionUserId = resolveRuntimeSessionUserId(session);
    if (!sessionUserId) return;

    const rawText = current.communityMessageInput.trim();
    const attachmentsToSend = [...current.communityAttachmentsRef.current];
    if (!rawText && attachmentsToSend.length === 0) return;

    const replySnapshot = current.replyingToMessage;
    const replyToId = replySnapshot ? replySnapshot.id : null;
    const bodyToSend = rawText;

    if (current.beforeSendValidate) {
      const validationError = await current.beforeSendValidate(bodyToSend);
      if (validationError) {
        current.setCommunityChatError(validationError);
        return;
      }
    }

    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      community_id: current.activeCommunityId,
      sender_id: sessionUserId,
      body: bodyToSend,
      attachments: attachmentsToSend,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      seq: Number.MAX_SAFE_INTEGER,
    } as MessageT;

    const restoreDraft = () => {
      current.setCommunityMessageInput(rawText);
      current.setCommunityAttachments(attachmentsToSend);
      current.setReplyingToMessage(replySnapshot);
    };

    current.setCommunityMessages((prev) => [...prev, optimisticMessage]);
    current.setCommunityMessageInput("");
    current.setCommunityAttachments([]);
    current.setReplyingToMessage(null);
    current.onOptimisticSendScrollIntent();

    if (current.chatInputRef.current) {
      current.chatInputRef.current.style.height = "auto";
    }

    current.setIsSendingCommunityMessage(true);
    current.setCommunityChatError(null);
    try {
      const preparedAttachments = current.prepareAttachmentsForSend
        ? await current.prepareAttachmentsForSend(attachmentsToSend, session, current.activeCommunityId)
        : attachmentsToSend;
      const serializedAttachments = current.serializeAttachmentsForWrite
        ? current.serializeAttachmentsForWrite(preparedAttachments)
        : preparedAttachments;
      const threadId = await current.ensureCommunityChatThread(current.activeCommunityId, session);
      const created = await createCloudThreadUserMessageRows<SessionT, RowT>({
        session,
        threadId,
        text: bodyToSend,
        attachments: serializedAttachments,
        replyToId,
      });
      const record = created[0] ? current.toCommunityChatMessage(created[0]) : null;
      if (!record) {
        current.setCommunityChatError(current.missingPayloadMessage);
        current.setCommunityMessages((prev) => prev.filter((message) => message.id !== optimisticId));
        restoreDraft();
        return;
      }

      current.setCommunityMessages((prev) => {
        const withoutOptimistic = prev.filter((message) => message.id !== optimisticId);
        if (withoutOptimistic.some((message) => message.id === record.id)) return withoutOptimistic;
        const next = [...withoutOptimistic, record];
        next.sort((left, right) => left.seq - right.seq);
        return next;
      });
      current.onCommunityMessageSent?.({
        communityId: current.activeCommunityId,
        messageId: record.id,
        hasAttachments: preparedAttachments.length > 0,
        hasReply: Boolean(replyToId),
      });
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to send message.";
      current.setCommunityChatError(message);
      current.setCommunityMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      restoreDraft();
    } finally {
      current.setIsSendingCommunityMessage(false);
    }
  }, []);

  return {
    handleToggleReaction,
    handleStartReply,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleSendCommunityMessage,
  };
}
