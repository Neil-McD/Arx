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
import { textContainsMentionToken } from "./communityMentionRendering";

type SessionLike = {
  user: { id: string };
};

type ReplyPrefixLike = {
  sender: string;
  preview: string;
  rest: string;
};

type CommunityReplyTarget<
  MessageT extends {
    id: string;
    sender_id: string;
    body: string;
  },
> = Pick<MessageT, "id" | "sender_id" | "body"> & {
  interaction_root_id?: string | null;
  legacy_message_id?: string | null;
};

export type CommunityMessageSendDraft<
  MessageT extends {
    id: string;
    sender_id: string;
    body: string;
  },
  AttachmentT,
> = {
  text?: string;
  attachments?: AttachmentT[];
  mentions?: { userId: string; displayName: string; token: string; kind?: "user" | "community_agent"; agentKey?: string }[];
  replyingToMessage?: CommunityReplyTarget<MessageT> | null;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null> | null;
  clearDraft?: () => void;
  restoreDraft?: () => void;
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
  createCommunityInteractionMessageRows?: (params: {
    session: SessionT;
    communityId: string;
    idempotencyKey: string;
    text: string;
    rootId?: string | null;
    replyToMessageId?: string | null;
    mentions?: { userId?: string; agentKey?: string }[];
    attachments?: unknown[];
  }) => Promise<RowT[]>;
  useCanonicalCommunityInteractions?: boolean;
  onCanonicalOptimisticInsert?: (pending: {
    idempotencyKey: string;
    communityId: string;
    kind: "root" | "reply";
    rootId: string | null;
    replyToMessageId: string | null;
    text: string;
    attachments: AttachmentT[];
    serializedAttachments: unknown[];
    createdAt: string;
    senderId: string;
  }) => void;
  onCanonicalOptimisticSettle?: (settle: { idempotencyKey: string; status: "failed" }) => void;
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
  onProfileSetupRequired?: () => void;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  communityAttachmentsRef: MutableRefObject<AttachmentT[]>;
  communityMessageInput: string;
  communityMessageMentions?: { userId: string; displayName: string; token: string; kind?: "user" | "community_agent"; agentKey?: string }[];
  communityMessages: MessageT[];
  messageReactions: ReactionT[];
  replyingToMessage: CommunityReplyTarget<MessageT> | null;
  editingMessageId: string | null;
  editingMessageText: string;
  editingMessagePrefix: string | null;
  setCommunityMessages: Dispatch<SetStateAction<MessageT[]>>;
  setMessageReactions: Dispatch<SetStateAction<ReactionT[]>>;
  setCommunityMessageInput: Dispatch<SetStateAction<string>>;
  setCommunityAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  setReplyingToMessage: Dispatch<SetStateAction<CommunityReplyTarget<MessageT> | null>>;
  setReactionPickerMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingMessageText: Dispatch<SetStateAction<string>>;
  setEditingMessagePrefix: Dispatch<SetStateAction<string | null>>;
  setIsSendingCommunityMessage: Dispatch<SetStateAction<boolean>>;
  setCommunityChatError: Dispatch<SetStateAction<string | null>>;
};

function isProfileSetupRequiredError(error: unknown): boolean {
  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "";
  return message.includes("profile_setup_required");
}

function mapCommunityChatMutationErrorMessage(error: unknown): string {
  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Failed to send message.";
  if (message.includes("profile_setup_required")) {
    return "Finish your profile before posting in communities.";
  }
  if (message.includes("message_attachment_limit_exceeded")) {
    return "You can attach up to 8 files per message.";
  }
  if (message.includes("message_attachment_payload_too_large")) {
    return "One attachment preview is too large. Try a smaller image.";
  }
  if (
    message.includes("community_interaction_reply_target_unmapped") ||
    message.includes("interaction_legacy_reply_target") ||
    message.includes("interaction_target_reply_invalid")
  ) {
    return "Reply target is unavailable. Reopen the thread and try again.";
  }
  if (message.includes("community_interaction_writer_missing")) {
    return "Community chat is unavailable. Refresh and try again.";
  }
  return message;
}

