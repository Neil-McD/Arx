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
import {
  useWebVoiceInputController,
  type VoiceToolBalanceDetails,
} from "../../../../shared/useWebVoiceInputController";
import { mergeVoiceTranscript } from "../../../../shared/voiceCapture";
import { WebDirectMessageInboxPanel } from "./WebDirectMessageInboxPanel";
import { WebDirectMessagePanel } from "./WebDirectMessagePanel";

type DirectMessageAttachmentDraft = DirectMessageAttachment & {
  data_url?: string | null;
  file?: File | null;
  uploadStatus?: "queued" | "uploading" | "ready" | "failed";
  uploadError?: string | null;
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
  ensureSession?: (session?: SessionT | null, source?: string) => Promise<SessionT | null>;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  requireSignIn?: () => void;
  showAppToastMessage?: (message: string) => void;
  onVoiceToolBalanceRequired?: (message: string, details?: VoiceToolBalanceDetails) => void;
  onUnreadCountChange?: (count: number) => void;
  onClose: () => void;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

async function resolveDirectMessageSession<SessionT>(
  session: SessionT | null,
  ensureSession: WebDirectMessagesHostProps<SessionT>["ensureSession"],
  source: string,
): Promise<SessionT | null> {
  if (!session) return null;
  if (!ensureSession) return session;
  return ensureSession(session, source);
}

const MAX_DM_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_DM_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_DM_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_DM_IMAGE_DATA_URL_CHARS = 600_000;
const DIRECT_MESSAGE_COMPOSER_FOCUS_MEDIA_QUERY = "(min-width: 901px)";

function isDirectMessageComposerEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const selector = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[contenteditable='plaintext-only']",
  ].join(",");
  return Boolean(element.closest(selector));
}

function shouldPreserveDirectMessageComposerFocus(activeElement: Element | null, input: HTMLTextAreaElement): boolean {
  if (!activeElement) return false;
  if (activeElement === input) return true;
  if (activeElement === document.body || activeElement === document.documentElement) return false;
  if (isDirectMessageComposerEditableElement(activeElement)) return true;
  return Boolean(
    activeElement.closest(
      [
        ".modal",
        ".modal-overlay",
        "[role='dialog']:not(.community-dm-panel)",
        ".community-dm-recipient-search",
      ].join(","),
    ),
  );
}

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

function getDirectAttachmentUploadStatus(attachment: DirectMessageAttachmentDraft): "queued" | "uploading" | "ready" | "failed" {
  if (String(attachment.storage_id ?? "").trim()) return "ready";
  if (attachment.uploadStatus) return attachment.uploadStatus;
  if (attachment.file instanceof File) return "queued";
  return "failed";
}

