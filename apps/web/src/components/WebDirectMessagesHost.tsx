import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversation,
  DirectMessageNetworkPerson,
} from "../../../../shared/communityTypes";
import {
  isLikelyImageFile,
  isSupportedChatRasterImage,
  readChatImageAsDataUrl,
} from "../../../../shared/attachmentHelpers";
import {
  blockCloudDirectMessageUser,
  createCloudDirectMessagesLiveClient,
  ensureCloudDirectConversationFromCommunity,
  listCloudDirectMessagePeerPresence,
  listCloudNetworkPeople,
  setCloudDirectConversationMuted,
  unblockCloudDirectMessageUser,
  listCloudDirectConversations,
  markCloudDirectConversationRead,
  subscribeCloudDirectConversations,
  sendCloudDirectMessage,
  sendCloudDirectMessageToUser,
  subscribeCloudDirectMessages,
  uploadCloudDirectMessageAttachmentFile,
  uploadCloudDirectMessageAttachmentFileForUser,
} from "../../../../shared/cloudDirectMessagesGateway";
import { useDirectMessageTypingPresence } from "../../../../shared/useDirectMessageTypingPresence";
import { useWebVoiceInputController } from "../../../../shared/useWebVoiceInputController";
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

type DirectMessageLocalEcho = DirectMessage & {
  local_id: string;
  local_status: "sending" | "sent" | "failed";
  local_error?: string | null;
  local_payload: {
    text: string;
    attachments: DirectMessageAttachmentDraft[];
  };
};

type DirectMessageDraft = {
  input: string;
  attachments: DirectMessageAttachmentDraft[];
};

type DirectMessagePanelState = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  localEchoes: DirectMessageLocalEcho[];
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

export type DirectMessageOpenConversationRequest = {
  requestId: number;
  conversationId: string;
} | null;

export type IncomingDirectMessageEvent = {
  conversationId: string;
  peerDisplayName: string;
  peerAvatarUrl: string | null;
  previewText: string;
  lastSeq: number;
};

export type DirectMessageNotificationsUiState = "hidden" | "on" | "off" | "blocked";

export type WebDirectMessagesHostProps<SessionT> = {
  isOpen: boolean;
  mobileRoot?: boolean;
  openRequest: DirectMessageOpenRequest;
  openConversationRequest?: DirectMessageOpenConversationRequest;
  session: SessionT | null;
  ensureSession?: (
    session?: SessionT | null,
    source?: string,
    options?: { forceRefresh?: boolean },
  ) => Promise<SessionT | null>;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  requireSignIn?: () => void;
  showAppToastMessage?: (message: string) => void;
  onUnreadCountChange?: (count: number) => void;
  onIncomingDirectMessage?: (event: IncomingDirectMessageEvent) => void;
  onDirectMessageSent?: () => void;
  notificationsState?: DirectMessageNotificationsUiState;
  onToggleNotifications?: () => void;
  onClose: () => void;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

function friendlyDirectMessageSendError(error: unknown, fallback: string): string {
  const raw = toErrorMessage(error, fallback);
  const normalized = raw.toLowerCase();
  if (normalized.includes("dm_rate_limited")) {
    return "You're sending messages too quickly. Give it a minute and try again.";
  }
  if (normalized.includes("dm_conversation_access_required")) {
    return "You can't message this person right now.";
  }
  if (normalized.includes("dm_target_not_found")) {
    return "That person is no longer available.";
  }
  if (normalized.includes("dm_message_payload_required")) {
    return "Write a message or attach a file first.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror") || normalized.includes("network request failed")) {
    return "Couldn't reach Polynet. Check your connection and try again.";
  }
  if (normalized.includes("dm_attachment")) {
    return "One of the attachments couldn't be sent. Remove it and try again.";
  }
  const looksLikeRawServerError =
    normalized.includes("server error") ||
    normalized.includes("uncaught error") ||
    normalized.startsWith("dm_") ||
    normalized.startsWith("convex_");
  return looksLikeRawServerError ? fallback : raw;
}

