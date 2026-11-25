import type { ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversation,
  DirectMessageNetworkPerson,
} from "../../../../shared/communityTypes";
import {
  createCloudDirectMessagesLiveClient,
  ensureCloudDirectConversationFromCommunity,
  listCloudNetworkPeople,
  listCloudDirectConversations,
  markCloudDirectConversationRead,
  subscribeCloudDirectConversations,
  sendCloudDirectMessage,
  sendCloudDirectMessageToUser,
  subscribeCloudDirectMessages,
} from "../../../../shared/cloudDirectMessagesGateway";
import { useDirectMessageTypingPresence } from "../../../../shared/useDirectMessageTypingPresence";
import { fitComposerHeight } from "../../../../shared/composerHeight";
import {
  VIRTUAL_DM_CONVERSATION_ID_PREFIX,
  buildLocalEchoContentJson,
  buildVirtualConversationForPerson,
  collectIncomingDirectMessageEvents,
  countDirectInboxUnread,
  createLocalDirectMessageId,
  findConversationPeerUserId,
  friendlyDirectMessageReadError,
  friendlyDirectMessageSendError,
  getDirectAttachmentUploadStatus,
  hasUnreadyDirectAttachments,
  isVirtualDirectConversationId,
  mergeDirectPanelMessages,
  resolveDirectMessageSession,
  toErrorMessage,
  virtualPeerUserIdFromConversationId,
  type DirectMessageDraft,
  type DirectMessageLocalEcho,
  type DirectMessagePanelState,
} from "../controllers/directMessages/directMessageHostHelpers";
import { useDirectMessageAttachmentsController } from "../controllers/directMessages/useDirectMessageAttachmentsController";
import { useDirectMessageDismissLifecycle } from "../controllers/directMessages/useDirectMessageDismissLifecycle";
import { useDirectMessageModerationActions } from "../controllers/directMessages/useDirectMessageModerationActions";
import { useDirectMessagePeerPresence } from "../controllers/directMessages/useDirectMessagePeerPresence";
import { useDirectMessageVoiceBridge } from "../controllers/directMessages/useDirectMessageVoiceBridge";

const WebDirectMessageInboxPanel = lazy(() =>
  import("./WebDirectMessageInboxPanel").then((module) => ({
    default: module.WebDirectMessageInboxPanel,
  })),
);
const WebDirectMessagePanel = lazy(() =>
  import("./WebDirectMessagePanel").then((module) => ({
    default: module.WebDirectMessagePanel,
  })),
);

type DirectMessageAttachmentDraft = DirectMessageAttachment & {
  data_url?: string | null;
  file?: File | null;
  uploadStatus?: "queued" | "uploading" | "ready" | "failed";
  uploadError?: string | null;
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
  // The conversation shown changed (or closed), so the address can hold it.
  onActiveConversationChange?: (conversationId: string | null) => void;
  // The conversation named in the address (design v1). Inbox opens that one,
  // so it does not pick its own first.
  addressConversationId?: string | null;
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
  // Design v1: the community you're in, so the Inbox can badge the others.
  activeCommunityId?: string | null;
};

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

