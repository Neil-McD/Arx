import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectMessage, DirectMessageAttachment, DirectMessageConversation, DirectMessageRecipient } from "../../../../shared/communityTypes";
import {
  isLikelyImageFile,
  isSupportedChatRasterImage,
  readChatImageAsDataUrl,
} from "../../../../shared/attachmentHelpers";
import {
  clearCloudDirectTyping,
  createCloudDirectMessagesLiveClient,
  ensureCloudDirectConversationFromCommunity,
  listCloudEligibleDirectMessageRecipientsForViewer,
  listCloudDirectConversations,
  markCloudDirectConversationRead,
  subscribeCloudDirectConversations,
  sendCloudDirectMessage,
  subscribeCloudDirectMessages,
  uploadCloudDirectMessageAttachmentFile,
} from "../../../../shared/cloudDirectMessagesGateway";
import { useDirectMessageTypingPresence } from "../../../../shared/useDirectMessageTypingPresence";
import { WebDirectMessageInboxPanel } from "./WebDirectMessageInboxPanel";
import { WebDirectMessagePanel } from "./WebDirectMessagePanel";

type DirectMessageAttachmentDraft = DirectMessageAttachment & {
  data_url?: string | null;
  file?: File | null;
};

type DirectMessageAttachmentFileInput = FileList | readonly File[];

type DirectMessagePanelState = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  input: string;
  attachments: DirectMessageAttachmentDraft[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
};

export type DirectMessageOpenRequest = {
  requestId: number;
  targetUserId: string;
  communityId: string;
} | null;

