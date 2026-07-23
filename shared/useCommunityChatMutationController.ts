import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { resolveAuthSubject } from "./authSession";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { textContainsMentionToken } from "./communityMentionRendering";

type EverybodyMentionEmailMode = "in_app_only" | "in_app_and_email";

type EverybodyMentionSendConfirmation = {
  text: string;
  emailMode: EverybodyMentionEmailMode | null;
  emailCooldownUntil: string | null;
};

type SessionLike = {
  user: { id: string };
};

type CommunityReplyTarget = {
  sender_id: string;
  interaction_root_id: string;
  interaction_reply_id: string | null;
};

export type CommunityMessageSendDraft<AttachmentT> = {
  text?: string;
  attachments?: AttachmentT[];
  mentions?: {
    userId: string;
    displayName: string;
    token: string;
    kind?: "user" | "community_agent" | "role";
    agentKey?: string;
    roleKey?: "everybody";
    emailMode?: EverybodyMentionEmailMode | null;
    emailCooldownUntil?: string | null;
  }[];
  replyingToMessage?: CommunityReplyTarget | null;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null> | null;
  clearDraft?: () => void;
  restoreDraft?: () => void;
};

type UseCommunityChatMutationControllerArgs<
  SessionT extends SessionLike,
  AttachmentT,
> = {
  activeCommunityId: string | null;
  canMentionEverybodyRef?: MutableRefObject<boolean>;
  session: SessionT | null;
  sessionUserId: string | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  createCommunityInteractionMessageRows?: (params: {
    session: SessionT;
    communityId: string;
    idempotencyKey: string;
    text: string;
    rootId?: string | null;
    targetReplyId?: string | null;
    mentions?: { userId?: string; agentKey?: string; roleKey?: string }[];
    attachments?: unknown[];
  }) => Promise<unknown>;
  onCanonicalOptimisticInsert?: (pending: {
    idempotencyKey: string;
    communityId: string;
    kind: "root" | "reply";
    rootId: string | null;
    targetReplyId: string | null;
    text: string;
    attachments: AttachmentT[];
    serializedAttachments: unknown[];
    createdAt: string;
    senderId: string;
  }) => void;
  onCanonicalOptimisticSettle?: (settle: { idempotencyKey: string; status: "failed" }) => void;
  beforeSendValidate?: (text: string) => Promise<string | null>;
  confirmEverybodyMentionSend?: (confirmation: EverybodyMentionSendConfirmation) => Promise<boolean> | boolean;
  prepareAttachmentsForSend?: (
    attachments: AttachmentT[],
    session: SessionT,
    communityId: string,
  ) => Promise<AttachmentT[]>;
  serializeAttachmentsForWrite?: (attachments: AttachmentT[]) => unknown[];
  onOptimisticSendScrollIntent?: () => void;
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
  communityMessageMentions?: {
    userId: string;
    displayName: string;
    token: string;
    kind?: "user" | "community_agent" | "role";
    agentKey?: string;
    roleKey?: "everybody";
    emailMode?: EverybodyMentionEmailMode | null;
    emailCooldownUntil?: string | null;
  }[];
  setCommunityMessageInput: Dispatch<SetStateAction<string>>;
  setCommunityAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  setIsSendingCommunityMessage: Dispatch<SetStateAction<boolean>>;
  setCommunityChatError: Dispatch<SetStateAction<string | null>>;
};

const EVERYBODY_MENTION_ROLE_KEY = "everybody";
const EVERYBODY_MENTION_TOKENS = ["@everybody", "@everyone"] as const;

function mentionTokenIsEverybody(rawToken: unknown): boolean {
  const token = String(rawToken ?? "").trim().toLowerCase();
  return EVERYBODY_MENTION_TOKENS.some((candidate) => token === candidate);
}