function friendlyDirectMessageReadError(error: unknown, fallback: string): string {
  const raw = toErrorMessage(error, fallback);
  const normalized = raw.toLowerCase();
  const isRecoverableConnectionError =
    normalized.includes("verified_identity_required") ||
    normalized.includes("server error") ||
    normalized.includes("uncaught error") ||
    normalized.includes("[convex") ||
    normalized.startsWith("convex_");
  return isRecoverableConnectionError
    ? "Messages temporarily disconnected. Reconnecting…"
    : raw;
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
        "dialog[open]",
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

function createLocalDirectMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `local-${globalThis.crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const VIRTUAL_DM_CONVERSATION_ID_PREFIX = "virtual:";

function isVirtualDirectConversationId(conversationId: string | null | undefined): boolean {
  return String(conversationId ?? "").startsWith(VIRTUAL_DM_CONVERSATION_ID_PREFIX);
}

function virtualPeerUserIdFromConversationId(conversationId: string): string {
  return conversationId.slice(VIRTUAL_DM_CONVERSATION_ID_PREFIX.length);
}

// A local-only stand-in conversation for first contact with a person; the real
// conversation row is created server-side on first send, never on open.
function buildVirtualConversationForPerson(
  person: DirectMessageNetworkPerson,
  sessionUserId: string | null,
): DirectMessageConversation {
  const nowIso = new Date().toISOString();
  return {
    id: `${VIRTUAL_DM_CONVERSATION_ID_PREFIX}${person.user_id}`,
    kind: "direct",
    created_from_community: {
      id: person.community_id,
      slug: "",
      name: person.community_name,
    },
    last_seq: 0,
    viewer_last_read_seq: 0,
    unread_count: 0,
    has_unread: false,
    last_message_preview: null,
    last_message_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    participants: [
      {
        id: "virtual-self",
        participant_type: "user",
        user_id: sessionUserId,
        display_name: null,
        avatar_url: null,
        status: "active",
        last_read_seq: 0,
      },
      {
        id: "virtual-peer",
        participant_type: "user",
        user_id: person.user_id,
        display_name: person.display_name,
        avatar_url: person.avatar_url,
        avatar_focus_x: person.avatar_focus_x ?? 0.5,
        avatar_focus_y: person.avatar_focus_y ?? 0.5,
        avatar_zoom: person.avatar_zoom ?? 1,
        status: "active",
        last_read_seq: 0,
      },
    ],
  };
}

function findConversationPeerUserId(
  conversation: DirectMessageConversation,
  sessionUserId: string | null,
): string {
  const peer = conversation.participants.find(
    (participant) =>
      participant.status === "active" &&
      participant.participant_type === "user" &&
      participant.user_id &&
      participant.user_id !== sessionUserId,
  );
  return String(peer?.user_id ?? "").trim();
}

function buildLocalEchoContentJson(
  text: string,
  attachments: DirectMessageAttachmentDraft[],
): unknown {
  if (attachments.length === 0) return { text };
  return {
    text,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime ?? null,
      size: attachment.size,
      storage_id: String(attachment.storage_id ?? "").trim(),
      url: attachment.data_url ?? null,
    })),
  };
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
    openConversationRequest,
    session,
    ensureSession,
    sessionUserId,
    getInitials,
    getAvatarColor,
    renderTextWithLinks,
    requireSignIn,
    showAppToastMessage,
    onUnreadCountChange,
    onIncomingDirectMessage,
    onDirectMessageSent,
    notificationsState,
    onToggleNotifications,
    onClose,
  } = props;
  const [conversations, setConversations] = useState<DirectMessageConversation[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [directMessagePanel, setDirectMessagePanel] = useState<DirectMessagePanelState | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [networkPeople, setNetworkPeople] = useState<DirectMessageNetworkPerson[]>([]);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [sourceCommunityCount, setSourceCommunityCount] = useState<number | null>(null);
  const [hasMorePeople, setHasMorePeople] = useState(false);
  const isLoadingMorePeopleRef = useRef(false);
  const [peerPresenceByUserId, setPeerPresenceByUserId] = useState<Record<string, string | null>>({});
  const peerPresenceFetchRef = useRef<{ key: string; atMs: number }>({ key: "", atMs: 0 });
  const inboxLoadRequestRef = useRef(0);
  const peopleLoadRequestRef = useRef(0);
  const hasInboxLiveSubscriptionRef = useRef(false);

  const directMessageOpenRequestRef = useRef(0);
  const readMarkSeqByConversationRef = useRef<Record<string, number>>({});
  const draftsByConversationRef = useRef<Record<string, DirectMessageDraft>>({});
  const echoesByConversationRef = useRef<Record<string, DirectMessageLocalEcho[]>>({});
  const virtualToRealConversationIdRef = useRef<Record<string, string>>({});
  const directMessagePanelRef = useRef<DirectMessagePanelState | null>(null);
  const inboxLastSeqByConversationRef = useRef<Record<string, number>>({});
  const hasSeededInboxSeqRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  const onIncomingDirectMessageRef = useRef(onIncomingDirectMessage);
  const openConversationRequestHandledRef = useRef(0);
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
      input.style.height = `${Math.min(input.scrollHeight, 148)}px`;
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

  const liveActiveConversationId =
    activeConversationId && !isVirtualDirectConversationId(activeConversationId)
      ? activeConversationId
      : null;

  const {
    presence: directTypingPresence,
    clearTyping: clearDirectTypingForConversation,
  } = useDirectMessageTypingPresence({
    isEnabled: isOpen && Boolean(liveActiveConversationId),
    session: session as any,
    ensureSession: ensureSession as any,
    conversationId: liveActiveConversationId,
    canSendMessages: Boolean(session && directMessagePanel && !directMessagePanel.isSending),
    inputValue: directMessagePanel?.input ?? "",
  });

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
      setInboxError(friendlyDirectMessageReadError(error, "Failed to load direct messages."));
    } finally {
      if (inboxLoadRequestRef.current !== requestId) return;
      setIsLoadingInbox(false);
    }
  }, [ensureSession, session]);

  const loadNetworkPeople = useCallback(
    async (search: string) => {
      const requestId = peopleLoadRequestRef.current + 1;
      peopleLoadRequestRef.current = requestId;
      if (!session) {
        setNetworkPeople([]);
        setSourceCommunityCount(null);
        setPeopleError(null);
        setIsLoadingPeople(false);
        return;
      }
      setIsLoadingPeople(true);
      setPeopleError(null);
      try {
        const usableSession = await resolveDirectMessageSession(
          session,
          ensureSession,
          "direct_messages_network_people",
        );
        if (peopleLoadRequestRef.current !== requestId) return;
        if (!usableSession) {
          setNetworkPeople([]);
          setSourceCommunityCount(null);
          return;
        }
        const bundle = await listCloudNetworkPeople({
          session: usableSession,
          search,
          limit: 20,
        });
        if (peopleLoadRequestRef.current !== requestId) return;
        setNetworkPeople(bundle.people);
        setSourceCommunityCount(bundle.source_community_count);
        setHasMorePeople(Boolean(bundle.has_more) && !search.trim());
      } catch (error) {
        if (peopleLoadRequestRef.current !== requestId) return;
        setPeopleError(toErrorMessage(error, "Failed to load people."));
      } finally {
        if (peopleLoadRequestRef.current !== requestId) return;
        setIsLoadingPeople(false);
      }
    },
    [ensureSession, session],
  );

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

  const loadMoreNetworkPeople = useCallback(async () => {
    if (!session || !hasMorePeople || searchValue.trim()) return;
    if (isLoadingMorePeopleRef.current) return;
    isLoadingMorePeopleRef.current = true;
    const requestId = peopleLoadRequestRef.current;
    try {
      const usableSession = await resolveDirectMessageSession(
        session,
        ensureSession,
        "direct_messages_network_people_more",
      );
      if (!usableSession || peopleLoadRequestRef.current !== requestId) return;
      const excludeUserIds = networkPeople
        .map((person) => String(person.user_id ?? "").trim())
        .filter(Boolean);
      const bundle = await listCloudNetworkPeople({
        session: usableSession,
        search: "",
        limit: 15,
        excludeUserIds,
      });
      if (peopleLoadRequestRef.current !== requestId) return;
      setNetworkPeople((previous) => {
        const seen = new Set(previous.map((person) => person.user_id));
        return [...previous, ...bundle.people.filter((person) => !seen.has(person.user_id))];
      });
      const reachedExcludeCap = excludeUserIds.length + bundle.people.length >= 200;
      setHasMorePeople(Boolean(bundle.has_more) && bundle.people.length > 0 && !reachedExcludeCap);
    } catch {
      setHasMorePeople(false);
    } finally {
      isLoadingMorePeopleRef.current = false;
    }
  }, [ensureSession, hasMorePeople, networkPeople, searchValue, session]);

  useEffect(() => {
    readMarkSeqByConversationRef.current = {};
    draftsByConversationRef.current = {};
    echoesByConversationRef.current = {};
    virtualToRealConversationIdRef.current = {};
  }, [sessionUserId]);

  useEffect(() => {
    directMessagePanelRef.current = directMessagePanel;
  }, [directMessagePanel]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    onIncomingDirectMessageRef.current = onIncomingDirectMessage;
  }, [onIncomingDirectMessage]);

  useEffect(() => {
    const panel = directMessagePanel;
    if (!panel) return;
    const conversationId = panel.conversation.id;
    if (!panel.input.trim() && panel.attachments.length === 0) {
      delete draftsByConversationRef.current[conversationId];
      return;
    }
    draftsByConversationRef.current[conversationId] = {
      input: panel.input,
      attachments: panel.attachments,
    };
  }, [directMessagePanel]);

  const updateConversationEchoes = useCallback(
    (
      conversationId: string,
      updater: (echoes: DirectMessageLocalEcho[]) => DirectMessageLocalEcho[],
    ) => {
      const nextEchoes = updater(echoesByConversationRef.current[conversationId] ?? []);
      if (nextEchoes.length > 0) {
        echoesByConversationRef.current[conversationId] = nextEchoes;
      } else {
        delete echoesByConversationRef.current[conversationId];
      }
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === conversationId
          ? {
              ...previous,
              localEchoes: nextEchoes,
            }
          : previous,
      );
    },
    [],
  );

  useEffect(() => {
    if (!isOpen || activeConversationId) return;
    const timeoutId = window.setTimeout(
      () => {
        void loadNetworkPeople(searchValue);
      },
      searchValue.trim() ? 160 : 0,
    );
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeConversationId, isOpen, loadNetworkPeople, searchValue]);

  useEffect(() => {
    const unreadCount = conversations.reduce((total, conversation) => {
      if (conversation.viewer_muted) return total;
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
      if (isVirtualDirectConversationId(normalizedConversationId)) return;
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
          throughSeq: seq,
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

  const buildPanelStateForConversation = useCallback(
    (conversation: DirectMessageConversation): DirectMessagePanelState => {
      const draft = draftsByConversationRef.current[conversation.id] ?? null;
      const restoredAttachments = (draft?.attachments ?? []).map((attachment) => {
        const status = getDirectAttachmentUploadStatus(attachment);
        if (status === "ready") return attachment;
        if (attachment.file instanceof File) {
          return {
            ...attachment,
            uploadStatus: "queued" as const,
            uploadError: null,
          };
        }
        return {
          ...attachment,
          uploadStatus: "failed" as const,
          uploadError: "Upload interrupted. Remove the file and attach it again.",
        };
      });
      return {
        conversation,
        messages: [],
        localEchoes: echoesByConversationRef.current[conversation.id] ?? [],
        input: draft?.input ?? "",
        attachments: restoredAttachments,
        isLoading: !isVirtualDirectConversationId(conversation.id),
        isSending: false,
        error: null,
      };
    },
    [],
  );

  const openPanelForConversation = useCallback(
    (conversation: DirectMessageConversation) => {
      const panelState = buildPanelStateForConversation(conversation);
      setDirectMessagePanel(panelState);
      void markConversationRead(conversation.id, conversation.last_seq);
    },
    [buildPanelStateForConversation, markConversationRead],
  );

  useEffect(() => {
    hasInboxLiveSubscriptionRef.current = false;
    hasSeededInboxSeqRef.current = false;
    inboxLastSeqByConversationRef.current = {};
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
        liveClient = createCloudDirectMessagesLiveClient({
          session: usableSession,
          ensureSession,
        });
        if (isDisposed) {
          liveClient.close();
          return;
        }
        unsubscribe = subscribeCloudDirectConversations<DirectMessageConversation>({
          liveClient,
          limit: 30,
          onUpdate: (rows) => {
            if (isDisposed) return;
            const previousSeqByConversation = inboxLastSeqByConversationRef.current;
            const isFirstSnapshot = !hasSeededInboxSeqRef.current;
            const nextSeqByConversation: Record<string, number> = {};
            for (const row of rows) {
              nextSeqByConversation[row.id] = Math.max(0, Math.floor(Number(row.last_seq ?? 0)));
            }
            // The first snapshot is history, not news — seed silently.
            if (!isFirstSnapshot && onIncomingDirectMessageRef.current) {
              for (const row of rows) {
                const seq = nextSeqByConversation[row.id] ?? 0;
                const previousSeq = previousSeqByConversation[row.id] ?? 0;
                if (seq <= previousSeq) continue;
                if (row.last_message_from_viewer) continue;
                if (row.viewer_muted) continue;
                const isReadingThread =
                  isOpenRef.current &&
                  directMessagePanelRef.current?.conversation.id === row.id &&
                  typeof document !== "undefined" &&
                  document.visibilityState === "visible" &&
                  document.hasFocus();
                if (isReadingThread) continue;
                const peer =
                  row.participants.find(
                    (participant) =>
                      participant.status === "active" &&
                      participant.participant_type === "user" &&
                      participant.user_id &&
                      participant.user_id !== sessionUserId,
                  ) ?? null;
                onIncomingDirectMessageRef.current({
                  conversationId: row.id,
                  peerDisplayName:
                    String(peer?.display_name ?? "").trim() || "New message",
                  peerAvatarUrl: peer?.avatar_url ?? null,
                  previewText: String(row.last_message_preview ?? "").trim() || "New message",
                  lastSeq: seq,
                });
              }
            }
            inboxLastSeqByConversationRef.current = nextSeqByConversation;
            hasSeededInboxSeqRef.current = true;
            setConversations(rows);
            setIsLoadingInbox(false);
            setInboxError(null);
          },
          onError: (error) => {
            if (isDisposed) return;
            setIsLoadingInbox(false);
            setInboxError(friendlyDirectMessageReadError(error, "Failed to load direct messages."));
          },
        });
      } catch (error) {
        if (isDisposed) return;
        hasInboxLiveSubscriptionRef.current = false;
        setIsLoadingInbox(false);
        setInboxError(friendlyDirectMessageReadError(error, "Failed to load direct messages."));
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
        openPanelForConversation(conversation);
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
  }, [ensureSession, isOpen, openPanelForConversation, openRequest, session]);

  useEffect(() => {
    if (!isOpen) {
      peopleLoadRequestRef.current += 1;
      setDirectMessagePanel(null);
      setSearchValue("");
      setPeopleError(null);
      setIsLoadingPeople(false);
      return;
    }
    if (activeConversationId) return;
    if (hasInboxLiveSubscriptionRef.current) return;
    void loadInbox();
  }, [activeConversationId, isOpen, loadInbox]);

  useEffect(() => {
    if (!isOpen || !activeConversationId || !session) return;
    if (isVirtualDirectConversationId(activeConversationId)) return;

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
        liveClient = createCloudDirectMessagesLiveClient({
          session: usableSession,
          ensureSession,
        });
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
            const messageIds = new Set(messages.map((message) => message.id));
            const clientMessageIds = new Set(
              messages
                .map((message) => String(message.client_message_id ?? "").trim())
                .filter(Boolean),
            );
            updateConversationEchoes(activeConversationId, (echoes) =>
              echoes.filter(
                (echo) => !messageIds.has(echo.id) && !clientMessageIds.has(echo.local_id),
              ),
            );
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
                    error: friendlyDirectMessageReadError(error, "Failed to load direct messages."),
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
                error: friendlyDirectMessageReadError(error, "Failed to load direct messages."),
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
  }, [activeConversationId, ensureSession, isOpen, session, updateConversationEchoes]);

  useEffect(() => {
    if (!isOpen || props.mobileRoot) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const host = document.querySelector(".web-direct-messages-host");
      if (host?.contains(target)) return;
      if (target instanceof Element && target.closest(".direct-messages-topbar-button")) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A control disabling itself (for example Next on the last PDF page) can
      // move focus to body. The native modal still owns this Escape's default action.
      if (document.querySelector(".web-direct-messages-host dialog[open]")) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, props.mobileRoot]);

  const openConversation = useCallback(
    (conversation: DirectMessageConversation) => {
      openPanelForConversation(conversation);
    },
    [openPanelForConversation],
  );

  useEffect(() => {
    const request = openConversationRequest;
    if (!request || request.requestId === openConversationRequestHandledRef.current) return;
    const conversation = conversations.find((row) => row.id === request.conversationId);
    if (conversation) {
      openConversationRequestHandledRef.current = request.requestId;
      openPanelForConversation(conversation);
      return;
    }
    // Inbox delivered and the conversation isn't in the loaded window: land on
    // the inbox instead of retrying forever.
    if (hasSeededInboxSeqRef.current) {
      openConversationRequestHandledRef.current = request.requestId;
      setDirectMessagePanel(null);
    }
  }, [conversations, openConversationRequest, openPanelForConversation]);

  const openExistingConversationWithPerson = useCallback(
    async (person: DirectMessageNetworkPerson) => {
      const targetUserId = String(person.user_id ?? "").trim();
      const communityId = String(person.community_id ?? "").trim();
      if (!session || !targetUserId || !communityId) return;
      setPeopleError(null);
      setIsLoadingPeople(true);
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
        openPanelForConversation(conversation);
      } catch (error) {
        setPeopleError(toErrorMessage(error, "Failed to open direct message."));
      } finally {
        setIsLoadingPeople(false);
      }
    },
    [ensureSession, openPanelForConversation, session],
  );

  const openPersonConversation = useCallback(
    (person: DirectMessageNetworkPerson) => {
      if (!session) return;
      const virtualConversationId = `${VIRTUAL_DM_CONVERSATION_ID_PREFIX}${person.user_id}`;
      const migratedConversationId =
        String(person.existing_conversation_id ?? "").trim() ||
        virtualToRealConversationIdRef.current[virtualConversationId] ||
        "";
      if (migratedConversationId) {
        const existing = conversations.find((row) => row.id === migratedConversationId);
        if (existing) {
          openConversation(existing);
          return;
        }
        void openExistingConversationWithPerson(person);
        return;
      }
      openPanelForConversation(buildVirtualConversationForPerson(person, sessionUserId));
    },
    [
      conversations,
      openConversation,
      openExistingConversationWithPerson,
      openPanelForConversation,
      session,
      sessionUserId,
    ],
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
        const storageId = isVirtualDirectConversationId(conversationId)
          ? await uploadCloudDirectMessageAttachmentFileForUser({
              session: usableSession,
              targetUserId: virtualPeerUserIdFromConversationId(conversationId),
              communityId:
                directMessagePanelRef.current?.conversation.id === conversationId
                  ? directMessagePanelRef.current?.conversation.created_from_community?.id ?? null
                  : null,
              file: attachment.file,
            })
          : await uploadCloudDirectMessageAttachmentFile({
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
        const message = friendlyDirectMessageSendError(error, "Failed to upload attachment.");
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

  const lastUploadKickConversationRef = useRef<string | null>(null);
  useEffect(() => {
    const panel = directMessagePanel;
    if (!panel) {
      lastUploadKickConversationRef.current = null;
      return;
    }
    if (lastUploadKickConversationRef.current === panel.conversation.id) return;
    lastUploadKickConversationRef.current = panel.conversation.id;
    for (const attachment of panel.attachments) {
      if (getDirectAttachmentUploadStatus(attachment) === "queued" && attachment.file instanceof File) {
        void uploadDirectAttachmentDraft(panel.conversation.id, attachment);
      }
    }
  }, [directMessagePanel, uploadDirectAttachmentDraft]);

  const deliverDirectMessageEcho = useCallback(
    async (conversationId: string, echo: DirectMessageLocalEcho) => {
      try {
        const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_send");
        if (!usableSession) throw new Error("Sign in to send direct messages.");
        const message = await sendCloudDirectMessage({
          session: usableSession,
          conversationId,
          text: echo.local_payload.text,
          attachments: serializeDirectAttachmentsForWrite(echo.local_payload.attachments),
          clientMessageId: echo.local_id,
        });
        updateConversationEchoes(conversationId, (echoes) =>
          echoes.map((item) =>
            item.local_id === echo.local_id
              ? {
                  ...message,
                  local_id: item.local_id,
                  local_status: "sent" as const,
                  local_error: null,
                  local_payload: item.local_payload,
                }
              : item,
          ),
        );
      } catch (error) {
        updateConversationEchoes(conversationId, (echoes) =>
          echoes.map((item) =>
            item.local_id === echo.local_id
              ? {
                  ...item,
                  local_status: "failed" as const,
                  local_error: friendlyDirectMessageSendError(error, "Failed to send direct message."),
                }
              : item,
          ),
        );
      }
    },
    [ensureSession, session, updateConversationEchoes],
  );

  const deliverVirtualDirectMessageEcho = useCallback(
    async (args: {
      virtualConversationId: string;
      targetUserId: string;
      communityId: string | null;
      echo: DirectMessageLocalEcho;
    }) => {
      const { virtualConversationId, targetUserId, communityId, echo } = args;
      try {
        const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_send");
        if (!usableSession) throw new Error("Sign in to send direct messages.");
        const result = await sendCloudDirectMessageToUser({
          session: usableSession,
          targetUserId,
          communityId,
          text: echo.local_payload.text,
          attachments: serializeDirectAttachmentsForWrite(echo.local_payload.attachments),
          clientMessageId: echo.local_id,
        });
        const realConversationId = result.conversation.id;
        const confirmEcho = (echoes: DirectMessageLocalEcho[]) =>
          echoes.map((item) =>
            item.local_id === echo.local_id
              ? {
                  ...result.message,
                  local_id: item.local_id,
                  local_status: "sent" as const,
                  local_error: null,
                  local_payload: item.local_payload,
                }
              : item,
          );
        const alreadyMigratedConversationId = virtualToRealConversationIdRef.current[virtualConversationId];
        if (alreadyMigratedConversationId) {
          updateConversationEchoes(alreadyMigratedConversationId, confirmEcho);
          return;
        }
        virtualToRealConversationIdRef.current[virtualConversationId] = realConversationId;
        const virtualEchoes = echoesByConversationRef.current[virtualConversationId] ?? [];
        delete echoesByConversationRef.current[virtualConversationId];
        const migratedEchoes = confirmEcho(virtualEchoes).map((item) => ({
          ...item,
          conversation_id: realConversationId,
        }));
        if (migratedEchoes.length > 0) {
          echoesByConversationRef.current[realConversationId] = migratedEchoes;
        }
        const draft = draftsByConversationRef.current[virtualConversationId];
        if (draft) {
          draftsByConversationRef.current[realConversationId] = draft;
          delete draftsByConversationRef.current[virtualConversationId];
        }
        setConversations((previous) => [
          result.conversation,
          ...previous.filter((row) => row.id !== realConversationId),
        ]);
        setNetworkPeople((previous) => previous.filter((person) => person.user_id !== targetUserId));
        setDirectMessagePanel((previous) =>
          previous?.conversation.id === virtualConversationId
            ? {
                ...previous,
                conversation: result.conversation,
                localEchoes: migratedEchoes,
                isLoading: false,
              }
            : previous,
        );
      } catch (error) {
        const failConversationId =
          virtualToRealConversationIdRef.current[virtualConversationId] ?? virtualConversationId;
        updateConversationEchoes(failConversationId, (echoes) =>
          echoes.map((item) =>
            item.local_id === echo.local_id
              ? {
                  ...item,
                  local_status: "failed" as const,
                  local_error: friendlyDirectMessageSendError(error, "Failed to send direct message."),
                }
              : item,
          ),
        );
      }
    },
    [ensureSession, session, updateConversationEchoes],
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
    const conversationId = current.conversation.id;
    const nowIso = new Date().toISOString();
    const localId = createLocalDirectMessageId();
    const echo: DirectMessageLocalEcho = {
      id: localId,
      local_id: localId,
      local_status: "sending",
      local_error: null,
      conversation_id: conversationId,
      seq: 0,
      sender_type: "user",
      sender_user_id: sessionUserId,
      content_json: buildLocalEchoContentJson(text, attachmentsToSend),
      created_at: nowIso,
      updated_at: nowIso,
      local_payload: { text, attachments: attachmentsToSend },
    };
    setDirectMessagePanel((previous) =>
      previous?.conversation.id === conversationId
        ? {
            ...previous,
            input: "",
            attachments: [],
            error: null,
          }
        : previous,
    );
    delete draftsByConversationRef.current[conversationId];
    updateConversationEchoes(conversationId, (echoes) => [...echoes, echo]);
    // Still inside the send click/keypress, so a first-send notification
    // permission prompt keeps its user gesture.
    onDirectMessageSent?.();
    void clearDirectTypingForConversation(conversationId);
    window.setTimeout(() => {
      focusDirectMessageInput();
    }, 0);
    if (isVirtualDirectConversationId(conversationId)) {
      await deliverVirtualDirectMessageEcho({
        virtualConversationId: conversationId,
        targetUserId: virtualPeerUserIdFromConversationId(conversationId),
        communityId: current.conversation.created_from_community?.id ?? null,
        echo,
      });
      return;
    }
    await deliverDirectMessageEcho(conversationId, echo);
  }, [
    clearDirectTypingForConversation,
    deliverDirectMessageEcho,
    deliverVirtualDirectMessageEcho,
    directMessagePanel,
    focusDirectMessageInput,
    onDirectMessageSent,
    session,
    sessionUserId,
    updateConversationEchoes,
  ]);

  const retryDirectMessageEcho = useCallback(
    (localId: string) => {
      const current = directMessagePanel;
      if (!current) return;
      const conversationId = current.conversation.id;
      const echo = (echoesByConversationRef.current[conversationId] ?? []).find(
        (item) => item.local_id === localId,
      );
      if (!echo || echo.local_status !== "failed") return;
      updateConversationEchoes(conversationId, (echoes) =>
        echoes.map((item) =>
          item.local_id === localId
            ? {
                ...item,
                local_status: "sending" as const,
                local_error: null,
              }
            : item,
        ),
      );
      if (isVirtualDirectConversationId(conversationId)) {
        void deliverVirtualDirectMessageEcho({
          virtualConversationId: conversationId,
          targetUserId: virtualPeerUserIdFromConversationId(conversationId),
          communityId: current.conversation.created_from_community?.id ?? null,
          echo,
        });
        return;
      }
      void deliverDirectMessageEcho(conversationId, echo);
    },
    [deliverDirectMessageEcho, deliverVirtualDirectMessageEcho, directMessagePanel, updateConversationEchoes],
  );

  const discardDirectMessageEcho = useCallback(
    (localId: string) => {
      const current = directMessagePanel;
      if (!current) return;
      updateConversationEchoes(current.conversation.id, (echoes) =>
        echoes.filter((item) => item.local_id !== localId),
      );
    },
    [directMessagePanel, updateConversationEchoes],
  );

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
  }, [ensureSession, session]);

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
  }, [ensureSession, session, sessionUserId]);

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

  const mergedPanelMessages = useMemo(() => {
    if (!directMessagePanel) return [] as DirectMessage[];
    const { messages, localEchoes } = directMessagePanel;
    if (localEchoes.length === 0) return messages;
    const messageIds = new Set(messages.map((message) => message.id));
    const clientMessageIds = new Set(
      messages.map((message) => String(message.client_message_id ?? "").trim()).filter(Boolean),
    );
    return [
      ...messages,
      ...localEchoes.filter(
        (echo) => !messageIds.has(echo.id) && !clientMessageIds.has(echo.local_id),
      ),
    ];
  }, [directMessagePanel]);

  if (!isOpen) return null;

  return (
    <div className={`web-direct-messages-host${props.mobileRoot ? " mobile-root" : ""}`}>
      {directMessagePanel ? (
        <WebDirectMessagePanel
          conversation={directMessagePanel.conversation}
          messages={mergedPanelMessages}
          input={directMessagePanel.input}
          isLoading={directMessagePanel.isLoading}
          isSending={directMessagePanel.isSending}
          error={directMessagePanel.error}
          attachments={directMessagePanel.attachments}
          typingPresence={directTypingPresence}
          isPeerBlocked={Boolean(directMessagePanel.conversation.viewer_has_blocked_peer)}
          isConversationMuted={Boolean(directMessagePanel.conversation.viewer_muted)}
          showBlockAction={!isVirtualDirectConversationId(directMessagePanel.conversation.id)}
          onToggleBlockPeer={toggleBlockForActivePeer}
          onToggleMuteConversation={toggleMuteForActiveConversation}
          peerLastActiveAt={
            (() => {
              const peerUserId = findConversationPeerUserId(directMessagePanel.conversation, sessionUserId);
              return peerUserId && peerUserId in peerPresenceByUserId
                ? peerPresenceByUserId[peerUserId]
                : undefined;
            })()
          }
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
            if (value.trim().length === 0) {
              void clearDirectTypingForConversation(directMessagePanel.conversation.id);
            }
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
          onRetryLocalMessage={retryDirectMessageEcho}
          onDiscardLocalMessage={discardDirectMessageEcho}
          onComposerBlur={() => {
            void clearDirectTypingForConversation(directMessagePanel.conversation.id);
          }}
          onReadThroughSeq={(seq) => {
            void markConversationRead(directMessagePanel.conversation.id, seq);
          }}
          onBackToInbox={() => {
            void clearDirectTypingForConversation(directMessagePanel.conversation.id);
            setDirectMessagePanel(null);
          }}
        />
      ) : (
        <WebDirectMessageInboxPanel
          conversations={conversations}
          isLoading={isLoadingInbox}
          error={inboxError}
          searchValue={searchValue}
          people={networkPeople}
          isLoadingPeople={isLoadingPeople}
          peopleError={peopleError}
          sourceCommunityCount={sourceCommunityCount}
          hasMorePeople={hasMorePeople}
          onLoadMorePeople={loadMoreNetworkPeople}
          peerPresenceByUserId={peerPresenceByUserId}
          notificationsState={notificationsState}
          onToggleNotifications={onToggleNotifications}
          canBrowsePeople={Boolean(session)}
          sessionUserId={sessionUserId}
          getInitials={getInitials}
          getAvatarColor={getAvatarColor}
          onSearchValueChange={setSearchValue}
          onSelectConversation={openConversation}
          onSelectPerson={openPersonConversation}
        />
      )}
    </div>
  );
}