type WebDirectMessagesHostProps<SessionT> = {
  isOpen: boolean;
  openRequest: DirectMessageOpenRequest;
  session: SessionT | null;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onUnreadCountChange?: (count: number) => void;
  onClose: () => void;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

const MAX_DM_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_DM_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_DM_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_DM_IMAGE_DATA_URL_CHARS = 600_000;

function createDirectAttachmentId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

function displayNameForDirectAttachmentFile(file: File, fallbackIndex: number): string {
  const existingName = String(file.name ?? "").trim();
  if (existingName) return existingName;
  const mime = String(file.type ?? "").toLowerCase();
  const extension =
    mime === "image/png"
      ? "png"
      : mime === "image/jpeg"
        ? "jpg"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : mime === "application/pdf"
              ? "pdf"
              : "bin";
  return `${mime.startsWith("image/") ? "Pasted image" : "Attachment"} ${fallbackIndex + 1}.${extension}`;
}

function isAllowedDirectAttachmentFile(file: File): boolean {
  const mime = String(file.type ?? "").toLowerCase();
  const name = String(file.name ?? "").toLowerCase();
  const blockedMimes = new Set([
    "application/gzip",
    "application/vnd.microsoft.portable-executable",
    "application/x-7z-compressed",
    "application/x-msdownload",
    "application/x-rar-compressed",
    "application/x-sh",
    "application/zip",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/svg+xml",
  ]);
  if (
    blockedMimes.has(mime) ||
    [".avif", ".heic", ".heif", ".svg", ".zip", ".rar", ".7z", ".gz", ".exe", ".sh"].some((extension) =>
      name.endsWith(extension),
    )
  ) {
    return false;
  }
  if (isLikelyImageFile(file, { allowAvif: false, allowSvg: false })) {
    return isSupportedChatRasterImage(file, { allowAvif: false, allowSvg: false });
  }
  const allowedMimes = new Set([
    "application/json",
    "application/msword",
    "application/pdf",
    "application/rtf",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "text/markdown",
    "text/plain",
  ]);
  if (mime && allowedMimes.has(mime)) return true;
  return [
    ".csv",
    ".doc",
    ".docx",
    ".json",
    ".md",
    ".pdf",
    ".ppt",
    ".pptx",
    ".rtf",
    ".txt",
    ".xls",
    ".xlsx",
  ].some((extension) => name.endsWith(extension));
}

async function ingestDirectMessageAttachmentsFromFileList(
  files: DirectMessageAttachmentFileInput,
  existing: DirectMessageAttachmentDraft[],
): Promise<{ attachments: DirectMessageAttachmentDraft[]; error: string | null }> {
  if (files.length === 0) return { attachments: existing, error: null };
  const remaining = Math.max(0, MAX_DM_ATTACHMENTS_PER_MESSAGE - existing.length);
  if (remaining === 0) {
    return {
      attachments: existing,
      error: `You can attach up to ${MAX_DM_ATTACHMENTS_PER_MESSAGE} files per message.`,
    };
  }

  const picked = Array.from(files).slice(0, remaining);
  const next: DirectMessageAttachmentDraft[] = [];
  let error: string | null = null;
  let totalBytes = existing.reduce((total, attachment) => total + Math.max(0, Math.floor(Number(attachment.size ?? 0))), 0);
  for (const [index, file] of picked.entries()) {
    if (!file) continue;
    const name = displayNameForDirectAttachmentFile(file, index);
    if (!isAllowedDirectAttachmentFile(file)) {
      error = `${name}: unsupported file type.`;
      continue;
    }
    if (file.size > MAX_DM_ATTACHMENT_BYTES) {
      error = `${name} is too large (max ${(MAX_DM_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB).`;
      continue;
    }
    if (totalBytes + file.size > MAX_DM_ATTACHMENT_TOTAL_BYTES) {
      error = `Attachments can be up to ${(MAX_DM_ATTACHMENT_TOTAL_BYTES / (1024 * 1024)).toFixed(0)}MB total per message.`;
      continue;
    }
    totalBytes += file.size;
    const isImage = isLikelyImageFile(file, { allowAvif: false, allowSvg: false });
    const base: DirectMessageAttachmentDraft = {
      id: createDirectAttachmentId(),
      name,
      type: isImage ? "image" : "file",
      mime: String(file.type ?? "").trim() || null,
      size: file.size,
      file,
    };
    if (isImage) {
      try {
        base.data_url = await readChatImageAsDataUrl(file, MAX_DM_IMAGE_DATA_URL_CHARS);
      } catch (readError) {
        error = toErrorMessage(readError, `${name}: failed to read image.`);
        continue;
      }
    }
    next.push(base);
  }
  return {
    attachments: [...existing, ...next],
    error,
  };
}

async function prepareDirectAttachmentsForSend<SessionT>(
  attachments: DirectMessageAttachmentDraft[],
  session: SessionT,
  conversationId: string,
): Promise<DirectMessageAttachmentDraft[]> {
  const prepared: DirectMessageAttachmentDraft[] = [];
  for (const attachment of attachments) {
    const currentStorageId = String(attachment.storage_id ?? "").trim();
    let nextStorageId = currentStorageId || null;
    if (!nextStorageId && attachment.file instanceof File) {
      nextStorageId = await uploadCloudDirectMessageAttachmentFile({
        session,
        conversationId,
        file: attachment.file,
      });
    }
    prepared.push({
      ...attachment,
      storage_id: nextStorageId,
      file: null,
    });
  }
  return prepared;
}

function serializeDirectAttachmentsForWrite(attachments: DirectMessageAttachmentDraft[]): unknown[] {
  const out: unknown[] = [];
  for (const attachment of attachments) {
    const storageId = String(attachment.storage_id ?? "").trim();
    if (!storageId) continue;
    out.push({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime ?? null,
      size: attachment.size,
      storageId,
    });
  }
  return out;
}

export function WebDirectMessagesHost<SessionT>(props: WebDirectMessagesHostProps<SessionT>) {
  const {
    isOpen,
    openRequest,
    session,
    sessionUserId,
    getInitials,
    getAvatarColor,
    renderTextWithLinks,
    onUnreadCountChange,
    onClose,
  } = props;
  const [conversations, setConversations] = useState<DirectMessageConversation[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [directMessagePanel, setDirectMessagePanel] = useState<DirectMessagePanelState | null>(null);
  const [isNewMessageMode, setIsNewMessageMode] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipients, setRecipients] = useState<DirectMessageRecipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const inboxLoadRequestRef = useRef(0);
  const recipientLoadRequestRef = useRef(0);
  const hasInboxLiveSubscriptionRef = useRef(false);
  const directMessageOpenRequestRef = useRef(0);
  const readMarkSeqByConversationRef = useRef<Record<string, number>>({});
  const typingInputHadTextRef = useRef(false);

  const activeConversationId = directMessagePanel?.conversation.id ?? null;
  const directTypingPresence = useDirectMessageTypingPresence({
    isEnabled: isOpen && Boolean(activeConversationId),
    session: session as any,
    conversationId: activeConversationId,
    canSendMessages: Boolean(session && directMessagePanel && !directMessagePanel.isSending),
    inputValue: directMessagePanel?.input ?? "",
  });

  const clearDirectTypingForConversation = useCallback(
    async (conversationId: string | null | undefined) => {
      const normalizedConversationId = String(conversationId ?? "").trim();
      if (!session || !normalizedConversationId) return;
      try {
        await clearCloudDirectTyping({
          session,
          conversationId: normalizedConversationId,
        });
      } catch {
        // Typing presence is opportunistic; message state stays authoritative.
      }
    },
    [session],
  );

  const loadInbox = useCallback(async () => {
    const requestId = inboxLoadRequestRef.current + 1;
    inboxLoadRequestRef.current = requestId;
    if (!session) {
      setConversations([]);
      setInboxError(null);
      setIsLoadingInbox(false);
      return;
    }
    setIsLoadingInbox(true);
    setInboxError(null);
    try {
      const rows = await listCloudDirectConversations({
        session,
        limit: 30,
      });
      if (inboxLoadRequestRef.current !== requestId) return;
      setConversations(rows);
    } catch (error) {
      if (inboxLoadRequestRef.current !== requestId) return;
      setInboxError(toErrorMessage(error, "Failed to load direct messages."));
    } finally {
      if (inboxLoadRequestRef.current !== requestId) return;
      setIsLoadingInbox(false);
    }
  }, [session]);

  const loadRecipients = useCallback(
    async (searchValue: string) => {
      const requestId = recipientLoadRequestRef.current + 1;
      recipientLoadRequestRef.current = requestId;
      if (!session) {
        setRecipients([]);
        setRecipientError("Sign in to start a direct message.");
        setIsLoadingRecipients(false);
        return;
      }
      setRecipients([]);
      setIsLoadingRecipients(true);
      setRecipientError(null);
      try {
        const rows = await listCloudEligibleDirectMessageRecipientsForViewer({
          session,
          search: searchValue,
          limit: 20,
        });
        if (recipientLoadRequestRef.current !== requestId) return;
        setRecipients(rows);
      } catch (error) {
        if (recipientLoadRequestRef.current !== requestId) return;
        setRecipients([]);
        setRecipientError(toErrorMessage(error, "Failed to load community members."));
      } finally {
        if (recipientLoadRequestRef.current !== requestId) return;
        setIsLoadingRecipients(false);
      }
    },
    [session],
  );

  useEffect(() => {
    readMarkSeqByConversationRef.current = {};
  }, [sessionUserId]);

  useEffect(() => {
    if (!activeConversationId || !session) {
      typingInputHadTextRef.current = false;
      return;
    }
    const conversationId = activeConversationId;
    return () => {
      typingInputHadTextRef.current = false;
      void clearDirectTypingForConversation(conversationId);
    };
  }, [activeConversationId, clearDirectTypingForConversation, session]);

  useEffect(() => {
    if (!isOpen || !isNewMessageMode) return;
    const timeoutId = window.setTimeout(() => {
      void loadRecipients(recipientSearch);
    }, 160);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isNewMessageMode, isOpen, loadRecipients, recipientSearch]);

  useEffect(() => {
    const unreadCount = conversations.reduce((total, conversation) => {
      const count = Number(conversation.unread_count ?? 0);
      if (!Number.isFinite(count)) return total;
      return total + Math.max(0, Math.floor(count));
    }, 0);
    onUnreadCountChange?.(unreadCount);
  }, [conversations, onUnreadCountChange]);

  const markConversationRead = useCallback(
    async (conversationId: string, throughSeq: number) => {
      const normalizedConversationId = String(conversationId ?? "").trim();
      const seq = Math.max(0, Math.floor(Number(throughSeq ?? 0)));
      if (!session || !normalizedConversationId || seq <= 0) return;
      const previousSeq = readMarkSeqByConversationRef.current[normalizedConversationId] ?? 0;
      if (seq <= previousSeq) return;
      readMarkSeqByConversationRef.current[normalizedConversationId] = seq;

      try {
        const updatedConversation = await markCloudDirectConversationRead({
          session,
          conversationId: normalizedConversationId,
        });
        readMarkSeqByConversationRef.current[normalizedConversationId] = Math.max(
          seq,
          Math.max(0, Math.floor(Number(updatedConversation.viewer_last_read_seq ?? 0))),
        );
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === updatedConversation.id ? updatedConversation : conversation,
          ),
        );
        setDirectMessagePanel((previous) =>
          previous?.conversation.id === updatedConversation.id
            ? {
                ...previous,
                conversation: updatedConversation,
              }
            : previous,
        );
      } catch {
        readMarkSeqByConversationRef.current[normalizedConversationId] = previousSeq;
      }
    },
    [session],
  );

  useEffect(() => {
    hasInboxLiveSubscriptionRef.current = false;
    if (!session) {
      setConversations([]);
      setIsLoadingInbox(false);
      return;
    }

    let isDisposed = false;
    let unsubscribe = () => {};
    let liveClient: ReturnType<typeof createCloudDirectMessagesLiveClient> | null = null;
    hasInboxLiveSubscriptionRef.current = true;
    setIsLoadingInbox(true);
    setInboxError(null);

    try {
      liveClient = createCloudDirectMessagesLiveClient({ session });
      unsubscribe = subscribeCloudDirectConversations<DirectMessageConversation>({
        liveClient,
        limit: 30,
        onUpdate: (rows) => {
          if (isDisposed) return;
          setConversations(rows);
          setIsLoadingInbox(false);
          setInboxError(null);
        },
        onError: (error) => {
          if (isDisposed) return;
          setIsLoadingInbox(false);
          setInboxError(toErrorMessage(error, "Failed to load direct messages."));
        },
      });
    } catch (error) {
      hasInboxLiveSubscriptionRef.current = false;
      setIsLoadingInbox(false);
      setInboxError(toErrorMessage(error, "Failed to load direct messages."));
      void loadInbox();
    }

    return () => {
      isDisposed = true;
      hasInboxLiveSubscriptionRef.current = false;
      unsubscribe();
      liveClient?.close();
    };
  }, [loadInbox, session]);

  useEffect(() => {
    if (!isOpen || !openRequest) return;
    const requestId = openRequest.requestId;
    directMessageOpenRequestRef.current = requestId;

    const targetUserId = String(openRequest.targetUserId ?? "").trim();
    const communityId = String(openRequest.communityId ?? "").trim();
    if (!session || !targetUserId || !communityId) {
      setDirectMessagePanel(null);
      setInboxError("Failed to open direct message.");
      setIsLoadingInbox(false);
      return;
    }

    let isDisposed = false;
    setIsNewMessageMode(false);
    setDirectMessagePanel(null);
    setInboxError(null);
    setIsLoadingInbox(true);

    void ensureCloudDirectConversationFromCommunity({
      session,
      targetUserId,
      communityId,
    })
      .then((conversation) => {
        if (isDisposed || directMessageOpenRequestRef.current !== requestId) return;
        setInboxError(null);
        setIsLoadingInbox(false);
        setDirectMessagePanel({
          conversation,
          messages: [],
          input: "",
          attachments: [],
          isLoading: true,
          isSending: false,
          error: null,
        });
        void markConversationRead(conversation.id, conversation.last_seq);
      })
      .catch((error) => {
        if (isDisposed || directMessageOpenRequestRef.current !== requestId) return;
        setDirectMessagePanel(null);
        setInboxError(toErrorMessage(error, "Failed to open direct message."));
        setIsLoadingInbox(false);
      });

    return () => {
      isDisposed = true;
    };
  }, [isOpen, markConversationRead, openRequest, session]);

  useEffect(() => {
    if (!isOpen) {
      recipientLoadRequestRef.current += 1;
      setDirectMessagePanel(null);
      setIsNewMessageMode(false);
      setRecipientSearch("");
      setRecipients([]);
      setRecipientError(null);
      setIsLoadingRecipients(false);
      return;
    }
    if (activeConversationId) return;
    if (hasInboxLiveSubscriptionRef.current) return;
    void loadInbox();
  }, [activeConversationId, isOpen, loadInbox]);

  useEffect(() => {
    if (!isOpen || !activeConversationId || !session) return;

    let isDisposed = false;
    let unsubscribe = () => {};
    let liveClient: ReturnType<typeof createCloudDirectMessagesLiveClient> | null = null;

    try {
      liveClient = createCloudDirectMessagesLiveClient({ session });
      unsubscribe = subscribeCloudDirectMessages<DirectMessage>({
        liveClient,
        conversationId: activeConversationId,
        limit: 100,
        onUpdate: (messages) => {
          if (isDisposed) return;
          setDirectMessagePanel((previous) =>
            previous?.conversation.id === activeConversationId
              ? {
                  ...previous,
                  messages,
                  isLoading: false,
                  error: null,
                }
              : previous,
          );
        },
        onError: (error) => {
          if (isDisposed) return;
          setDirectMessagePanel((previous) =>
            previous?.conversation.id === activeConversationId
              ? {
                  ...previous,
                  isLoading: false,
                  error: toErrorMessage(error, "Failed to load direct messages."),
                }
              : previous,
          );
        },
      });
    } catch (error) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === activeConversationId
          ? {
              ...previous,
              isLoading: false,
              error: toErrorMessage(error, "Failed to load direct messages."),
            }
          : previous,
      );
    }

    return () => {
      isDisposed = true;
      unsubscribe();
      liveClient?.close();
    };
  }, [activeConversationId, isOpen, session]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const host = document.querySelector(".web-direct-messages-host");
      if (host?.contains(target)) return;
      if (target instanceof Element && target.closest(".direct-messages-topbar-button")) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const openConversation = useCallback(
    (conversation: DirectMessageConversation) => {
      setIsNewMessageMode(false);
      setDirectMessagePanel({
        conversation,
        messages: [],
        input: "",
        attachments: [],
        isLoading: true,
        isSending: false,
        error: null,
      });
      void markConversationRead(conversation.id, conversation.last_seq);
    },
    [markConversationRead],
  );

  const openNewMessageMode = useCallback(() => {
    if (!session) return;
    recipientLoadRequestRef.current += 1;
    setDirectMessagePanel(null);
    setRecipientSearch("");
    setRecipients([]);
    setRecipientError(null);
    setIsLoadingRecipients(false);
    setIsNewMessageMode(true);
  }, [session]);

  const closeNewMessageMode = useCallback(() => {
    recipientLoadRequestRef.current += 1;
    setIsNewMessageMode(false);
    setRecipientSearch("");
    setRecipients([]);
    setRecipientError(null);
    setIsLoadingRecipients(false);
  }, []);

  const startConversationWithRecipient = useCallback(
    async (recipient: DirectMessageRecipient) => {
      const targetUserId = String(recipient.user_id ?? "").trim();
      const communityId = String(recipient.community_id ?? "").trim();
      if (!session || !targetUserId || !communityId) return;
      setRecipientError(null);
      setIsLoadingRecipients(true);
      try {
        const conversation = await ensureCloudDirectConversationFromCommunity({
          session,
          targetUserId,
          communityId,
        });
        setConversations((previous) => [
          conversation,
          ...previous.filter((row) => row.id !== conversation.id),
        ]);
        setIsNewMessageMode(false);
        setDirectMessagePanel({
          conversation,
          messages: [],
          input: "",
          attachments: [],
          isLoading: true,
          isSending: false,
          error: null,
        });
        void markConversationRead(conversation.id, conversation.last_seq);
      } catch (error) {
        setRecipientError(toErrorMessage(error, "Failed to open direct message."));
      } finally {
        setIsLoadingRecipients(false);
      }
    },
    [markConversationRead, session],
  );

  const sendDirectMessage = useCallback(async () => {
    const current = directMessagePanel;
    const text = String(current?.input ?? "").trim();
    const attachmentsToSend = [...(current?.attachments ?? [])];
    if (!current || (!text && attachmentsToSend.length === 0) || !session) return;
    setDirectMessagePanel((previous) =>
      previous?.conversation.id === current.conversation.id
        ? {
            ...previous,
            isSending: true,
            error: null,
          }
        : previous,
    );
    try {
      const preparedAttachments = await prepareDirectAttachmentsForSend(
        attachmentsToSend,
        session,
        current.conversation.id,
      );
      const serializedAttachments = serializeDirectAttachmentsForWrite(preparedAttachments);
      await sendCloudDirectMessage({
        session,
        conversationId: current.conversation.id,
        text,
        attachments: serializedAttachments,
      });
      await clearDirectTypingForConversation(current.conversation.id);
      typingInputHadTextRef.current = false;
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              input: "",
              attachments: [],
              isSending: false,
              error: null,
            }
          : previous,
      );
    } catch (error) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              isSending: false,
              error: toErrorMessage(error, "Failed to send direct message."),
            }
          : previous,
      );
    }
  }, [clearDirectTypingForConversation, directMessagePanel, session]);

  const handleDirectAttachmentFilesSelected = useCallback(
    async (files: DirectMessageAttachmentFileInput) => {
      const current = directMessagePanel;
      if (!current || files.length === 0) return;
      const result = await ingestDirectMessageAttachmentsFromFileList(files, current.attachments);
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              attachments: result.attachments,
              error: result.error,
            }
          : previous,
      );
    },
    [directMessagePanel],
  );

  const removeDirectAttachment = useCallback((id: string) => {
    const attachmentId = String(id ?? "").trim();
    if (!attachmentId) return;
    setDirectMessagePanel((previous) =>
      previous
        ? {
            ...previous,
            attachments: previous.attachments.filter((attachment) => attachment.id !== attachmentId),
            error: null,
          }
        : previous,
    );
  }, []);

  if (!isOpen) return null;

  return (
    <div className="web-direct-messages-host">
      {directMessagePanel ? (
        <WebDirectMessagePanel
          conversation={directMessagePanel.conversation}
          messages={directMessagePanel.messages}
          input={directMessagePanel.input}
          isLoading={directMessagePanel.isLoading}
          isSending={directMessagePanel.isSending}
          error={directMessagePanel.error}
          attachments={directMessagePanel.attachments}
          typingPresence={directTypingPresence}
          sessionUserId={sessionUserId}
          getInitials={getInitials}
          getAvatarColor={getAvatarColor}
          renderTextWithLinks={renderTextWithLinks}
          onInputChange={(value) => {
            const nextHasText = value.trim().length > 0;
            if (!nextHasText && typingInputHadTextRef.current) {
              void clearDirectTypingForConversation(directMessagePanel.conversation.id);
            }
            typingInputHadTextRef.current = nextHasText;
            setDirectMessagePanel((previous) =>
              previous
                ? {
                    ...previous,
                    input: value,
                  }
                : previous,
            );
          }}
          onSend={sendDirectMessage}
          onAttachmentFilesSelected={handleDirectAttachmentFilesSelected}
          onRemoveAttachment={removeDirectAttachment}
          onComposerBlur={() => {
            typingInputHadTextRef.current = false;
            void clearDirectTypingForConversation(directMessagePanel.conversation.id);
          }}
          onReadThroughSeq={(seq) => {
            void markConversationRead(directMessagePanel.conversation.id, seq);
          }}
          onBackToInbox={() => {
            typingInputHadTextRef.current = false;
            void clearDirectTypingForConversation(directMessagePanel.conversation.id);
            setDirectMessagePanel(null);
          }}
        />
      ) : (
        <WebDirectMessageInboxPanel
          conversations={conversations}
          isLoading={isLoadingInbox}
          error={inboxError}
          isNewMessageMode={isNewMessageMode}
          canStartConversation={Boolean(session)}
          recipients={recipients}
          recipientSearch={recipientSearch}
          isLoadingRecipients={isLoadingRecipients}
          recipientError={recipientError}
          sessionUserId={sessionUserId}
          getInitials={getInitials}
          getAvatarColor={getAvatarColor}
          onSelectConversation={openConversation}
          onOpenNewMessage={openNewMessageMode}
          onCloseNewMessage={closeNewMessageMode}
          onRecipientSearchChange={setRecipientSearch}
          onSelectRecipient={startConversationWithRecipient}
        />
      )}
    </div>
  );
}