function textContainsEverybodyMentionToken(text: string): boolean {
  return EVERYBODY_MENTION_TOKENS.some((token) => textContainsMentionToken(text, token));
}

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
  if (
    message.includes("community_interaction_reply_target_unmapped") ||
    message.includes("interaction_target_reply_invalid") ||
    message.includes("interaction_target_reply_requires_root")
  ) {
    return "Reply target is unavailable. Reopen the thread and try again.";
  }
  if (message.includes("community_interaction_writer_missing")) {
    return "Community chat is unavailable. Refresh and try again.";
  }
  if (message.includes("interaction_mention_everybody_reply_not_allowed")) {
    return "@everybody can only be used in top-level community posts.";
  }
  if (message.includes("interaction_mention_everybody_edit_create_not_allowed")) {
    return "Create a new top-level post to notify everybody.";
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

function resolveCanonicalCommunityChatSendRoute(args: {
  hasCanonicalWriter: boolean;
  activeCommunityId: string;
  hasReplyTarget: boolean;
  replyRootId: string | null;
}): { rootId: string | null; idempotencyKey: string } {
  if (!args.hasCanonicalWriter) {
    throw new Error("community_interaction_writer_missing");
  }
  if (args.hasReplyTarget && !args.replyRootId) {
    throw new Error("community_interaction_reply_target_unmapped");
  }
  return {
    rootId: args.replyRootId,
    idempotencyKey: createCommunityComposerIdempotencyKey(args.activeCommunityId, args.replyRootId),
  };
}

export function useCommunityChatMutationController<
  SessionT extends SessionLike,
  AttachmentT,
>(args: UseCommunityChatMutationControllerArgs<SessionT, AttachmentT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const resolveRuntimeSessionUserId = useCallback((session: SessionT): string | null => {
    const explicit = String(argsRef.current.sessionUserId ?? "").trim();
    if (explicit) return explicit;
    return resolveAuthSubject(session as any);
  }, []);

  const handleSendCommunityMessage = useCallback(async (
    draft?: CommunityMessageSendDraft<AttachmentT>,
  ) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return;
    const activeCommunityId = current.activeCommunityId;
    const sessionUserId = resolveRuntimeSessionUserId(session);
    if (!sessionUserId) return;

    const rawText = String(draft?.text ?? current.communityMessageInput).trim();
    const attachmentsToSend = draft?.attachments
      ? [...draft.attachments]
      : [...current.communityAttachmentsRef.current];
    if (!rawText && attachmentsToSend.length === 0) return;

    const replySnapshot = draft?.replyingToMessage ?? null;
    const replyRootId = String(replySnapshot?.interaction_root_id ?? "").trim() || null;
    const targetReplyId = String(replySnapshot?.interaction_reply_id ?? "").trim() || null;
    const bodyToSend = rawText;
    const isReplySend = Boolean(replySnapshot);
    if (isReplySend && textContainsEverybodyMentionToken(bodyToSend)) {
      current.setCommunityChatError("@everybody can only be used in top-level community posts.");
      return;
    }

    // Keep only mentions whose exact inserted token still appears as a real
    // mention token in the sent text. User tokens are @handle; display names
    // are never mention identity. Non-user mentions serialize by canonical key.
    const mentionDraft = draft?.mentions ?? current.communityMessageMentions ?? [];
    const mentionsToSend: { userId?: string; agentKey?: string; roleKey?: string }[] = [];
    const seenMentionKeys = new Set<string>();
    for (const mention of mentionDraft) {
      const mentionKey =
        mention.kind === "role"
          ? `role:${mention.roleKey ?? "everybody"}`
          : mention.kind === "community_agent"
            ? `agent:${mention.agentKey ?? "community_agent"}`
            : `user:${mention.userId}`;
      if (!mentionKey || seenMentionKeys.has(mentionKey)) continue;
      if (!textContainsMentionToken(bodyToSend, mention.token)) continue;
      seenMentionKeys.add(mentionKey);
      if (mention.kind === "role") {
        mentionsToSend.push({ roleKey: mention.roleKey ?? "everybody" });
        continue;
      }
      if (mention.kind === "community_agent") {
        mentionsToSend.push({ agentKey: mention.agentKey ?? "community_agent" });
        continue;
      }
      if (!mention.userId) continue;
      mentionsToSend.push({ userId: mention.userId });
    }
    const committedEverybodyMention = mentionDraft.find(
      (mention) =>
        (mention.kind === "role" || mentionTokenIsEverybody(mention.token)) &&
        (mention.roleKey ?? EVERYBODY_MENTION_ROLE_KEY) === EVERYBODY_MENTION_ROLE_KEY &&
        textContainsMentionToken(bodyToSend, mention.token),
    );
    if (
      current.canMentionEverybodyRef?.current &&
      !isReplySend &&
      !seenMentionKeys.has(`role:${EVERYBODY_MENTION_ROLE_KEY}`) &&
      !committedEverybodyMention &&
      textContainsEverybodyMentionToken(bodyToSend)
    ) {
      mentionsToSend.push({ roleKey: EVERYBODY_MENTION_ROLE_KEY });
    }

    if (current.beforeSendValidate) {
      const validationError = await current.beforeSendValidate(bodyToSend);
      if (validationError) {
        current.setCommunityChatError(validationError);
        return;
      }
    }
    if (
      mentionsToSend.some((mention) => mention.roleKey === EVERYBODY_MENTION_ROLE_KEY) &&
      current.confirmEverybodyMentionSend
    ) {
      const confirmed = await current.confirmEverybodyMentionSend({
        text: bodyToSend,
        emailMode: committedEverybodyMention?.emailMode ?? null,
        emailCooldownUntil: committedEverybodyMention?.emailCooldownUntil ?? null,
      });
      if (!confirmed) return;
    }

    const optimisticCreatedAt = new Date().toISOString();

    const restoreDraft = () => {
      if (draft?.restoreDraft) {
        draft.restoreDraft();
        return;
      }
      current.setCommunityMessageInput(rawText);
      current.setCommunityAttachments(attachmentsToSend);
    };

    if (draft?.clearDraft) {
      draft.clearDraft();
    } else {
      current.setCommunityMessageInput("");
      current.setCommunityAttachments([]);
    }
    current.onOptimisticSendScrollIntent?.();

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
      const sendRoute = resolveCanonicalCommunityChatSendRoute({
        hasCanonicalWriter: Boolean(createCanonicalMessageRows),
        activeCommunityId,
        hasReplyTarget: Boolean(replySnapshot),
        replyRootId,
      });

      if (current.onCanonicalOptimisticInsert) {
        canonicalOptimisticIdempotencyKey = sendRoute.idempotencyKey;
        current.onCanonicalOptimisticInsert({
          idempotencyKey: sendRoute.idempotencyKey,
          communityId: activeCommunityId,
          kind: sendRoute.rootId ? "reply" : "root",
          rootId: sendRoute.rootId,
          targetReplyId,
          text: bodyToSend,
          attachments: preparedAttachments,
          serializedAttachments,
          createdAt: optimisticCreatedAt,
          senderId: sessionUserId,
        });
      }

      if (!createCanonicalMessageRows) throw new Error("community_interaction_writer_missing");
      await createCanonicalMessageRows({
        session,
        communityId: activeCommunityId,
        idempotencyKey: sendRoute.idempotencyKey,
        text: bodyToSend,
        rootId: sendRoute.rootId,
        targetReplyId,
        mentions: mentionsToSend,
        attachments: serializedAttachments,
      });
      current.onCommunityMessageSent?.({
        communityId: activeCommunityId,
        messageId: sendRoute.idempotencyKey,
        hasAttachments: preparedAttachments.length > 0,
        hasReply: Boolean(replySnapshot),
      });
    } catch (error) {
      if (isProfileSetupRequiredError(error)) {
        current.onProfileSetupRequired?.();
      }
      current.setCommunityChatError(mapCommunityChatMutationErrorMessage(error));
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
    handleSendCommunityMessage,
  };
}
