import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  ComponentProps,
  Dispatch,
  DragEventHandler,
  MutableRefObject,
  ReactNode,
  SetStateAction,
  UIEventHandler,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommunityChatMessageRow } from "../../../../shared/CommunityChatMessageRow";
import type { CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import type {
  CommunityActivityEvent as SharedCommunityActivityEvent,
  CommunityChatMessage as SharedCommunityChatMessage,
  ProfileCommunityContext as SharedProfileCommunityContext,
  MessageReaction as SharedMessageReaction,
  CommunityTypingPresenceBundle as SharedCommunityTypingPresenceBundle,
  CommunityTypingPresenceUser as SharedCommunityTypingPresenceUser,
  UserProfile as SharedUserProfile,
} from "../../../../shared/communityTypes";
import { fetchCloudProfileCommunityContext } from "../../../../shared/cloudProfilesGateway";
import {
  searchCloudCommunityMentionCandidates,
  type CloudCommunityMentionCandidateRow,
} from "../../../../shared/cloudCommunityDirectoryGateway";
import { formatDateSeparator } from "../../../../shared/chatUi";
import {
  type CommunityMessageAttachment,
  type ReplyPrefix,
} from "../../../../shared/communityMessageParsing";
import { textContainsMentionToken } from "../../../../shared/communityMentionRendering";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { useMessageAttachmentInputController } from "../../../../shared/useMessageAttachmentInputController";
import { mergeVoiceTranscript } from "../../../../shared/voiceCapture";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import { WebCommunityChatLightboxModal } from "./WebCommunityChatLightboxModal";
import { WebMobileDrawer } from "./WebMobileDrawer";
import {
  CommunityInteractionContextPanelSurface,
  WebCommunityInteractionProjection,
  type WebCommunityInteractionProjectionProps,
} from "./WebCommunityInteractionProjection";
import { WebCommunityProfilePanel } from "./WebCommunityProfilePanel";
import {
  MentionAutocompleteMenu,
  MentionComposerHighlight,
  handleMentionTokenBackspace,
  useMentionAutocomplete,
  type CommittedMention,
  type MentionCandidate,
} from "./communityMentionAutocomplete";
import type { CloudCommunityAgentServeIssue } from "../../../../shared/cloudCommunityAgentConciergeGateway";

type CommunityChatMessage = SharedCommunityChatMessage<CommunityMessageAttachment>;
type CommunityActivityEvent = SharedCommunityActivityEvent;
type MessageReaction = SharedMessageReaction;
type CommunityTypingPresenceBundle = SharedCommunityTypingPresenceBundle;
type CommunityTypingPresenceUser = SharedCommunityTypingPresenceUser;
type UserProfile = SharedUserProfile;
type ProfileCommunityContext = SharedProfileCommunityContext;
type CommunityMentionMember = {
  user_id?: string | null;
};
type CommunityReplyTarget = Pick<CommunityChatMessage, "id" | "sender_id" | "body"> & {
  interaction_root_id?: string | null;
  interaction_reply_id?: string | null;
  legacy_message_id?: string | null;
};

type CommunityChatSendDraft = {
  text?: string;
  attachments?: CommunityMessageAttachment[];
  replyingToMessage?: CommunityReplyTarget | null;
  mentions?: CommittedMention[];
  inputRef?: MutableRefObject<HTMLTextAreaElement | null> | null;
  clearDraft?: () => void;
  restoreDraft?: () => void;
};

type CommunityVoiceTranscriptTarget = {
  appendTranscript: (transcript: string) => void;
  focusInput?: () => void;
};

type CommunityVoiceButtonOwner = "main" | "drawer";

type CommunityChatMessageViewModel = {
  message: CommunityChatMessage;
  showMeta: boolean;
  isOwn: boolean;
  isPending: boolean;
  senderLabel: string;
  senderProfile: UserProfile | null;
  avatarUrl: string | null;
  avatarColor: string;
  shortTime: string;
  formattedTime: string;
  replyToId: string | null;
  replyTarget: CommunityChatMessage | null;
  reactions: MessageReaction[];
};

type CommunityChatTimelineItem =
  | {
      kind: "activity";
      key: string;
      createdAt: string;
      dateSeparator: string | null;
      event: CommunityActivityEvent;
    }
  | {
      kind: "message";
      key: string;
      createdAt: string;
      dateSeparator: string | null;
      viewModel: CommunityChatMessageViewModel;
    };

type CommunityChatTimelineDraftItem =
  | {
      kind: "activity";
      key: string;
      createdAt: string;
      event: CommunityActivityEvent;
    }
  | {
      kind: "message";
      key: string;
      createdAt: string;
      viewModel: CommunityChatMessageViewModel;
    };

const EMPTY_MESSAGE_REACTIONS: MessageReaction[] = [];
const EMPTY_PROFILE_COMMUNITY_CONTEXT: ProfileCommunityContext = {
  owned_communities: [],
  mutual_communities: [],
  is_self: false,
  can_message: false,
  message_context_community_id: null,
  message_unavailable_reason: "no_mutual_community",
};
const EMPTY_MENTION_CANDIDATES: MentionCandidate[] = [];

const COMMUNITY_ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,.mp4,.webm,.mov,.m4v,.mp3,.wav,.m4a,.ogg,.aac,.flac,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.pdf";
const COMMUNITY_COMPOSER_FOCUS_MEDIA_QUERY = "(min-width: 901px)";
const COMMUNITY_COMPOSER_IDEA_PLACEHOLDER_INTERVAL_MS = 6500;
const COMMUNITY_COMPOSER_REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

function syncMentionComposerHighlightScroll(textarea: HTMLTextAreaElement): void {
  textarea.parentElement?.style.setProperty("--mention-composer-scroll-top", `${textarea.scrollTop}px`);
}

function isCommunityComposerEditableElement(element: Element | null): boolean {
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

function shouldPreserveCommunityComposerFocus(activeElement: Element | null, input: HTMLTextAreaElement): boolean {
  if (!activeElement) return false;
  if (activeElement === input) return true;
  if (activeElement === document.body || activeElement === document.documentElement) return false;
  if (isCommunityComposerEditableElement(activeElement)) return true;
  return Boolean(
    activeElement.closest(
      [
        ".modal",
        ".modal-overlay",
        "[role='dialog']",
        ".chat-edit-form",
        ".community-interaction-edit",
        ".community-profile-panel",
      ].join(","),
    ),
  );
}

function isCommunityComposerTransferSource(
  activeElement: Element,
  refs: Array<MutableRefObject<HTMLTextAreaElement | null>> | undefined,
): boolean {
  return Boolean(refs?.some((ref) => ref.current && activeElement === ref.current));
}

function buildCommunityComposerIdeaPlaceholders(params: {
  activeCommunityName?: string | null;
}): string[] {
  const agentName = String(params.activeCommunityName ?? "").trim();
  return [
    "Ask the community a question...",
    "Share what you are working on...",
    "Type @ to tag a member...",
    ...(agentName ? [`Tag @${agentName} to ask the community agent...`] : []),
  ];
}

function mentionCandidateKey(candidate: MentionCandidate): string {
  if (candidate.kind === "role") return `role:${candidate.roleKey ?? "everybody"}`;
  if (candidate.kind === "community_agent") return "agent:community_agent";
  return `user:${candidate.userId}`;
}

function mergeMentionCandidates(
  primary: readonly MentionCandidate[],
  fallback: readonly MentionCandidate[],
): MentionCandidate[] {
  const seen = new Set<string>();
  const merged: MentionCandidate[] = [];
  for (const candidate of [...primary, ...fallback]) {
    const key = mentionCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged;
}

function buildUserMentionFromProfile(
  userId: string,
  profile: UserProfile | null,
  fallbackDisplayName: string,
): CommittedMention | null {
  const normalizedUserId = String(userId ?? "").trim();
  const handle = String(profile?.handle ?? "").trim().replace(/^@+/, "");
  if (!normalizedUserId || !handle) return null;
  const displayName = String(profile?.display_name ?? fallbackDisplayName ?? "").trim() || handle;
  return {
    userId: normalizedUserId,
    displayName,
    token: `@${handle}`,
    kind: "user",
  };
}

function mapCloudMentionCandidate(row: CloudCommunityMentionCandidateRow): MentionCandidate | null {
  const kind =
    row.kind === "community_agent" || row.kind === "role" || row.kind === "user"
      ? row.kind
      : "user";
  const handle = String(row.handle ?? "").trim().replace(/^@+/, "") || null;
  const userId = String(row.user_id ?? "").trim() || (
    kind === "community_agent" ? "community_agent" : kind === "role" ? "role:everybody" : ""
  );
  if (!userId) return null;
  const displayName = String(row.display_name ?? "").trim() || handle || (
    kind === "role" ? "Everybody" : kind === "community_agent" ? "Community agent" : ""
  );
  if (!displayName) return null;
  const emailMode =
    row.email_mode === "in_app_only" || row.email_mode === "in_app_and_email"
      ? row.email_mode
      : null;
  return {
    userId,
    displayName,
    handle,
    avatarUrl: String(row.avatar_url ?? "").trim() || null,
    premiumBadge: row.premium_badge ?? null,
    kind,
    ...(kind === "role" ? { roleKey: "everybody" as const } : {}),
    ...(kind === "role" ? { emailMode, emailCooldownUntil: row.email_cooldown_until ?? null } : {}),
    ...(row.subtitle ? { subtitle: row.subtitle } : {}),
    ...(Array.isArray(row.match_aliases) ? { matchAliases: row.match_aliases } : {}),
  };
}

export type WebCommunityChatPanelProps = {
  activeCommunity: { id: string; name: string; owner_id?: string | null } | null;
  session: unknown | null;
  isResolvingSelectedCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  hasSession: boolean;
  onOpenDirectMessageFromCommunity?: (targetUserId: string, communityId: string) => void;
  sessionUserId: string | null;
  canPostMessages: boolean;
  isProfileSetupComplete: boolean;
  canModerateMessages: boolean;
  canMentionEverybody: boolean;
  /** Authoritative community member count for the @everybody row copy. */
  everybodyMemberCount: number | null;
  isLoadingChat: boolean;
  hasResolvedCommunityChat: boolean;
  isLoadingMoreChat: boolean;
  communityChatHasMore: boolean;
  communityMessages: CommunityChatMessage[];
  communityActivityEvents: CommunityActivityEvent[];
  communityMessageById: Map<string, CommunityChatMessage>;
  messageReactions: MessageReaction[];
  typingPresence: CommunityTypingPresenceBundle;
  onThreadTypingSignal?: (rootId: string) => void;
  profilesByUserId: Record<string, UserProfile>;
  mentionableCommunityMembers: CommunityMentionMember[];
  editingMessageId: string | null;
  editingMessageText: string;
  reactionPickerMessageId: string | null;
  replyingToMessage: CommunityReplyTarget | null;
  communityAttachments: CommunityMessageAttachment[];
  communityMessageInput: string;
  communityMessageMentions: CommittedMention[];
  setCommunityMessageMentions: (
    update: CommittedMention[] | ((prev: CommittedMention[]) => CommittedMention[]),
  ) => void;
  communityAgentServeIssue: CloudCommunityAgentServeIssue | null;
  onDismissCommunityAgentServeIssue: (issueId: string) => void;
  onConnectCommunityAgentServeProvider: () => void;
  isSendingCommunityMessage: boolean;
  communityChatError: string | null;
  isUserAtBottom: boolean;
  unreadCount: number;
  copiedCommunityMessageId: string | null;
  reactionEmojis: string[];
  messageListRef: MutableRefObject<HTMLDivElement | null>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  onChatScroll: UIEventHandler<HTMLDivElement>;
  onRequireSignIn: () => void;
  onFinishProfileSetup: () => void;
  onScrollToBottom: () => void;
  onSetReplyingToMessage: (message: CommunityReplyTarget | null) => void;
  onRemoveCommunityAttachment: (id: string) => void;
  onCommunityAttachmentError: Dispatch<SetStateAction<string | null>>;
  onIngestCommunityAttachmentsFromFileList: (
    files: FileList | readonly File[],
    existing: CommunityMessageAttachment[],
    onError: (message: string) => void,
  ) => Promise<CommunityMessageAttachment[]>;
  onCommunityFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onCommunityAttachmentDrop: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentDragEnter: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentDragOver: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentDragLeave: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  isCommunityAttachmentDragOver: boolean;
  onCommunityMessageInputChange: (value: string, textarea: HTMLTextAreaElement) => void;
  onSendCommunityMessage: (draft?: CommunityChatSendDraft) => void | Promise<void>;
  displayName: (userId: string) => string;
  shouldShowCommunitySenderMeta: (messages: CommunityChatMessage[], index: number) => boolean;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  formatChatTime: (value: string) => string;
  parseReplyPrefix: (body: string) => ReplyPrefix | null;
  truncateReplyPreview: (value: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onScrollToReplyMessage: (replyMessageId: string) => void;
  onOpenCommunityChatLightbox: (images: CommunityChatMediaImage[], index: number) => void;
  onToggleReaction: (messageId: string, emoji: string) => void | Promise<void>;
  onSetReactionPickerMessageId: (messageId: string | null) => void;
  onStartReply: (message: CommunityReplyTarget) => void;
  onCopyMessage: (messageId: string, body: string) => void | Promise<void>;
  onStartEdit: (message: Pick<CommunityChatMessage, "id" | "body">) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onEditingMessageTextChange: (value: string) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
  voiceButtonProps: ComponentProps<typeof VoiceInputButton>;
  drawerVoiceButtonProps: Omit<ComponentProps<typeof VoiceInputButton>, "onClick">;
  onCommunityVoiceInputClick: (
    target: CommunityVoiceTranscriptTarget | null,
    owner: CommunityVoiceButtonOwner,
  ) => void;
  lightboxModalProps: ComponentProps<typeof WebCommunityChatLightboxModal>;
  mobileMembersOverlayOpen?: boolean;
  onCloseMobileMembersOverlay?: () => void;
  interactionProjection?: Omit<
    WebCommunityInteractionProjectionProps,
    | "activeCommunityName"
    | "profilesByUserId"
    | "displayName"
    | "getAvatarColor"
    | "getInitials"
    | "formatChatTime"
    | "renderTextWithLinks"
  > & {
    enabled: boolean;
  };
};

function parseTimelineTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function resolveTimelineDateSeparator(createdAt: string, previousCreatedAt: string | null): string | null {
  const current = new Date(createdAt);
  if (!Number.isFinite(current.getTime())) return null;
  if (!previousCreatedAt) return formatDateSeparator(current);
  const previous = new Date(previousCreatedAt);
  if (!Number.isFinite(previous.getTime())) return formatDateSeparator(current);
  return previous.toDateString() === current.toDateString() ? null : formatDateSeparator(current);
}

function formatCommunityActivityLabel(
  event: CommunityActivityEvent,
  displayName: (userId: string) => string,
): string {
  const title = String(event.target_title ?? "").trim();
  const titleSuffix = title ? `: ${title}` : "";
  switch (event.type) {
    case "member_joined": {
      const actorName = event.actor_user_id ? displayName(event.actor_user_id) : "A member";
      return `${actorName} joined the community`;
    }
    case "resource_added":
      return `New resource added${titleSuffix}`;
    case "ai_feed_post_added":
      return `New AI Feed post added${titleSuffix}`;
    case "event_soon":
      return title ? `${title} starts soon` : "Event starts soon";
    case "event_starting":
      return title ? `${title} is starting now` : "Event is starting now";
    default:
      return "Community activity";
  }
}

export function WebCommunityChatPanel(props: WebCommunityChatPanelProps) {
  const {
    activeCommunity,
    session,
    isResolvingSelectedCommunity,
    hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn,
    hasSession,
    onOpenDirectMessageFromCommunity,
    sessionUserId,
    canPostMessages,
    isProfileSetupComplete,
    canModerateMessages,
    canMentionEverybody,
    everybodyMemberCount,
    isLoadingChat,
    hasResolvedCommunityChat,
    isLoadingMoreChat,
    communityChatHasMore,
    communityMessages,
    communityActivityEvents,
    communityMessageById,
    messageReactions,
    typingPresence,
    onThreadTypingSignal,
    profilesByUserId,
    mentionableCommunityMembers,
    editingMessageId,
    editingMessageText,
    reactionPickerMessageId,
    replyingToMessage,
    communityAttachments,
    communityMessageInput,
    communityMessageMentions,
    setCommunityMessageMentions,
    communityAgentServeIssue,
    onDismissCommunityAgentServeIssue,
    onConnectCommunityAgentServeProvider,
    isSendingCommunityMessage,
    communityChatError,
    isUserAtBottom,
    unreadCount,
    copiedCommunityMessageId,
    reactionEmojis,
    messageListRef,
    fileInputRef,
    chatInputRef,
    onChatScroll,
    onRequireSignIn,
    onFinishProfileSetup,
    onScrollToBottom,
    onSetReplyingToMessage,
    onRemoveCommunityAttachment,
    onCommunityAttachmentError,
    onIngestCommunityAttachmentsFromFileList,
    onCommunityFileInputChange,
    onCommunityAttachmentDrop,
    onCommunityAttachmentDragEnter,
    onCommunityAttachmentDragOver,
    onCommunityAttachmentDragLeave,
    onCommunityAttachmentPaste,
    isCommunityAttachmentDragOver,
    onCommunityMessageInputChange,
    onSendCommunityMessage,
    displayName,
    shouldShowCommunitySenderMeta,
    getAvatarColor,
    getInitials,
    formatChatTime,
    parseReplyPrefix,
    truncateReplyPreview,
    renderTextWithLinks,
    onScrollToReplyMessage,
    onOpenCommunityChatLightbox,
    onToggleReaction,
    onSetReactionPickerMessageId,
    onStartReply,
    onCopyMessage,
    onStartEdit,
    onDeleteMessage,
    onEditingMessageTextChange,
    onSaveEdit,
    onCancelEdit,
    voiceButtonProps,
    drawerVoiceButtonProps,
    onCommunityVoiceInputClick,
    lightboxModalProps,
    mobileMembersOverlayOpen = false,
    onCloseMobileMembersOverlay,
    interactionProjection,
  } = props;
  const isProfileSetupGateActive = hasSession && Boolean(activeCommunity) && canPostMessages && !isProfileSetupComplete;
  const canUseComposer = canPostMessages && !isProfileSetupGateActive;
  const [profilePanelUserId, setProfilePanelUserId] = useState<string | null>(null);
  const [profileCommunityContextByUserId, setProfileCommunityContextByUserId] = useState<
    Record<string, ProfileCommunityContext>
  >({});
  const [drawerReplyTarget, setDrawerReplyTarget] = useState<CommunityReplyTarget | null>(null);
  const [drawerReplyInput, setDrawerReplyInput] = useState("");
  const [drawerReplyMentions, setDrawerReplyMentions] = useState<CommittedMention[]>([]);
  const [drawerReplyAttachments, setDrawerReplyAttachments] = useState<CommunityMessageAttachment[]>([]);
  const drawerReplyAttachmentsRef = useRef<CommunityMessageAttachment[]>([]);
  const drawerReplyAutoSeedTokenRef = useRef<string | null>(null);
  const drawerReplyFileInputRef = useRef<HTMLInputElement | null>(null);
  const drawerReplyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastCommunityComposerFocusTargetRef = useRef<string | null>(null);
  const [isDesktopCommunityFocusViewport, setIsDesktopCommunityFocusViewport] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(COMMUNITY_COMPOSER_FOCUS_MEDIA_QUERY).matches,
  );
  const [shouldReduceCommunityComposerPlaceholderMotion, setShouldReduceCommunityComposerPlaceholderMotion] = useState(
    () =>
      typeof window === "undefined"
        ? false
        : window.matchMedia(COMMUNITY_COMPOSER_REDUCED_MOTION_MEDIA_QUERY).matches,
  );
  const [communityComposerIdeaPlaceholderIndex, setCommunityComposerIdeaPlaceholderIndex] = useState(0);
  const [mainMentionQuery, setMainMentionQuery] = useState<string | null>(null);
  const [drawerMentionQuery, setDrawerMentionQuery] = useState<string | null>(null);
  const [remoteMentionSearch, setRemoteMentionSearch] = useState<{
    communityId: string;
    owner: "main" | "drawer";
    query: string;
    includeRoles: boolean;
    candidates: MentionCandidate[];
  } | null>(null);
  const mentionSearchSeqRef = useRef(0);

  const setDrawerReplyAttachmentsAndRef = useCallback<
    Dispatch<SetStateAction<CommunityMessageAttachment[]>>
  >((update) => {
    setDrawerReplyAttachments((previous) => {
      const next =
        typeof update === "function"
          ? (update as (value: CommunityMessageAttachment[]) => CommunityMessageAttachment[])(previous)
          : update;
      drawerReplyAttachmentsRef.current = next;
      return next;
    });
  }, []);

  const {
    handleAttachmentFileInputChange: handleDrawerReplyFileInputChange,
    handleAttachmentPaste: handleDrawerReplyAttachmentPaste,
    removeAttachment: removeDrawerReplyAttachment,
  } = useMessageAttachmentInputController<CommunityMessageAttachment>({
    attachmentsRef: drawerReplyAttachmentsRef,
    setAttachments: setDrawerReplyAttachmentsAndRef,
    setError: onCommunityAttachmentError,
    ingestAttachmentsFromFileList: onIngestCommunityAttachmentsFromFileList,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(COMMUNITY_COMPOSER_FOCUS_MEDIA_QUERY);
    const applyViewport = (matches: boolean) => {
      setIsDesktopCommunityFocusViewport(matches);
    };
    applyViewport(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => applyViewport(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(COMMUNITY_COMPOSER_REDUCED_MOTION_MEDIA_QUERY);
    const applyPreference = (matches: boolean) => {
      setShouldReduceCommunityComposerPlaceholderMotion(matches);
    };
    applyPreference(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => applyPreference(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  const focusCommunityComposerSafely = useCallback((
    inputRef: MutableRefObject<HTMLTextAreaElement | null>,
    options?: {
      force?: boolean;
      maxHeightPx?: number;
      transferFromRefs?: Array<MutableRefObject<HTMLTextAreaElement | null>>;
    },
  ) => {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    if (!isDesktopCommunityFocusViewport) return false;
    const input = inputRef.current;
    if (!input || input.disabled || input.readOnly) return false;

    if (!options?.force) {
      const activeElement = document.activeElement;
      if (activeElement instanceof Element) {
        if (
          !isCommunityComposerTransferSource(activeElement, options?.transferFromRefs) &&
          shouldPreserveCommunityComposerFocus(activeElement, input)
        ) {
          return activeElement === input;
        }
      }
    }

    window.requestAnimationFrame(() => {
      if (!input.isConnected || input.disabled || input.readOnly) return;
      if (!options?.force) {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof Element &&
          !isCommunityComposerTransferSource(activeElement, options?.transferFromRefs) &&
          shouldPreserveCommunityComposerFocus(activeElement, input) &&
          activeElement !== input
        ) {
          return;
        }
      }
      input.style.height = "auto";
      if (options?.maxHeightPx) {
        input.style.height = `${Math.min(input.scrollHeight, options.maxHeightPx)}px`;
      }
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        // Some platform-managed textarea states can reject selection updates.
      }
    });
    return true;
  }, [isDesktopCommunityFocusViewport]);

  const mainComposerIdeaPlaceholders = useMemo(
    () =>
      buildCommunityComposerIdeaPlaceholders({
        activeCommunityName: activeCommunity?.name,
      }),
    [activeCommunity?.name],
  );
  const canShowMainComposerIdeaPlaceholder = Boolean(
    hasSession &&
      activeCommunity &&
      canUseComposer &&
      canPostMessages &&
      !isAuthRecoveringSignedIn &&
      !isResolvingSelectedCommunity &&
      communityMessageInput.trim().length === 0 &&
      !replyingToMessage,
  );
  const mainCommunityComposerIdeaPlaceholder =
    mainComposerIdeaPlaceholders[
      (shouldReduceCommunityComposerPlaceholderMotion ? 0 : communityComposerIdeaPlaceholderIndex) %
        Math.max(mainComposerIdeaPlaceholders.length, 1)
    ] ?? "Message the community...";

  useEffect(() => {
    setCommunityComposerIdeaPlaceholderIndex(0);
  }, [activeCommunity?.id, activeCommunity?.name]);

  useEffect(() => {
    if (
      !canShowMainComposerIdeaPlaceholder ||
      shouldReduceCommunityComposerPlaceholderMotion ||
      mainComposerIdeaPlaceholders.length <= 1
    ) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setCommunityComposerIdeaPlaceholderIndex((index) => (index + 1) % mainComposerIdeaPlaceholders.length);
    }, COMMUNITY_COMPOSER_IDEA_PLACEHOLDER_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [
    canShowMainComposerIdeaPlaceholder,
    mainComposerIdeaPlaceholders.length,
    shouldReduceCommunityComposerPlaceholderMotion,
  ]);

  const activeMentionOwner: "main" | "drawer" | null =
    mainMentionQuery !== null ? "main" : drawerMentionQuery !== null ? "drawer" : null;
  const activeMentionQuery = mainMentionQuery ?? drawerMentionQuery;
  const activeMentionIncludesRoles = activeMentionOwner === "main" && !replyingToMessage;

  // Fast fallback while the backend search hydrates: already-loaded active
  // community directory members with handles, except yourself.
  const localMentionCandidateParts = useMemo<{
    agentCandidate: MentionCandidate | null;
    everybodyCandidate: MentionCandidate | null;
    memberCandidates: MentionCandidate[];
  }>(() => {
    const seenMemberIds = new Set<string>();
    const memberCandidates = mentionableCommunityMembers
      .reduce<MentionCandidate[]>((candidates, member) => {
        const userId = String(member.user_id ?? "").trim();
        if (!userId || userId === sessionUserId || seenMemberIds.has(userId)) return candidates;
        seenMemberIds.add(userId);
        const profile = profilesByUserId[userId];
        if (!profile) return candidates;
        const handle = String(profile.handle ?? "").trim();
        if (!handle) return candidates;
        const label = displayName(userId).trim() || handle;
        candidates.push({
          userId,
          displayName: label,
          handle,
          avatarUrl: profile.avatar_url ?? null,
          premiumBadge: profile.premium_badge ?? null,
        });
        return candidates;
      }, [])
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const everybodyCandidate: MentionCandidate | null = canMentionEverybody
      ? {
          userId: "role:everybody",
          displayName: "Everybody",
          handle: "everybody",
          avatarUrl: null,
          kind: "role" as const,
          roleKey: "everybody" as const,
          subtitle:
            typeof everybodyMemberCount === "number" && everybodyMemberCount > 0
              ? `Notifies ${everybodyMemberCount.toLocaleString()}; email mode checked on send`
              : "Notifies everyone; email mode checked on send",
          matchAliases: ["everyone"],
        }
      : null;
    // The community agent is taggable inside its own community, pinned first and
    // always badged. V0 token/name = the community's own name; the backend stores
    // the stable (communityId, community_agent) identity.
    const agentDisplayName = String(activeCommunity?.name ?? "").trim();
    const agentCandidate: MentionCandidate | null = agentDisplayName
      ? {
          userId: "community_agent",
          displayName: agentDisplayName,
          handle: null,
          avatarUrl: null,
          kind: "community_agent" as const,
        }
      : null;
    return { agentCandidate, everybodyCandidate, memberCandidates };
  }, [
    activeCommunity?.name,
    canMentionEverybody,
    displayName,
    everybodyMemberCount,
    mentionableCommunityMembers,
    profilesByUserId,
    sessionUserId,
  ]);
  const localMainMentionCandidates = useMemo<MentionCandidate[]>(
    () => [
      ...(localMentionCandidateParts.agentCandidate ? [localMentionCandidateParts.agentCandidate] : []),
      ...(!replyingToMessage && localMentionCandidateParts.everybodyCandidate
        ? [localMentionCandidateParts.everybodyCandidate]
        : []),
      ...localMentionCandidateParts.memberCandidates,
    ],
    [localMentionCandidateParts, replyingToMessage],
  );
  const localReplyMentionCandidates = useMemo<MentionCandidate[]>(
    () => [
      ...(localMentionCandidateParts.agentCandidate ? [localMentionCandidateParts.agentCandidate] : []),
      ...localMentionCandidateParts.memberCandidates,
    ],
    [localMentionCandidateParts],
  );

  useEffect(() => {
    mentionSearchSeqRef.current += 1;
    setMainMentionQuery(null);
    setDrawerMentionQuery(null);
    setRemoteMentionSearch(null);
  }, [activeCommunity?.id]);

  useEffect(() => {
    const communityId = String(activeCommunity?.id ?? "").trim();
    if (!session || !communityId || activeMentionOwner === null || activeMentionQuery === null || !canUseComposer) {
      mentionSearchSeqRef.current += 1;
      setRemoteMentionSearch(null);
      return;
    }
    const query = activeMentionQuery;
    const owner = activeMentionOwner;
    const includeRoles = activeMentionIncludesRoles;
    const seq = (mentionSearchSeqRef.current += 1);
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchCloudCommunityMentionCandidates({
            session,
            communityId,
            query,
            limit: 8,
            includeRoles,
          });
          if (mentionSearchSeqRef.current !== seq) return;
          setRemoteMentionSearch({
            communityId,
            owner,
            query,
            includeRoles,
            candidates: rows
              .map(mapCloudMentionCandidate)
              .filter((candidate): candidate is MentionCandidate => Boolean(candidate)),
          });
        } catch {
          if (mentionSearchSeqRef.current === seq) {
            setRemoteMentionSearch(null);
          }
        }
      })();
    }, query.trim() ? 120 : 0);
    return () => window.clearTimeout(timeout);
  }, [
    activeCommunity?.id,
    activeMentionIncludesRoles,
    activeMentionOwner,
    activeMentionQuery,
    canUseComposer,
    session,
  ]);

  const activeRemoteMentionCandidates =
    remoteMentionSearch &&
    activeCommunity?.id === remoteMentionSearch.communityId &&
    activeMentionOwner === remoteMentionSearch.owner &&
    activeMentionIncludesRoles === remoteMentionSearch.includeRoles &&
    activeMentionQuery === remoteMentionSearch.query
      ? remoteMentionSearch.candidates
      : EMPTY_MENTION_CANDIDATES;
  const remoteMainMentionCandidates =
    activeMentionOwner === "main" ? activeRemoteMentionCandidates : EMPTY_MENTION_CANDIDATES;
  const remoteDrawerMentionCandidates =
    activeMentionOwner === "drawer" ? activeRemoteMentionCandidates : EMPTY_MENTION_CANDIDATES;
  const mainMentionCandidates = useMemo(
    () => mergeMentionCandidates(remoteMainMentionCandidates, localMainMentionCandidates),
    [localMainMentionCandidates, remoteMainMentionCandidates],
  );
  const drawerMentionCandidates = useMemo(
    () => mergeMentionCandidates(remoteDrawerMentionCandidates, localReplyMentionCandidates),
    [localReplyMentionCandidates, remoteDrawerMentionCandidates],
  );

  const mainMention = useMentionAutocomplete({
    candidates: mainMentionCandidates,
    textareaRef: chatInputRef,
    applyText: (value, textarea) => onCommunityMessageInputChange(value, textarea),
    onActiveQueryChange: setMainMentionQuery,
    onCommitMention: (mention) =>
      setCommunityMessageMentions((prev) =>
        prev.some((existing) => existing.userId === mention.userId) ? prev : [...prev, mention],
      ),
  });
  const selectedInteractionRootId = interactionProjection?.selectedRootId ?? null;
  const selectedInteractionRootBundle = selectedInteractionRootId
    ? (interactionProjection?.roots ?? []).find(
        (bundle) => bundle.root.id === selectedInteractionRootId,
      ) ?? null
    : null;
  const rootReplyTarget = useMemo<CommunityReplyTarget | null>(() => {
    const root = selectedInteractionRootBundle?.root;
    if (!root?.id || !root.actor_user_id) return null;
    return {
      id: root.legacy_message_id ?? root.id,
      sender_id: root.actor_user_id,
      body: root.content_summary ?? "",
      interaction_root_id: root.id,
      interaction_reply_id: null,
      legacy_message_id: root.legacy_message_id ?? null,
    };
  }, [
    selectedInteractionRootBundle?.root.legacy_message_id,
    selectedInteractionRootBundle?.root.actor_user_id,
    selectedInteractionRootBundle?.root.id,
    selectedInteractionRootBundle?.root.content_summary,
  ]);

  const typingUsers = typingPresence.users;
  const typingTotalCount = Math.max(typingUsers.length, Math.floor(Number(typingPresence.total_count ?? 0)));
  const typingLabel =
    typingTotalCount === 0
      ? null
      : typingTotalCount === 1 && typingUsers[0]
        ? `${typingUsers[0].display_name || displayName(typingUsers[0].user_id)} is typing...`
        : typingTotalCount === 2 && typingUsers[0] && typingUsers[1]
          ? `${typingUsers[0].display_name || displayName(typingUsers[0].user_id)} and ${typingUsers[1].display_name || displayName(typingUsers[1].user_id)} are typing...`
          : typingUsers[0]
            ? `${typingUsers[0].display_name || displayName(typingUsers[0].user_id)} and ${typingTotalCount - 1} others are typing...`
            : `${typingTotalCount} people are typing...`;

  const reactionsByMessageId = useMemo(() => {
    const byMessageId = new Map<string, MessageReaction[]>();
    for (const reaction of messageReactions) {
      const reactions = byMessageId.get(reaction.message_id);
      if (reactions) {
        reactions.push(reaction);
      } else {
        byMessageId.set(reaction.message_id, [reaction]);
      }
    }
    return byMessageId;
  }, [messageReactions]);

  const messageViewModels = useMemo<CommunityChatMessageViewModel[]>(() => {
    return communityMessages.map((message, index) => {
      const senderProfile = profilesByUserId[message.sender_id] ?? null;
      const replyToId = message.reply_to_id ?? null;
      return {
        message,
        showMeta: shouldShowCommunitySenderMeta(communityMessages, index),
        isOwn: message.sender_id === sessionUserId,
        isPending: message.id.startsWith("pending-"),
        senderLabel: displayName(message.sender_id),
        senderProfile,
        avatarUrl: senderProfile?.avatar_url ?? null,
        avatarColor: getAvatarColor(message.sender_id),
        shortTime: new Date(message.created_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        formattedTime: formatChatTime(message.created_at),
        replyToId,
        replyTarget: replyToId ? communityMessageById.get(replyToId) ?? null : null,
        reactions: reactionsByMessageId.get(message.id) ?? EMPTY_MESSAGE_REACTIONS,
      };
    });
  }, [
    communityMessageById,
    communityMessages,
    displayName,
    formatChatTime,
    getAvatarColor,
    profilesByUserId,
    reactionsByMessageId,
    sessionUserId,
    shouldShowCommunitySenderMeta,
  ]);

  const timelineItems = useMemo<CommunityChatTimelineItem[]>(() => {
    const items: CommunityChatTimelineDraftItem[] = [
      ...messageViewModels.map((viewModel) => ({
        kind: "message" as const,
        key: `message:${viewModel.message.id}`,
        createdAt: viewModel.message.created_at,
        viewModel,
      })),
      ...communityActivityEvents.map((event) => ({
        kind: "activity" as const,
        key: `activity:${event.id}`,
        createdAt: event.created_at,
        event,
      })),
    ];
    items.sort((a, b) => {
      const byTime = parseTimelineTime(a.createdAt) - parseTimelineTime(b.createdAt);
      if (byTime !== 0) return byTime;
      if (a.kind === b.kind) return a.key.localeCompare(b.key);
      return a.kind === "activity" ? -1 : 1;
    });
    let previousCreatedAt: string | null = null;
    return items.map((item) => {
      const dateSeparator = resolveTimelineDateSeparator(item.createdAt, previousCreatedAt);
      previousCreatedAt = item.createdAt;
      return { ...item, dateSeparator };
    });
  }, [communityActivityEvents, messageViewModels]);

  const hasCommunityTimelineItems = communityMessages.length > 0 || communityActivityEvents.length > 0;
  const profilePanelProfile = profilePanelUserId ? profilesByUserId[profilePanelUserId] ?? null : null;
  const profilePanelDisplayName = profilePanelUserId
    ? String(profilePanelProfile?.display_name ?? displayName(profilePanelUserId) ?? "").trim() ||
      displayName(profilePanelUserId)
    : "";
  const profilePanelAvatarColor = profilePanelUserId ? getAvatarColor(profilePanelUserId) : "transparent";
  const loadedProfilePanelCommunityContext = profilePanelUserId
    ? profileCommunityContextByUserId[profilePanelUserId] ?? null
    : null;
  const profilePanelCommunityContext = loadedProfilePanelCommunityContext ?? EMPTY_PROFILE_COMMUNITY_CONTEXT;
  const canOpenDirectMessageFromCommunity = Boolean(
    hasSession && activeCommunity?.id && onOpenDirectMessageFromCommunity,
  );
  const showInteractionProjection = Boolean(
    interactionProjection?.enabled &&
    activeCommunity &&
    hasAuthenticatedPresentation &&
    hasResolvedCommunityChat &&
    !isLoadingChat,
  );
  const communityComposerFocusTargetKey = (() => {
    if (
      !activeCommunity?.id ||
      !hasAuthenticatedPresentation ||
      isAuthRecoveringSignedIn ||
      !canUseComposer ||
      !hasResolvedCommunityChat ||
      isLoadingChat ||
      profilePanelUserId
    ) {
      return null;
    }
    if (showInteractionProjection && selectedInteractionRootId && drawerReplyTarget) {
      return `thread:${selectedInteractionRootId}`;
    }
    return `main:${activeCommunity.id}`;
  })();

  useEffect(() => {
    setProfilePanelUserId(null);
    setProfileCommunityContextByUserId({});
  }, [activeCommunity?.id]);

  useEffect(() => {
    if (!communityComposerFocusTargetKey) {
      lastCommunityComposerFocusTargetRef.current = null;
      return;
    }
    if (lastCommunityComposerFocusTargetRef.current === communityComposerFocusTargetKey) return;
    lastCommunityComposerFocusTargetRef.current = communityComposerFocusTargetKey;
    const isThreadTarget = communityComposerFocusTargetKey.startsWith("thread:");
    const inputRef = isThreadTarget
      ? drawerReplyInputRef
      : chatInputRef;
    focusCommunityComposerSafely(inputRef, {
      maxHeightPx: 120,
      transferFromRefs: isThreadTarget ? [chatInputRef] : [drawerReplyInputRef],
    });
  }, [chatInputRef, communityComposerFocusTargetKey, focusCommunityComposerSafely]);

  useEffect(() => {
    setDrawerReplyTarget(rootReplyTarget);
    setDrawerReplyInput("");
    setDrawerReplyMentions([]);
    drawerReplyAutoSeedTokenRef.current = null;
    setDrawerReplyAttachmentsAndRef([]);
    if (drawerReplyInputRef.current) {
      drawerReplyInputRef.current.style.height = "auto";
    }
  }, [activeCommunity?.id, rootReplyTarget, setDrawerReplyAttachmentsAndRef]);

  useEffect(() => {
    setProfileCommunityContextByUserId({});
  }, [sessionUserId]);

  useEffect(() => {
    const targetUserId = profilePanelUserId;
    if (!targetUserId || !session || profileCommunityContextByUserId[targetUserId]) return;
    let cancelled = false;
    void fetchCloudProfileCommunityContext({
      session,
      targetUserId,
      preferredCommunityId: activeCommunity?.id ?? null,
    })
      .then((context) => {
        if (cancelled) return;
        setProfileCommunityContextByUserId((previous) => ({
          ...previous,
          [targetUserId]: context,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setProfileCommunityContextByUserId((previous) => ({
          ...previous,
          [targetUserId]: EMPTY_PROFILE_COMMUNITY_CONTEXT,
        }));
      })
    return () => {
      cancelled = true;
    };
  }, [activeCommunity?.id, profileCommunityContextByUserId, profilePanelUserId, session]);

  useEffect(() => {
    if (!profilePanelUserId) return;
    // The canonical chat docks the profile into the right panel (closed via the back
    // button), so click-outside-to-close only applies to the legacy floating card.
    if (showInteractionProjection) return;

    const handleProfilePanelPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const panel = document.querySelector(".community-profile-panel");
      if (panel?.contains(target)) return;
      setProfilePanelUserId(null);
    };

    document.addEventListener("pointerdown", handleProfilePanelPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleProfilePanelPointerDown, true);
    };
  }, [profilePanelUserId, showInteractionProjection]);

  const openDirectMessage = useCallback((targetUserId: string, sourceCommunityIdOverride?: string | null) => {
    const normalizedTargetUserId = String(targetUserId ?? "").trim();
    const sourceCommunityId = String(sourceCommunityIdOverride ?? activeCommunity?.id ?? "").trim();
    if (!normalizedTargetUserId || !sourceCommunityId || !onOpenDirectMessageFromCommunity) return;
    if (normalizedTargetUserId === sessionUserId) return;
    setProfilePanelUserId(null);
    onOpenDirectMessageFromCommunity(normalizedTargetUserId, sourceCommunityId);
  }, [activeCommunity?.id, onOpenDirectMessageFromCommunity, sessionUserId]);

  const profilePanelElement = profilePanelUserId ? (
    <WebCommunityProfilePanel
      profile={profilePanelProfile}
      displayName={profilePanelDisplayName}
      avatarColor={profilePanelAvatarColor}
      communityContext={profilePanelCommunityContext}
      isSelfProfile={profilePanelCommunityContext.is_self || Boolean(profilePanelUserId && sessionUserId && profilePanelUserId === sessionUserId)}
      isMessageDisabled={!canOpenDirectMessageFromCommunity || !profilePanelCommunityContext.can_message}
      onMessage={
        profilePanelUserId && profilePanelUserId !== sessionUserId && profilePanelCommunityContext.message_context_community_id
          ? () => openDirectMessage(profilePanelUserId, profilePanelCommunityContext.message_context_community_id)
          : undefined
      }
      getInitials={getInitials}
      docked={showInteractionProjection || mobileMembersOverlayOpen}
    />
  ) : null;

  const handleDrawerReplyInputChange = useCallback((value: string, textarea: HTMLTextAreaElement) => {
    setDrawerReplyInput(value);
    const autoSeedToken = drawerReplyAutoSeedTokenRef.current;
    if (autoSeedToken && value.trim() !== autoSeedToken) {
      drawerReplyAutoSeedTokenRef.current = null;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    if (value.trim() && selectedInteractionRootId) {
      onThreadTypingSignal?.(selectedInteractionRootId);
    }
  }, [selectedInteractionRootId, onThreadTypingSignal]);

  const drawerMention = useMentionAutocomplete({
    candidates: drawerMentionCandidates,
    textareaRef: drawerReplyInputRef,
    applyText: (value, textarea) => handleDrawerReplyInputChange(value, textarea),
    onActiveQueryChange: setDrawerMentionQuery,
    onCommitMention: (mention) =>
      setDrawerReplyMentions((prev) =>
        prev.some((existing) => existing.userId === mention.userId) ? prev : [...prev, mention],
      ),
  });

  const focusDrawerReplyInput = useCallback(() => {
    const input = drawerReplyInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    input.focus({ preventScroll: true });
    const end = input.value.length;
    try {
      input.setSelectionRange(end, end);
    } catch {
      // Selection can fail for platform-managed textarea states; focus still succeeded.
    }
  }, []);

  const appendDrawerVoiceTranscript = useCallback((transcript: string) => {
    const normalized = transcript.trim();
    if (!normalized) return;
    drawerReplyAutoSeedTokenRef.current = null;
    setDrawerReplyInput((previous) => mergeVoiceTranscript(previous, normalized));
    if (selectedInteractionRootId) {
      onThreadTypingSignal?.(selectedInteractionRootId);
    }
  }, [selectedInteractionRootId, onThreadTypingSignal]);

  const drawerVoiceTranscriptTarget = useMemo<CommunityVoiceTranscriptTarget>(
    () => ({
      appendTranscript: appendDrawerVoiceTranscript,
      focusInput: focusDrawerReplyInput,
    }),
    [appendDrawerVoiceTranscript, focusDrawerReplyInput],
  );

  const handleSendDrawerReply = useCallback(async () => {
    const target = drawerReplyTarget;
    const text = drawerReplyInput.trim();
    const attachments = [...drawerReplyAttachmentsRef.current];
    if (!target || (!text && attachments.length === 0)) return;
    // Only send mentions whose exact inserted token still survives as a real
    // mention token in the final text.
    const mentions = drawerReplyMentions.filter((mention) => textContainsMentionToken(text, mention.token));
    await onSendCommunityMessage({
      text,
      attachments,
      replyingToMessage: target,
      mentions,
      inputRef: drawerReplyInputRef,
      clearDraft: () => {
        setDrawerReplyInput("");
        setDrawerReplyMentions([]);
        drawerReplyAutoSeedTokenRef.current = null;
        setDrawerReplyAttachmentsAndRef([]);
      },
      restoreDraft: () => {
        setDrawerReplyTarget(target);
        setDrawerReplyInput(text);
        setDrawerReplyMentions(mentions);
        drawerReplyAutoSeedTokenRef.current = null;
        setDrawerReplyAttachmentsAndRef(attachments);
      },
    });
  }, [
    drawerReplyInput,
    drawerReplyMentions,
    drawerReplyTarget,
    onSendCommunityMessage,
    setDrawerReplyAttachmentsAndRef,
  ]);

  const showCommunityChatBootstrap =
    hasAuthenticatedPresentation &&
    (isAuthRecoveringSignedIn ||
    (isResolvingSelectedCommunity ||
      (!!activeCommunity &&
        !hasCommunityTimelineItems &&
        !communityChatError &&
        (isLoadingChat || !hasResolvedCommunityChat))));

  const renderCommunityAttachmentsPreview = (
    attachments: CommunityMessageAttachment[],
    onRemove: (id: string) => void,
    className = "community-attachments-preview",
  ) => {
    if (attachments.length === 0) return null;
    const { imageAttachments, fileAttachments } = partitionCommunityAttachments(attachments);
    const gridCount = Math.min(Math.max(imageAttachments.length, 1), 4);
    return (
      <div className={className}>
        {imageAttachments.length > 0 && (
          <div className={`chat-media-grid count-${gridCount} chat-media-grid-composer`}>
            {imageAttachments.map((item) => (
              <div key={item.attachment.id} className="chat-media-item chat-media-item-static">
                <img src={item.url} alt={item.name} />
                <button
                  type="button"
                  className="chat-media-remove"
                  onClick={() => onRemove(item.attachment.id)}
                  title="Remove"
                  aria-label={`Remove ${item.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {fileAttachments.length > 0 && (
          <div className="attachments-preview">
            {fileAttachments.map((att) => (
              <div key={att.id} className="attachment-item" title={att.name}>
                <div className="attachment-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                    <path d="M10 9H8" />
                  </svg>
                </div>
                <span className="attachment-name">{att.name}</span>
                <button
                  className="attachment-remove"
                  type="button"
                  onClick={() => onRemove(att.id)}
                  title="Remove"
                  aria-label={`Remove ${att.name}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCommunityAgentServeNotice = () => {
    if (!communityAgentServeIssue) return null;
    return (
      <div className="community-agent-serve-notice" role="status" aria-live="polite">
        <div className="community-agent-serve-notice-copy">
          <strong>Connect ChatGPT to use the community agent</strong>
          <span>{communityAgentServeIssue.message}</span>
        </div>
        <div className="community-agent-serve-notice-actions">
          <button
            className="community-agent-serve-notice-primary"
            type="button"
            onClick={onConnectCommunityAgentServeProvider}
          >
            Connect ChatGPT
          </button>
          <button
            className="community-agent-serve-notice-dismiss"
            type="button"
            onClick={() => onDismissCommunityAgentServeIssue(communityAgentServeIssue.id)}
            title="Dismiss"
            aria-label="Dismiss community agent connection notice"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const mainCommunityComposerPlaceholder = !hasSession
    ? "Sign in to chat..."
    : isAuthRecoveringSignedIn
      ? "Restoring your account..."
      : isResolvingSelectedCommunity
        ? "Loading community..."
        : !activeCommunity
          ? "Select a community to chat..."
          : isProfileSetupGateActive
            ? "Finish your profile to chat..."
            : !canPostMessages
              ? "Join this community to chat..."
              : canShowMainComposerIdeaPlaceholder
                ? mainCommunityComposerIdeaPlaceholder
                : "Message the community...";

  const mainCommunityComposer = (
    <>
      {replyingToMessage && (
        <div className="chat-replying-bar">
          <div className="chat-replying-content">
            <span className="chat-replying-label">Replying to</span>
            <span className="chat-replying-sender">{displayName(replyingToMessage.sender_id)}</span>
            <span className="chat-replying-preview">{truncateReplyPreview(replyingToMessage.body)}</span>
          </div>
          <button
            className="chat-replying-cancel"
            type="button"
            onClick={() => onSetReplyingToMessage(null)}
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <svg viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {renderCommunityAttachmentsPreview(communityAttachments, onRemoveCommunityAttachment)}

      {renderCommunityAgentServeNotice()}

      <div className="chat-input-bar">
        <MentionAutocompleteMenu
          autocomplete={mainMention}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
        />
        <button
          className="ask-icon-btn ask-plus"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage
          }
          aria-label="Attach files"
          title="Attach files"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <input
          ref={(node) => {
            fileInputRef.current = node;
          }}
          type="file"
          multiple
          accept={COMMUNITY_ATTACHMENT_ACCEPT}
          style={{ display: "none" }}
          onChange={onCommunityFileInputChange}
        />
        <div className="mention-composer-field">
          <MentionComposerHighlight
            value={communityMessageInput}
            mentions={communityMessageMentions}
          />
          <textarea
            ref={(node) => {
              chatInputRef.current = node;
            }}
            className="chat-input"
            placeholder={mainCommunityComposerPlaceholder}
            value={communityMessageInput}
            onChange={(event) => {
              onCommunityMessageInputChange(event.target.value, event.target);
              mainMention.syncFromTextarea(event.target);
              syncMentionComposerHighlightScroll(event.target);
            }}
            onClick={(event) => mainMention.syncFromTextarea(event.currentTarget)}
            onBlur={() => mainMention.close()}
            onScroll={(event) => syncMentionComposerHighlightScroll(event.currentTarget)}
            onPaste={onCommunityAttachmentPaste}
            onKeyDown={(event) => {
              if (mainMention.handleKeyDown(event)) return;
              if (
                handleMentionTokenBackspace({
                  event,
                  mentions: communityMessageMentions,
                  applyText: onCommunityMessageInputChange,
                  setMentions: setCommunityMessageMentions,
                })
              ) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (isAuthRecoveringSignedIn) return;
                void onSendCommunityMessage();
              }
            }}
            disabled={isAuthRecoveringSignedIn || !hasSession || !activeCommunity || !canUseComposer}
            rows={1}
          />
        </div>
        <VoiceInputButton {...voiceButtonProps} />
        <button
          className="chat-send ask-send-btn ask-send-btn-v2"
          onClick={() => void onSendCommunityMessage()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage ||
            (communityMessageInput.trim().length === 0 && communityAttachments.length === 0)
          }
          type="button"
          aria-label="Send"
          title="Send"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
          </svg>
        </button>
      </div>
    </>
  );

  const drawerReplyPlaceholder = drawerReplyTarget?.sender_id
    ? `Reply to ${displayName(drawerReplyTarget.sender_id).trim() || "this message"}...`
    : "Reply...";
  const drawerReplyComposer = drawerReplyTarget ? (
    <div className="community-interaction-reply-composer-panel">
      {renderCommunityAttachmentsPreview(
        drawerReplyAttachments,
        removeDrawerReplyAttachment,
        "community-attachments-preview community-interaction-reply-attachments-preview",
      )}
      {renderCommunityAgentServeNotice()}
      <div className="chat-input-bar community-interaction-reply-input-bar">
        <MentionAutocompleteMenu
          autocomplete={drawerMention}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
        />
        <button
          className="ask-icon-btn ask-plus"
          type="button"
          onClick={() => drawerReplyFileInputRef.current?.click()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage
          }
          aria-label="Attach files to reply"
          title="Attach files to reply"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <input
          ref={(node) => {
            drawerReplyFileInputRef.current = node;
          }}
          type="file"
          multiple
          accept={COMMUNITY_ATTACHMENT_ACCEPT}
          style={{ display: "none" }}
          onChange={handleDrawerReplyFileInputChange}
        />
        <div className="mention-composer-field">
          <MentionComposerHighlight
            value={drawerReplyInput}
            mentions={drawerReplyMentions}
          />
          <textarea
            ref={(node) => {
              drawerReplyInputRef.current = node;
            }}
            className="chat-input"
            placeholder={drawerReplyPlaceholder}
            value={drawerReplyInput}
            onChange={(event) => {
              handleDrawerReplyInputChange(event.target.value, event.target);
              drawerMention.syncFromTextarea(event.target);
              syncMentionComposerHighlightScroll(event.target);
            }}
            onClick={(event) => drawerMention.syncFromTextarea(event.currentTarget)}
            onBlur={() => drawerMention.close()}
            onScroll={(event) => syncMentionComposerHighlightScroll(event.currentTarget)}
            onPaste={handleDrawerReplyAttachmentPaste}
            onKeyDown={(event) => {
              if (drawerMention.handleKeyDown(event)) return;
              if (
                handleMentionTokenBackspace({
                  event,
                  mentions: drawerReplyMentions,
                  applyText: handleDrawerReplyInputChange,
                  setMentions: setDrawerReplyMentions,
                })
              ) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (isAuthRecoveringSignedIn) return;
                void handleSendDrawerReply();
              }
            }}
            disabled={isAuthRecoveringSignedIn || !hasSession || !activeCommunity || !canUseComposer}
            rows={1}
          />
        </div>
        <VoiceInputButton
          {...drawerVoiceButtonProps}
          onClick={() => onCommunityVoiceInputClick(drawerVoiceTranscriptTarget, "drawer")}
        />
        <button
          className="chat-send ask-send-btn ask-send-btn-v2"
          onClick={() => void handleSendDrawerReply()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage ||
            (drawerReplyInput.trim().length === 0 && drawerReplyAttachments.length === 0)
          }
          type="button"
          aria-label="Send reply"
          title="Send reply"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
          </svg>
        </button>
      </div>
    </div>
  ) : null;

  if (showCommunityChatBootstrap) {
    return (
      <>
        <div className="community-chat community-chat-bootstrap">
          <div className="workspace-body chat-feed">
            <div className="community-chat-page-loading-shell" aria-busy="true" aria-live="polite">
              <div className="community-chat-page-loading-card">
                <div className="community-chat-page-loading-title">
                  {isResolvingSelectedCommunity ? "Opening community…" : "Loading chat…"}
                </div>
                <div className="community-chat-page-loading-copy">
                  {isResolvingSelectedCommunity
                    ? "Resolving the selected community and preparing chat."
                    : "Preparing messages and member identity."}
                </div>
                <div className="community-chat-page-loading-progress web-skeleton-pill" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
        <WebCommunityChatLightboxModal {...lightboxModalProps} />
      </>
    );
  }

  const mobileMembersOverlay = mobileMembersOverlayOpen ? (
    <WebMobileDrawer
      isOpen={mobileMembersOverlayOpen}
      ariaLabel="Community members"
      side="right"
      className="mobile-members-drawer"
      hideHeader
      onClose={onCloseMobileMembersOverlay ?? (() => undefined)}
    >
      {showInteractionProjection && interactionProjection ? (
        <CommunityInteractionContextPanelSurface
          {...interactionProjection}
          activeCommunityName={activeCommunity?.name ?? "Community"}
          profilesByUserId={profilesByUserId}
          displayName={displayName}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
          formatChatTime={formatChatTime}
          renderTextWithLinks={renderTextWithLinks}
          onOpenProfile={setProfilePanelUserId}
          onMessageUser={canOpenDirectMessageFromCommunity ? openDirectMessage : undefined}
          containerClassName="community-interaction-drawer community-context-panel mobile-members-overlay-panel"
        />
      ) : (
        <div className="chat-messages-state-shell mobile-members-overlay-state">
          <div className="chat-empty">
            {activeCommunity ? "Loading community members..." : "Select a community to view members."}
          </div>
        </div>
      )}
    </WebMobileDrawer>
  ) : null;

  return (
    <>
      <div
        className={`community-chat community-attachment-drop-surface${isCommunityAttachmentDragOver ? " drag-over" : ""}`}
        onDrop={canUseComposer ? onCommunityAttachmentDrop : undefined}
        onDragEnter={canUseComposer ? onCommunityAttachmentDragEnter : undefined}
        onDragOver={canUseComposer ? onCommunityAttachmentDragOver : undefined}
        onDragLeave={canUseComposer ? onCommunityAttachmentDragLeave : undefined}
      >
        {canUseComposer && isCommunityAttachmentDragOver ? (
          <div className="drop-overlay community-drop-overlay" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>Drop files to attach</span>
          </div>
        ) : null}
        <div className="workspace-body chat-feed">
          {showInteractionProjection && interactionProjection ? (
            <div
              className="community-interaction-scroll"
              ref={(node) => {
                messageListRef.current = node;
              }}
              onScroll={onChatScroll}
            >
              <WebCommunityInteractionProjection
                {...interactionProjection}
                onOpenCommunityChatLightbox={onOpenCommunityChatLightbox}
                activeCommunityName={activeCommunity?.name ?? "Community"}
                profilesByUserId={profilesByUserId}
                displayName={displayName}
                getAvatarColor={getAvatarColor}
                getInitials={getInitials}
                formatChatTime={formatChatTime}
                renderTextWithLinks={renderTextWithLinks}
                onStartRootReply={(message) => {
                  const seededMention = buildUserMentionFromProfile(
                    message.sender_id,
                    profilesByUserId[message.sender_id] ?? null,
                    displayName(message.sender_id),
                  );
                  const autoSeedToken = drawerReplyAutoSeedTokenRef.current;
                  const canReplaceAutoSeed = Boolean(autoSeedToken && drawerReplyInput.trim() === autoSeedToken);
                  const canSeedMention = Boolean(
                    seededMention &&
                    (drawerReplyInput.trim().length === 0 || canReplaceAutoSeed),
                  );
                  setDrawerReplyTarget(message);
                  if (seededMention && canSeedMention) {
                    setDrawerReplyInput(`${seededMention.token} `);
                    setDrawerReplyMentions([seededMention]);
                    drawerReplyAutoSeedTokenRef.current = seededMention.token;
                  } else if (!seededMention && canReplaceAutoSeed) {
                    setDrawerReplyInput("");
                    setDrawerReplyMentions([]);
                    drawerReplyAutoSeedTokenRef.current = null;
                  }
                  setTimeout(() => {
                    focusCommunityComposerSafely(drawerReplyInputRef, {
                      maxHeightPx: 120,
                      transferFromRefs: [chatInputRef],
                    });
                  }, 0);
                }}
                onOpenProfile={setProfilePanelUserId}
                onMessageUser={canOpenDirectMessageFromCommunity ? openDirectMessage : undefined}
                profilePanel={profilePanelElement}
                onCloseProfile={() => setProfilePanelUserId(null)}
                mainComposer={interactionProjection.mobileThreadPage ? null : mainCommunityComposer}
                drawerComposer={drawerReplyComposer}
              />
            </div>
          ) : (
            <div
              className="chat-messages"
              ref={(node) => {
                messageListRef.current = node;
              }}
              onScroll={onChatScroll}
            >
              <div className="chat-messages-inner">
              {!hasAuthenticatedPresentation && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">
                    <div>Sign in to access community chat.</div>
                    <button
                      className="secondary"
                      type="button"
                      onClick={onRequireSignIn}
                      style={{ marginTop: 12 }}
                    >
                      Sign in
                    </button>
                  </div>
                </div>
              )}
              {hasSession && !isResolvingSelectedCommunity && !activeCommunity && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">Select a community to start chatting.</div>
                </div>
              )}
              {activeCommunity && hasResolvedCommunityChat && !isLoadingChat && !hasCommunityTimelineItems && communityChatError && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">
                    <div>{communityChatError}</div>
                  </div>
                </div>
              )}
              {activeCommunity && hasResolvedCommunityChat && !isLoadingChat && !hasCommunityTimelineItems && !communityChatError && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty-state">
                    <div className="chat-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="chat-empty-title">
                      Welcome to {activeCommunity.name}
                    </div>
                    <div className="chat-empty-text">
                      This is the beginning of your community chat. Say hello!
                    </div>
                  </div>
                </div>
              )}
              {activeCommunity && !isLoadingChat && isLoadingMoreChat && (
                <div className="community-chat-history-loading" aria-live="polite">
                  <span>Loading earlier messages...</span>
                  <div className="community-chat-history-loading-progress web-skeleton-pill" aria-hidden="true" />
                </div>
              )}
              {activeCommunity && !isLoadingChat && !communityChatHasMore && communityMessages.length > 0 && (
                <div className="chat-date-separator">
                  <span>Start</span>
                </div>
              )}
              {activeCommunity &&
                !isLoadingChat &&
                timelineItems.map((item) => {
                  if (item.kind === "activity") {
                    return (
                      <div key={item.key} className="community-chat-timeline-item">
                        {item.dateSeparator ? (
                          <div className="chat-date-separator">
                            <span>{item.dateSeparator}</span>
                          </div>
                        ) : null}
                        <div className="community-activity-marker" role="note">
                          <span className="community-activity-marker-dot" aria-hidden="true" />
                          <span className="community-activity-marker-text">
                            {formatCommunityActivityLabel(item.event, displayName)}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  const viewModel = item.viewModel;
                  const { message, senderProfile } = viewModel;
                  return (
                    <div key={item.key} className="community-chat-timeline-item">
                      {item.dateSeparator ? (
                        <div className="chat-date-separator">
                          <span>{item.dateSeparator}</span>
                        </div>
                      ) : null}
                      <CommunityChatMessageRow
                        message={message}
                        copied={copiedCommunityMessageId === message.id}
                        dateSeparator={null}
                        isPending={viewModel.isPending}
                        showMeta={viewModel.showMeta}
                        isOwn={viewModel.isOwn}
                        canModerateContent={canModerateMessages}
                        senderLabel={viewModel.senderLabel}
                        senderHandle={senderProfile?.handle ?? null}
                        senderBio={senderProfile?.bio ?? null}
                        senderPremiumBadge={senderProfile?.premium_badge ?? null}
                        avatarUrl={viewModel.avatarUrl}
                        avatarFocusX={senderProfile?.avatar_focus_x ?? 0.5}
                        avatarFocusY={senderProfile?.avatar_focus_y ?? 0.5}
                        avatarZoom={senderProfile?.avatar_zoom ?? 1}
                        avatarColor={viewModel.avatarColor}
                        shortTime={viewModel.shortTime}
                        formattedTime={viewModel.formattedTime}
                        isEditing={editingMessageId === message.id}
                        editingMessageText={editingMessageText}
                        isReactionPickerOpen={reactionPickerMessageId === message.id}
                        messageReactions={viewModel.reactions}
                        sessionUserId={sessionUserId}
                        replyToId={viewModel.replyToId}
                        replyTarget={viewModel.replyTarget}
                        reactionEmojis={reactionEmojis}
                        getInitials={getInitials}
                        displayName={displayName}
                        parseReplyPrefix={parseReplyPrefix}
                        truncateReplyPreview={truncateReplyPreview}
                        renderTextWithLinks={renderTextWithLinks}
                        onScrollToReplyMessage={onScrollToReplyMessage}
                        onOpenCommunityChatLightbox={onOpenCommunityChatLightbox}
                        onToggleReaction={onToggleReaction}
                        onSetReactionPickerMessageId={onSetReactionPickerMessageId}
                        onStartReply={onStartReply}
                        onCopyMessage={onCopyMessage}
                        onStartEdit={onStartEdit}
                        onDeleteMessage={onDeleteMessage}
                        onEditingMessageTextChange={onEditingMessageTextChange}
                        onSaveEdit={onSaveEdit}
                        onCancelEdit={onCancelEdit}
                        onOpenSenderProfile={setProfilePanelUserId}
                        onMessageSender={canOpenDirectMessageFromCommunity ? openDirectMessage : undefined}
                      />
                    </div>
                  );
                })}
              {activeCommunity && !isLoadingChat && typingLabel && (
                <div className="chat-typing-indicator" aria-live="polite">
                  {typingLabel}
                </div>
              )}
              </div>
            </div>
          )}

          {!showInteractionProjection && !isUserAtBottom && (
            <button
              className="scroll-to-bottom workspace"
              type="button"
              onClick={onScrollToBottom}
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              {unreadCount > 0 && (
                <span className="scroll-badge" aria-hidden="true">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M19 12l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {!showInteractionProjection ? mainCommunityComposer : null}

        {isProfileSetupGateActive ? (
          <div className="community-chat-profile-gate">
            <span>Finish your profile before posting in communities.</span>
            <button type="button" onClick={onFinishProfileSetup}>
              Finish profile
            </button>
          </div>
        ) : null}

        {communityChatError && <div className="auth-error">{communityChatError}</div>}
      </div>

      {!showInteractionProjection ? profilePanelElement : null}

      <WebCommunityChatLightboxModal {...lightboxModalProps} />
      {mobileMembersOverlay}
    </>
  );
}