function createCommunityComposerIdempotencyKey(communityId: string, rootId: string | null): string {
  const scope = rootId ? `reply:${rootId}` : "root";
  return [
    "community-composer",
    communityId,
    scope,
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join(":");
}

type CommunityChatSendRoute =
  | {
      kind: "canonical";
      rootId: string | null;
      idempotencyKey: string;
    }
  | {
      kind: "legacy";
      reason: "projection_disabled";
    };

function resolveCommunityChatSendRoute(args: {
  useCanonicalCommunityInteractions?: boolean;
  hasCanonicalWriter: boolean;
  activeCommunityId: string;
  hasReplyTarget: boolean;
  replyRootId: string | null;
}): CommunityChatSendRoute {
  if (!args.useCanonicalCommunityInteractions) {
    return { kind: "legacy", reason: "projection_disabled" };
  }
  if (!args.hasCanonicalWriter) {
    throw new Error("community_interaction_writer_missing");
  }
  if (args.hasReplyTarget && !args.replyRootId) {
    throw new Error("community_interaction_reply_target_unmapped");
  }
  return {
    kind: "canonical",
    rootId: args.replyRootId,
    idempotencyKey: createCommunityComposerIdempotencyKey(args.activeCommunityId, args.replyRootId),
  };
}

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

  const handleStartReply = useCallback((message: CommunityReplyTarget<MessageT>) => {
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
      });
    } catch {
      if (current.activeCommunityId) {
        await current.loadCommunityChat(current.activeCommunityId, session);
      }
    }
  }, []);

  const handleSendCommunityMessage = useCallback(async (
    draft?: CommunityMessageSendDraft<MessageT, AttachmentT>,
  ) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return;
    const activeCommunityId = current.activeCommunityId;
    const sessionUserId = resolveRuntimeSessionUserId(session);
    if (!sessionUserId) return;

    const hasExplicitDraft = Boolean(draft);
    const rawText = String(draft?.text ?? current.communityMessageInput).trim();
    const attachmentsToSend = draft?.attachments
      ? [...draft.attachments]
      : [...current.communityAttachmentsRef.current];
    if (!rawText && attachmentsToSend.length === 0) return;

    const replySnapshot = hasExplicitDraft
      ? draft?.replyingToMessage ?? null
      : current.replyingToMessage;
    const replyToId = replySnapshot ? replySnapshot.id : null;
    const replyRootId = String(replySnapshot?.interaction_root_id ?? "").trim() || null;
    const legacyReplyToId = (() => {
      const legacyId = String(replySnapshot?.legacy_message_id ?? "").trim();
      if (legacyId) return legacyId;
      return replyRootId ? null : replyToId;
    })();
    const bodyToSend = rawText;

    // Keep only mentions whose exact inserted token still appears as a real
    // mention token in the sent text (dedupe by user). User tokens are
    // @handle; display names are never mention identity.
    const mentionDraft = draft?.mentions ?? current.communityMessageMentions ?? [];
    const mentionsToSend: { userId?: string; agentKey?: string }[] = [];
    const seenMentionUserIds = new Set<string>();
    for (const mention of mentionDraft) {
      if (!mention.userId || seenMentionUserIds.has(mention.userId)) continue;
      if (!textContainsMentionToken(bodyToSend, mention.token)) continue;
      seenMentionUserIds.add(mention.userId);
      if (mention.kind === "community_agent") {
        mentionsToSend.push({ agentKey: mention.agentKey ?? "community_agent" });
        continue;
      }
      mentionsToSend.push({ userId: mention.userId });
    }

    if (current.beforeSendValidate) {
      const validationError = await current.beforeSendValidate(bodyToSend);
      if (validationError) {
        current.setCommunityChatError(validationError);
        return;
      }
    }

    const optimisticId = `pending-${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticMessage = {
      id: optimisticId,
      community_id: current.activeCommunityId,
      sender_id: sessionUserId,
      body: bodyToSend,
      attachments: attachmentsToSend,
      reply_to_id: legacyReplyToId,
      created_at: optimisticCreatedAt,
      seq: Number.MAX_SAFE_INTEGER,
    } as MessageT;

    const restoreDraft = () => {
      if (draft?.restoreDraft) {
        draft.restoreDraft();
        return;
      }
      current.setCommunityMessageInput(rawText);
      current.setCommunityAttachments(attachmentsToSend);
      current.setReplyingToMessage(replySnapshot);
    };

    current.setCommunityMessages((prev) => [...prev, optimisticMessage]);
    if (draft?.clearDraft) {
      draft.clearDraft();
    } else {
      current.setCommunityMessageInput("");
      current.setCommunityAttachments([]);
      current.setReplyingToMessage(null);
    }
    current.onOptimisticSendScrollIntent();

    const inputRef = draft?.inputRef ?? current.chatInputRef;
    if (inputRef?.current) {
      inputRef.current.style.height = "auto";
    }

    current.setIsSendingCommunityMessage(true);
    current.setCommunityChatError(null);
    let canonicalOptimisticIdempotencyKey: string | null = null;
    try {
      const preparedAttachments = current.prepareAttachmentsForSend
        ? await current.prepareAttachmentsForSend(attachmentsToSend, session, current.activeCommunityId)
        : attachmentsToSend;
      const serializedAttachments = current.serializeAttachmentsForWrite
        ? current.serializeAttachmentsForWrite(preparedAttachments)
        : preparedAttachments;
      const createCanonicalMessageRows = current.createCommunityInteractionMessageRows;
      const sendRoute = resolveCommunityChatSendRoute({
        useCanonicalCommunityInteractions: current.useCanonicalCommunityInteractions,
        hasCanonicalWriter: Boolean(createCanonicalMessageRows),
        activeCommunityId,
        hasReplyTarget: Boolean(replySnapshot),
        replyRootId,
      });

      if (sendRoute.kind === "canonical" && current.onCanonicalOptimisticInsert) {
        canonicalOptimisticIdempotencyKey = sendRoute.idempotencyKey;
        current.onCanonicalOptimisticInsert({
          idempotencyKey: sendRoute.idempotencyKey,
          communityId: activeCommunityId,
          kind: sendRoute.rootId ? "reply" : "root",
          rootId: sendRoute.rootId,
          replyToMessageId: legacyReplyToId,
          text: bodyToSend,
          attachments: preparedAttachments,
          serializedAttachments,
          createdAt: optimisticCreatedAt,
          senderId: sessionUserId,
        });
      }

      if (sendRoute.kind === "canonical") {
        if (!createCanonicalMessageRows) throw new Error("community_interaction_writer_missing");
        await createCanonicalMessageRows({
          session,
          communityId: activeCommunityId,
          idempotencyKey: sendRoute.idempotencyKey,
          text: bodyToSend,
          rootId: sendRoute.rootId,
          replyToMessageId: legacyReplyToId,
          mentions: mentionsToSend,
          attachments: serializedAttachments,
        });
        current.setCommunityMessages((prev) => prev.filter((message) => message.id !== optimisticId));
        current.onCommunityMessageSent?.({
          communityId: activeCommunityId,
          messageId: sendRoute.idempotencyKey,
          hasAttachments: preparedAttachments.length > 0,
          hasReply: Boolean(replySnapshot),
        });
        return;
      }

      const threadId = await current.ensureCommunityChatThread(activeCommunityId, session);
      const created = await createCloudThreadUserMessageRows<SessionT, RowT>({
        session,
        threadId,
        text: bodyToSend,
        attachments: serializedAttachments,
        replyToId: legacyReplyToId,
      });
      const record = created[0] ? current.toCommunityChatMessage(created[0]) : null;
      if (!record) {
        current.setCommunityChatError(current.missingPayloadMessage);
        current.setCommunityMessages((prev) => prev.filter((message) => message.id !== optimisticId));
        if (canonicalOptimisticIdempotencyKey) {
          current.onCanonicalOptimisticSettle?.({
            idempotencyKey: canonicalOptimisticIdempotencyKey,
            status: "failed",
          });
        }
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
        communityId: activeCommunityId,
        messageId: record.id,
        hasAttachments: preparedAttachments.length > 0,
        hasReply: Boolean(replyToId),
      });
    } catch (error) {
      if (isProfileSetupRequiredError(error)) {
        current.onProfileSetupRequired?.();
      }
      current.setCommunityChatError(mapCommunityChatMutationErrorMessage(error));
      current.setCommunityMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      if (canonicalOptimisticIdempotencyKey) {
        current.onCanonicalOptimisticSettle?.({
          idempotencyKey: canonicalOptimisticIdempotencyKey,
          status: "failed",
        });
      }
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