function hasUnreadyDirectAttachments(attachments: DirectMessageAttachmentDraft[]): boolean {
  return attachments.some((attachment) => getDirectAttachmentUploadStatus(attachment) !== "ready");
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
      uploadStatus: "queued",
      uploadError: null,
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

function serializeDirectAttachmentsForWrite(attachments: DirectMessageAttachmentDraft[]): unknown[] {
  const out: unknown[] = [];
  for (const attachment of attachments) {
    if (getDirectAttachmentUploadStatus(attachment) !== "ready") continue;
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
    ensureSession,
    sessionUserId,
    getInitials,
    getAvatarColor,
    renderTextWithLinks,
    requireSignIn,
    showAppToastMessage,
    onVoiceToolBalanceRequired,
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
  const sessionRef = useRef<SessionT | null>(session);
  const directMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDirectMessageFocusConversationRef = useRef<string | null>(null);
  const voiceConversationIdRef = useRef<string | null>(null);
  const pendingVoiceTranscriptConversationIdRef = useRef<string | null>(null);
  const [isDesktopDirectMessageFocusViewport, setIsDesktopDirectMessageFocusViewport] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(DIRECT_MESSAGE_COMPOSER_FOCUS_MEDIA_QUERY).matches,
  );

  const activeConversationId = directMessagePanel?.conversation.id ?? null;

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(DIRECT_MESSAGE_COMPOSER_FOCUS_MEDIA_QUERY);
    const applyViewport = (matches: boolean) => {
      setIsDesktopDirectMessageFocusViewport(matches);
    };
    applyViewport(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => applyViewport(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  const showDirectVoiceMessage = useCallback(
    (message: string) => {
      const normalized = message.trim() || "Voice transcription failed.";
      if (showAppToastMessage) {
        showAppToastMessage(normalized);
        return;
      }
      setDirectMessagePanel((previous) =>
        previous
          ? {
              ...previous,
              error: normalized,
            }
          : previous,
      );
    },
    [showAppToastMessage],
  );

  const appendDirectMessageTranscript = useCallback((transcript: string) => {
    const normalized = transcript.trim();
    if (!normalized) return;
    const targetConversationId = pendingVoiceTranscriptConversationIdRef.current;
    if (!targetConversationId) return;
    pendingVoiceTranscriptConversationIdRef.current = null;
    setDirectMessagePanel((previous) => {
      if (!previous) return previous;
      if (previous.conversation.id !== targetConversationId) return previous;
      const input = mergeVoiceTranscript(previous.input, normalized);
      typingInputHadTextRef.current = input.trim().length > 0;
      return {
        ...previous,
        input,
        error: null,
      };
    });
  }, []);

  const focusDirectMessageInput = useCallback((options?: { force?: boolean }) => {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    if (!isDesktopDirectMessageFocusViewport) return false;
    const input = directMessageInputRef.current;
    if (!input || input.disabled || input.readOnly) return false;

    if (!options?.force) {
      const activeElement = document.activeElement;
      if (activeElement instanceof Element) {
        if (shouldPreserveDirectMessageComposerFocus(activeElement, input)) return activeElement === input;
      }
    }

    window.requestAnimationFrame(() => {
      if (!input.isConnected || input.disabled || input.readOnly) return;
      if (!options?.force) {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof Element &&
          shouldPreserveDirectMessageComposerFocus(activeElement, input) &&
          activeElement !== input
        ) {
          return;
        }
      }
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        // Selection can fail for platform-managed textarea states; focus still succeeded.
      }
    });
    return true;
  }, [isDesktopDirectMessageFocusViewport]);

  useEffect(() => {
    if (!isOpen || !activeConversationId) {
      lastDirectMessageFocusConversationRef.current = null;
      return;
    }
    if (lastDirectMessageFocusConversationRef.current === activeConversationId) return;
    lastDirectMessageFocusConversationRef.current = activeConversationId;
    focusDirectMessageInput({ force: true });
  }, [activeConversationId, focusDirectMessageInput, isOpen]);

  const {
    directMessageVoiceIntent,
    directMessageVoiceUiState,
    handleVoiceInputClick: handleDirectMessageVoiceInputClick,
    cancelVoiceInput: cancelDirectMessageVoiceInput,
  } = useWebVoiceInputController<SessionT>({
    session,
    sessionRef,
    ensureSession: ensureSession
      ? (currentSession) => ensureSession(currentSession, "direct_messages_voice")
      : undefined,
    activeCommunity: null,
    activeCommunityFunnelAction: null,
    canPostMessagesActiveCommunity: true,
    requireSignIn: () => {
      if (requireSignIn) {
        requireSignIn();
        return;
      }
      showDirectVoiceMessage("Sign in to use voice input in direct messages.");
    },
    showAppToastMessage: showDirectVoiceMessage,
    onToolBalanceRequired: (_surface, message, details) => {
      if (onVoiceToolBalanceRequired) {
        onVoiceToolBalanceRequired(message, details);
        return;
      }
      showDirectVoiceMessage(message.trim() || "Add balance to use voice input.");
    },
    appendDirectMessageTranscript,
    focusDirectMessageInput,
  });

  useEffect(() => {
    const previousConversationId = voiceConversationIdRef.current;
    voiceConversationIdRef.current = activeConversationId;
    if (!isOpen || !activeConversationId) {
      pendingVoiceTranscriptConversationIdRef.current = null;
      cancelDirectMessageVoiceInput();
      return;
    }
    if (previousConversationId && previousConversationId !== activeConversationId) {
      pendingVoiceTranscriptConversationIdRef.current = null;
      cancelDirectMessageVoiceInput();
    }
  }, [activeConversationId, cancelDirectMessageVoiceInput, isOpen]);

  const directTypingPresence = useDirectMessageTypingPresence({
    isEnabled: isOpen && Boolean(activeConversationId),
    session: session as any,
    ensureSession: ensureSession as any,
    conversationId: activeConversationId,
    canSendMessages: Boolean(session && directMessagePanel && !directMessagePanel.isSending),
    inputValue: directMessagePanel?.input ?? "",
  });

  const clearDirectTypingForConversation = useCallback(
    async (conversationId: string | null | undefined) => {
      const normalizedConversationId = String(conversationId ?? "").trim();
      if (!session || !normalizedConversationId) return;
      try {
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_clear_typing",
        );
        if (!usableSession) return;
        await clearCloudDirectTyping({
          session: usableSession,
          conversationId: normalizedConversationId,
        });
      } catch {
        // Typing presence is opportunistic; message state stays authoritative.
      }
    },
    [ensureSession, session],
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
      const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_inbox");
      if (inboxLoadRequestRef.current !== requestId) return;
      if (!usableSession) {
        setConversations([]);
        setInboxError(null);
        return;
      }
      const rows = await listCloudDirectConversations({
        session: usableSession,
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
  }, [ensureSession, session]);

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
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_recipients",
        );
        if (recipientLoadRequestRef.current !== requestId) return;
        if (!usableSession) {
          setRecipients([]);
          setRecipientError("Sign in to start a direct message.");
          return;
        }
        const rows = await listCloudEligibleDirectMessageRecipientsForViewer({
          session: usableSession,
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
    [ensureSession, session],
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
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_mark_read",
        );
        if (!usableSession) {
          readMarkSeqByConversationRef.current[normalizedConversationId] = previousSeq;
          return;
        }
        const updatedConversation = await markCloudDirectConversationRead({
          session: usableSession,
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
    [ensureSession, session],
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

    void (async () => {
      try {
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_live_inbox",
        );
        if (isDisposed) return;
        if (!usableSession) {
          hasInboxLiveSubscriptionRef.current = false;
          setConversations([]);
          setIsLoadingInbox(false);
          setInboxError(null);
          return;
        }
        liveClient = createCloudDirectMessagesLiveClient({ session: usableSession });
        if (isDisposed) {
          liveClient.close();
          return;
        }
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
        if (isDisposed) return;
        hasInboxLiveSubscriptionRef.current = false;
        setIsLoadingInbox(false);
        setInboxError(toErrorMessage(error, "Failed to load direct messages."));
        void loadInbox();
      }
    })();

    return () => {
      isDisposed = true;
      hasInboxLiveSubscriptionRef.current = false;
      unsubscribe();
      liveClient?.close();
    };
  }, [ensureSession, loadInbox, session]);

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

    void (async () => {
      const usableSession = await resolveDirectMessageSession(
        session,
        ensureSession,
        "direct_messages_open_from_community",
      );
      if (!usableSession) throw new Error("Sign in to open direct messages.");
      return ensureCloudDirectConversationFromCommunity({
        session: usableSession,
        targetUserId,
        communityId,
      });
    })()
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
  }, [ensureSession, isOpen, markConversationRead, openRequest, session]);

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

    void (async () => {
      try {
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_live_messages",
        );
        if (isDisposed) return;
        if (!usableSession) {
          setDirectMessagePanel((previous) =>
            previous?.conversation.id === activeConversationId
              ? {
                  ...previous,
                  isLoading: false,
                  error: "Sign in to view direct messages.",
                }
              : previous,
          );
          return;
        }
        liveClient = createCloudDirectMessagesLiveClient({ session: usableSession });
        if (isDisposed) {
          liveClient.close();
          return;
        }
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
      }
    })();

    return () => {
      isDisposed = true;
      unsubscribe();
      liveClient?.close();
    };
  }, [activeConversationId, ensureSession, isOpen, session]);

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
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_start_conversation",
        );
        if (!usableSession) throw new Error("Sign in to open direct messages.");
        const conversation = await ensureCloudDirectConversationFromCommunity({
          session: usableSession,
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
    [ensureSession, markConversationRead, session],
  );

  const uploadDirectAttachmentDraft = useCallback(
    async (conversationId: string, attachment: DirectMessageAttachmentDraft) => {
      const attachmentId = String(attachment.id ?? "").trim();
      if (!attachmentId) return;
      if (!session) {
        setDirectMessagePanel((previous) =>
          previous?.conversation.id === conversationId
            ? {
                ...previous,
                attachments: previous.attachments.map((item) =>
                  item.id === attachmentId
                    ? {
                        ...item,
                        uploadStatus: "failed",
                        uploadError: "Sign in to upload attachments.",
                      }
                    : item,
                ),
                error: "Sign in to upload attachments.",
              }
            : previous,
        );
        return;
      }
      if (!(attachment.file instanceof File)) {
        setDirectMessagePanel((previous) =>
          previous?.conversation.id === conversationId
            ? {
                ...previous,
                attachments: previous.attachments.map((item) =>
                  item.id === attachmentId && getDirectAttachmentUploadStatus(item) !== "ready"
                    ? {
                        ...item,
                        uploadStatus: "failed",
                        uploadError: "Attachment file is no longer available.",
                      }
                    : item,
                ),
                error: "Attachment file is no longer available.",
              }
            : previous,
        );
        return;
      }
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === conversationId
          ? (() => {
              const currentUploadError = String(
                previous.attachments.find((item) => item.id === attachmentId)?.uploadError ?? "",
              ).trim();
              const shouldClearPanelError = currentUploadError.length > 0 && previous.error === currentUploadError;
              return {
                ...previous,
                attachments: previous.attachments.map((item) =>
                  item.id === attachmentId
                    ? {
                        ...item,
                        uploadStatus: "uploading",
                        uploadError: null,
                      }
                    : item,
                ),
                error: shouldClearPanelError ? null : previous.error,
              };
            })()
          : previous,
      );
      try {
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_upload_attachment",
        );
        if (!usableSession) throw new Error("Sign in to upload attachments.");
        const storageId = await uploadCloudDirectMessageAttachmentFile({
          session: usableSession,
          conversationId,
          file: attachment.file,
        });
        setDirectMessagePanel((previous) => {
          if (previous?.conversation.id !== conversationId) return previous;
          const nextAttachments = previous.attachments.map((item) =>
            item.id === attachmentId
              ? {
                  ...item,
                  storage_id: storageId,
                  file: null,
                  uploadStatus: "ready" as const,
                  uploadError: null,
                }
              : item,
          );
          return {
            ...previous,
            attachments: nextAttachments,
            error: previous.error,
          };
        });
      } catch (error) {
        const message = toErrorMessage(error, "Failed to upload attachment.");
        setDirectMessagePanel((previous) =>
          previous?.conversation.id === conversationId
            ? {
                ...previous,
                attachments: previous.attachments.map((item) =>
                  item.id === attachmentId
                    ? {
                        ...item,
                        uploadStatus: "failed",
                        uploadError: message,
                      }
                    : item,
                ),
                error: message,
              }
            : previous,
        );
      }
    },
    [ensureSession, session],
  );

  const sendDirectMessage = useCallback(async () => {
    const current = directMessagePanel;
    const text = String(current?.input ?? "").trim();
    const attachmentsToSend = [...(current?.attachments ?? [])];
    if (!current || (!text && attachmentsToSend.length === 0) || !session) return;
    if (hasUnreadyDirectAttachments(attachmentsToSend)) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              error: "Wait for attachments to finish uploading, or remove failed attachments.",
            }
          : previous,
      );
      return;
    }
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
      const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_send");
      if (!usableSession) throw new Error("Sign in to send direct messages.");
      const serializedAttachments = serializeDirectAttachmentsForWrite(attachmentsToSend);
      await sendCloudDirectMessage({
        session: usableSession,
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
      window.setTimeout(() => {
        focusDirectMessageInput();
      }, 0);
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
  }, [clearDirectTypingForConversation, directMessagePanel, ensureSession, focusDirectMessageInput, session]);

  const handleDirectAttachmentFilesSelected = useCallback(
    async (files: DirectMessageAttachmentFileInput) => {
      const current = directMessagePanel;
      if (!current || files.length === 0) return;
      const result = await ingestDirectMessageAttachmentsFromFileList(files, current.attachments);
      const queuedAttachments = result.attachments.slice(current.attachments.length).filter(
        (attachment) => getDirectAttachmentUploadStatus(attachment) === "queued",
      );
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              attachments: result.attachments,
              error: result.error,
            }
          : previous,
      );
      for (const attachment of queuedAttachments) {
        void uploadDirectAttachmentDraft(current.conversation.id, attachment);
      }
    },
    [directMessagePanel, uploadDirectAttachmentDraft],
  );

  const retryDirectAttachmentUpload = useCallback((id: string) => {
    const attachmentId = String(id ?? "").trim();
    const current = directMessagePanel;
    if (!attachmentId || !current) return;
    const attachment = current.attachments.find((item) => item.id === attachmentId);
    if (!attachment || getDirectAttachmentUploadStatus(attachment) === "ready") return;
    void uploadDirectAttachmentDraft(current.conversation.id, attachment);
  }, [directMessagePanel, uploadDirectAttachmentDraft]);

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
          inputRef={directMessageInputRef}
          voiceButtonProps={{
            state: directMessageVoiceUiState,
            title: directMessagePanel.isSending
              ? "Wait for the direct message to finish sending."
              : directMessageVoiceIntent.title,
            onClick: () => {
              if (directMessagePanel.isSending) {
                showDirectVoiceMessage("Wait for the direct message to finish sending.");
                return;
              }
              pendingVoiceTranscriptConversationIdRef.current = directMessagePanel.conversation.id;
              void handleDirectMessageVoiceInputClick("direct_message");
            },
          }}
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
          onRetryAttachment={retryDirectAttachmentUpload}
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