// A send names each file by the server's reservation id and nothing else: the
// server refuses a storage id, a URL or a size from the browser.
function serializeDirectAttachmentsForWrite(attachments: DirectMessageAttachmentDraft[]): unknown[] {
  const out: unknown[] = [];
  for (const attachment of attachments) {
    const attachmentId = String(attachment.attachment_id ?? "").trim();
    if (attachmentId) out.push({ attachment_id: attachmentId });
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
  const [isDesktopDirectMessageFocusViewport, setIsDesktopDirectMessageFocusViewport] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(DIRECT_MESSAGE_COMPOSER_FOCUS_MEDIA_QUERY).matches,
  );

  const activeConversationId = directMessagePanel?.conversation.id ?? null;
  const onActiveConversationChangeRef = useRef(props.onActiveConversationChange);
  onActiveConversationChangeRef.current = props.onActiveConversationChange;
  useEffect(() => {
    if (!isOpen) return;
    onActiveConversationChangeRef.current?.(activeConversationId);
  }, [activeConversationId, isOpen]);

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
      fitComposerHeight(input);
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
    handleDirectMessageVoiceInputClick,
    showDirectVoiceMessage,
    pendingVoiceTranscriptConversationIdRef,
  } = useDirectMessageVoiceBridge({
    isOpen,
    activeConversationId,
    session,
    sessionRef,
    ensureSession,
    requireSignIn,
    showAppToastMessage,
    setDirectMessagePanel,
    focusDirectMessageInput,
  });

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

  const peerPresenceByUserId = useDirectMessagePeerPresence({
    isOpen,
    session,
    ensureSession,
    sessionUserId,
    conversations,
    networkPeople,
  });

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

  const listStaysVisible = !props.mobileRoot;
  const inboxIsPage = listStaysVisible;
  // Opening Inbox shows your most recent conversation beside the list, once.
  // Closing it, or having none, leaves the column on its empty state.
  const autoOpenedRef = useRef(false);
  const openConversationRef = useRef<((conversation: DirectMessageConversation, options?: { deferRead?: boolean }) => void) | null>(null);
  useEffect(() => {
    if (!isOpen) { autoOpenedRef.current = false; return; }
    if (!inboxIsPage || autoOpenedRef.current || isLoadingInbox) return;
    autoOpenedRef.current = true;
    if (activeConversationId) return;
    // Someone asked for a particular conversation (a profile's Message button,
    // a notification): that one opens, and nothing else is touched or marked read.
    const personAsked = Boolean(openRequest && openRequest.requestId !== directMessageOpenRequestRef.current);
    const conversationAsked = Boolean(
      openConversationRequest && openConversationRequest.requestId !== openConversationRequestHandledRef.current,
    );
    if (personAsked || conversationAsked || props.addressConversationId) return;
    // The list's top row: what needs a reply first, else the latest.
    const withMessages = conversations.filter((conversation) => Math.floor(Number(conversation.last_seq ?? 0)) > 0);
    const needsReply = withMessages.find((conversation) =>
      !conversation.viewer_muted && Boolean(conversation.has_unread || Number(conversation.unread_count ?? 0) > 0));
    const first = needsReply ?? withMessages[0];
    // Narrower windows show Inbox as layers: start on the list, not inside a conversation.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) return;
    if (first) openConversationRef.current?.(first, { deferRead: true });
  }, [activeConversationId, conversations, inboxIsPage, isLoadingInbox, isOpen, openConversationRequest, openRequest, props.addressConversationId]);

  useEffect(() => {
    if (!isOpen || (activeConversationId && !listStaysVisible)) return;
    const timeoutId = window.setTimeout(
      () => {
        void loadNetworkPeople(searchValue);
      },
      searchValue.trim() ? 160 : 0,
    );
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeConversationId, isOpen, listStaysVisible, loadNetworkPeople, searchValue]);

  const activeEngagedConversationId =
    isOpen && activeConversationId && !directMessagePanel?.deferRead ? activeConversationId : null;

  useEffect(() => {
    const visibleForBadge = activeEngagedConversationId
      ? conversations.map((conversation) =>
          conversation.id === activeEngagedConversationId
            ? { ...conversation, has_unread: false, unread_count: 0 }
            : conversation,
        )
      : conversations;
    onUnreadCountChange?.(countDirectInboxUnread(visibleForBadge, true));
  }, [activeEngagedConversationId, conversations, onUnreadCountChange]);

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
    (conversation: DirectMessageConversation, options?: { deferRead?: boolean }) => {
      const panelState = buildPanelStateForConversation(conversation);
      setDirectMessagePanel(options?.deferRead ? { ...panelState, deferRead: true } : panelState);
      if (!options?.deferRead) void markConversationRead(conversation.id, conversation.last_seq);
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
            const isFirstSnapshot = !hasSeededInboxSeqRef.current;
            const { nextSeqByConversation, events } = collectIncomingDirectMessageEvents({
              rows,
              previousSeqByConversation: inboxLastSeqByConversationRef.current,
              sessionUserId,
              isReadingConversation: (conversationId) =>
                isOpenRef.current &&
                directMessagePanelRef.current?.conversation.id === conversationId &&
                typeof document !== "undefined" &&
                document.visibilityState === "visible" &&
                document.hasFocus(),
            });
            // The first snapshot is history, not news — seed silently.
            if (!isFirstSnapshot && onIncomingDirectMessageRef.current) {
              for (const event of events) {
                onIncomingDirectMessageRef.current(event);
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
  }, [ensureSession, loadInbox, session, sessionUserId]);

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

  useDirectMessageDismissLifecycle({
    isOpen,
    mobileRoot: props.mobileRoot,
    inboxIsPage,
    onClose,
  });

  const openConversation = useCallback(
    (conversation: DirectMessageConversation, options?: { deferRead?: boolean }) => {
      openPanelForConversation(conversation, options);
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

  openConversationRef.current = openConversation;

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

  const {
    addDirectAttachmentFiles,
    retryDirectAttachment,
    removeDirectAttachment,
    loadDirectAttachment,
  } = useDirectMessageAttachmentsController({
    session,
    ensureSession,
    directMessagePanel,
    setDirectMessagePanel,
    draftsByConversationRef,
  });

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

  const {
    toggleMuteForActiveConversation,
    toggleBlockForActivePeer,
  } = useDirectMessageModerationActions({
    session,
    ensureSession,
    sessionUserId,
    directMessagePanelRef,
    setConversations,
    setDirectMessagePanel,
    setNetworkPeople,
  });

  const mergedPanelMessages = useMemo(
    () => (directMessagePanel ? mergeDirectPanelMessages(directMessagePanel.messages, directMessagePanel.localEchoes) : []),
    [directMessagePanel],
  );

  if (!isOpen) return null;

  return (
    <div className={`web-direct-messages-host${props.mobileRoot ? " mobile-root" : ""}${inboxIsPage ? " is-page" : ""}${inboxIsPage ? " has-conversation" : ""}${directMessagePanel ? " has-open" : ""}`}>
      <Suspense fallback={null}>
      {/* Design system v1: Inbox is a page. The list fills the main area and
          stays there; the open conversation sits beside it in the right column. */}
      {directMessagePanel ? (
        <WebDirectMessagePanel
          besideInbox={inboxIsPage}
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
          session={session}
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
          onAttachmentFilesSelected={addDirectAttachmentFiles}
          onRetryAttachment={retryDirectAttachment}
          onRemoveAttachment={removeDirectAttachment}
          onLoadAttachment={loadDirectAttachment}
          onRetryLocalMessage={retryDirectMessageEcho}
          onDiscardLocalMessage={discardDirectMessageEcho}
          onComposerBlur={() => {
            void clearDirectTypingForConversation(directMessagePanel.conversation.id);
          }}
          onReadThroughSeq={(seq) => {
            if (directMessagePanel.deferRead) return;
            void markConversationRead(directMessagePanel.conversation.id, seq);
          }}
          onEngage={directMessagePanel.deferRead ? () => {
            const conversation = directMessagePanel.conversation;
            setDirectMessagePanel((previous) =>
              previous?.conversation.id === conversation.id ? { ...previous, deferRead: false } : previous);
            void markConversationRead(conversation.id, conversation.last_seq);
          } : undefined}
          onBackToInbox={() => {
            void clearDirectTypingForConversation(directMessagePanel.conversation.id);
            setDirectMessagePanel(null);
          }}
        />
      ) : null}
      {inboxIsPage && !directMessagePanel ? (
        <aside className="community-dm-panel community-dm-empty-column" aria-label="No conversation open">
          <p>Choose someone on the left to read or send a message.</p>
        </aside>
      ) : null}
      {!directMessagePanel || inboxIsPage ? (
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
          activeConversationId={activeConversationId}
          activelyReadingConversationId={activeEngagedConversationId}
          onSelectConversation={openConversation}
          onSelectPerson={openPersonConversation}
          kitPage={{ activeCommunityId: props.activeCommunityId ?? null }}
        />
      ) : null}
      </Suspense>
    </div>
  );
}
