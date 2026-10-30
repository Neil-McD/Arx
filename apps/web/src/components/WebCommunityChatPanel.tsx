import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  ComponentProps,
  Dispatch,
  DragEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import type { CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import type {
  ProfileCommunityContext as SharedProfileCommunityContext,
  UserProfile as SharedUserProfile,
} from "../../../../shared/communityTypes";
import { fetchCloudProfileCommunityContext } from "../../../../shared/cloudProfilesGateway";
import { useCommunityAgentName } from "../../../../shared/CommunityAgentIcon";
import {
  searchCloudCommunityMentionCandidates,
  type CloudCommunityMentionCandidateRow,
} from "../../../../shared/cloudCommunityDirectoryGateway";
import type { CommunityMessageAttachment } from "../../../../shared/communityMessageParsing";
import { textContainsMentionToken } from "../../../../shared/communityMentionRendering";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { useMessageAttachmentInputController } from "../../../../shared/useMessageAttachmentInputController";
import { mergeVoiceTranscript } from "../../../../shared/voiceCapture";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import { WebCommunityChatLightboxModal } from "./WebCommunityChatLightboxModal";
import { WebCommunityInteractionBootstrap } from "./WebCommunityInteractionBootstrap";
import {
  WebCommunityInteractionProjection,
  type WebCommunityInteractionProjectionProps,
} from "./WebCommunityInteractionProjection";
import { WebCommunityProfilePanel } from "./WebCommunityProfilePanel";
import { COMMUNITY_OPEN_PROFILE_EVENT, takePendingCommunityProfile } from "./WebCommunityCreators";
import { CommunityComposerControls } from "./CommunityComposerControls";
import { FormShareDialog, PollComposerDialog, PostPeopleContext } from "./CommunityPostCard";
import { resolveWebCommunityChatPresentationMode } from "../controllers/resolveWebCommunityChatPresentationMode";
import {
  continueCommunityComposerList,
  indentCommunityComposerList,
  insertCommunityComposerText,
  toggleCommunityComposerInlineFormat,
  type CommunityComposerEdit,
  type CommunityComposerSelection,
} from "../controllers/communityComposerTextEditing";
import {
  buildCommunityRootReplyTarget,
  type WebCommunityReplyTarget as CommunityReplyTarget,
} from "../controllers/communityRootReplyTarget";
import {
  MentionAutocompleteMenu,
  MentionComposerHighlight,
  committedMentionFromCandidate,
  handleMentionTokenBackspace,
  useMentionAutocomplete,
  type CommittedMention,
  type MentionCandidate,
} from "./communityMentionAutocomplete";
import type { CloudCommunityAgentServeIssue } from "../../../../shared/cloudCommunityAgentConciergeGateway";
import { useCommunityVisualIdentityRegistryActions } from "../../../../shared/CommunityVisualIdentityRegistry";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import {
  coerceCommunityVisualIdentity,
  type CommunityVisualIdentity,
} from "../../../../shared/communityVisualIdentity";

type UserProfile = SharedUserProfile;
type ProfileCommunityContext = SharedProfileCommunityContext;
type CommunityMentionMember = {
  user_id?: string | null;
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
const COMMUNITY_MAIN_MENTION_MENU_ID = "community-main-mention-autocomplete";
const COMMUNITY_REPLY_MENTION_MENU_ID = "community-reply-mention-autocomplete";

function readCommunityComposerSelection(textarea: HTMLTextAreaElement): CommunityComposerSelection {
  return {
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  };
}

function applyCommunityComposerEdit(
  textarea: HTMLTextAreaElement,
  edit: CommunityComposerEdit,
  applyText: (value: string, textarea: HTMLTextAreaElement) => void,
): boolean {
  if (!edit.changed) return false;
  applyText(edit.value, textarea);
  window.requestAnimationFrame(() => {
    if (!textarea.isConnected || textarea.disabled || textarea.readOnly) return;
    textarea.focus({ preventScroll: true });
    try {
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    } catch {
      // Platform-managed textarea states can reject selection restoration.
    }
    syncMentionComposerHighlightScroll(textarea);
  });
  return true;
}

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
    kind,
    ...(kind === "role" ? { roleKey: "everybody" as const } : {}),
    ...(kind === "role" ? { emailMode, emailCooldownUntil: row.email_cooldown_until ?? null } : {}),
    ...(row.subtitle ? { subtitle: row.subtitle } : {}),
    ...(Array.isArray(row.match_aliases) ? { matchAliases: row.match_aliases } : {}),
  };
}

export type WebCommunityChatPanelProps = {
  activeCommunity: {
    id: string;
    name: string;
    owner_id?: string | null;
    avatar_url?: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  } | null;
  session: unknown | null;
  isResolvingSelectedCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  hasSession: boolean;
  onOpenDirectMessageFromCommunity?: (targetUserId: string, communityId: string) => void;
  sessionUserId: string | null;
  canPostMessages: boolean;
  /** Owners and admins can also share one of the community's Forms from "+". */
  canShareForms?: boolean;
  isProfileSetupComplete: boolean;
  canMentionEverybody: boolean;
  /** Authoritative community member count for the @everybody row copy. */
  everybodyMemberCount: number | null;
  onCommunityTypingSignal?: (rootId?: string | null) => void;
  onCommunityTypingClear?: (rootId?: string | null) => void;
  profilesByUserId: Record<string, UserProfile>;
  mentionableCommunityMembers: CommunityMentionMember[];
  replyingToMessage: CommunityReplyTarget | null;
  communityAttachments: CommunityMessageAttachment[];
  communityMessageInput: string;
  communityMessageMentions: CommittedMention[];
  setCommunityMessageMentions: (
    update: CommittedMention[] | ((prev: CommittedMention[]) => CommittedMention[]),
  ) => void;
  communityAgentServeIssue: CloudCommunityAgentServeIssue | null;
  onDismissCommunityAgentServeIssue: (issueId: string) => void;
  onStartBuilderFromServeIssue?: () => void;
  isSendingCommunityMessage: boolean;
  communityChatError: string | null;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  onRequireSignIn: () => void;
  onFinishProfileSetup: () => void;
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
  onCommunityMessageInputChange: (value: string, textarea?: HTMLTextAreaElement) => void;
  onSendCommunityMessage: (draft?: CommunityChatSendDraft) => void | Promise<void>;
  displayName: (userId: string) => string;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  formatChatTime: (value: string) => string;
  truncateReplyPreview: (value: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onOpenCommunityChatLightbox: (images: CommunityChatMediaImage[], index: number) => void;
  voiceButtonProps: ComponentProps<typeof VoiceInputButton>;
  drawerVoiceButtonProps: Omit<ComponentProps<typeof VoiceInputButton>, "onClick">;
  onCommunityVoiceInputClick: (
    target: CommunityVoiceTranscriptTarget | null,
    owner: CommunityVoiceButtonOwner,
  ) => void;
  lightboxModalProps: ComponentProps<typeof WebCommunityChatLightboxModal>;
  interactionProjection?: Omit<
    WebCommunityInteractionProjectionProps,
    | "activeCommunityName"
    | "profilesByUserId"
    | "displayName"
    | "getAvatarColor"
    | "getInitials"
    | "formatChatTime"
    | "renderTextWithLinks"
  >;
};

export function WebCommunityChatPanel(props: WebCommunityChatPanelProps) {
  const communityAgentName = useCommunityAgentName(props.activeCommunity?.name);
  const { upsertCommunityVisualIdentities } =
    useCommunityVisualIdentityRegistryActions();
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
    canMentionEverybody,
    everybodyMemberCount,
    onCommunityTypingSignal,
    onCommunityTypingClear,
    profilesByUserId,
    mentionableCommunityMembers,
    replyingToMessage,
    communityAttachments,
    communityMessageInput,
    communityMessageMentions,
    setCommunityMessageMentions,
    communityAgentServeIssue,
    onDismissCommunityAgentServeIssue,
    onStartBuilderFromServeIssue,
    isSendingCommunityMessage,
    communityChatError,
    fileInputRef,
    chatInputRef,
    onRequireSignIn,
    onFinishProfileSetup,
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
    getAvatarColor,
    getInitials,
    formatChatTime,
    truncateReplyPreview,
    renderTextWithLinks,
    onOpenCommunityChatLightbox,
    voiceButtonProps,
    drawerVoiceButtonProps,
    onCommunityVoiceInputClick,
    lightboxModalProps,
    interactionProjection,
  } = props;
  const isProfileSetupGateActive = hasSession && Boolean(activeCommunity) && canPostMessages && !isProfileSetupComplete;
  const canPresentComposer = canPostMessages && !isProfileSetupGateActive;
  const canUseComposer = canPresentComposer;
  const canUseCommunityAttachments = canUseComposer;
  const [postCardDialog, setPostCardDialog] = useState<"poll" | "form" | null>(null);
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

  const handleMainCommunityComposerSubmit = useCallback(async () => {
    onCommunityTypingClear?.(null);
    await onSendCommunityMessage();
  }, [
    onSendCommunityMessage,
    onCommunityTypingClear,
  ]);

  const handleMainCommunityComposerUserInput = useCallback((
    value: string,
    textarea?: HTMLTextAreaElement,
  ) => {
    onCommunityMessageInputChange(value, textarea);
    if (value.trim()) {
      onCommunityTypingSignal?.(null);
      return;
    }
    onCommunityTypingClear?.(null);
  }, [
    onCommunityMessageInputChange,
    onCommunityTypingClear,
    onCommunityTypingSignal,
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
    // always badged. Its token/name is the owner's name for the agent, else the
    // community's; the backend stores the stable (communityId, community_agent) identity.
    const agentDisplayName = communityAgentName.trim();
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
    communityAgentName,
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
    applyText: handleMainCommunityComposerUserInput,
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
    return buildCommunityRootReplyTarget({
      root: selectedInteractionRootBundle?.root,
      communityName: activeCommunity?.name,
    });
  }, [
    activeCommunity?.name,
    selectedInteractionRootBundle?.root.actor_user_id,
    selectedInteractionRootBundle?.root.actor_agent_key,
    selectedInteractionRootBundle?.root.actor_type,
    selectedInteractionRootBundle?.root.id,
    selectedInteractionRootBundle?.root.content_summary,
  ]);

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
  const communityChatPresentationMode = resolveWebCommunityChatPresentationMode({
    hasActiveCommunity: Boolean(activeCommunity),
    hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn,
    isResolvingSelectedCommunity,
  });
  const showInteractionProjection = communityChatPresentationMode === "canonical";
  const showCanonicalCommunityBootstrap =
    communityChatPresentationMode === "canonical_bootstrap";
  const handleOpenCommunityProfile = useCallback((userId: string) => {
    interactionProjection?.onCloseDrawer();
    setProfilePanelUserId(userId);
  }, [interactionProjection]);
  const postPeople = useMemo(() => ({
    getAvatarColor, getInitials, profilesByUserId, onOpenProfile: handleOpenCommunityProfile, agentName: communityAgentName,
  }), [getAvatarColor, getInitials, profilesByUserId, handleOpenCommunityProfile, communityAgentName]);
  // Creator names elsewhere in the community (the community card, About)
  // open their profile here.
  useEffect(() => {
    const pending = takePendingCommunityProfile();
    if (pending) handleOpenCommunityProfile(pending);
    const onOpen = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!userId) return;
      event.preventDefault();
      handleOpenCommunityProfile(userId);
    };
    window.addEventListener(COMMUNITY_OPEN_PROFILE_EVENT, onOpen);
    return () => window.removeEventListener(COMMUNITY_OPEN_PROFILE_EVENT, onOpen);
  }, [handleOpenCommunityProfile]);
  const handleSelectCommunityRoot = useCallback((rootId: string) => {
    setProfilePanelUserId(null);
    interactionProjection?.onSelectRoot(rootId);
  }, [interactionProjection]);
  const communityComposerFocusTargetKey = (() => {
    if (
      !activeCommunity?.id ||
      !hasAuthenticatedPresentation ||
      isAuthRecoveringSignedIn ||
      !canUseComposer ||
      !showInteractionProjection ||
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
        upsertCommunityVisualIdentities(
          [...context.owned_communities, ...context.mutual_communities]
            .map((community) => coerceCommunityVisualIdentity(
              community.visual_identity,
              community,
            ))
            .filter((identity): identity is CommunityVisualIdentity => Boolean(identity)),
        );
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
  }, [
    activeCommunity?.id,
    profileCommunityContextByUserId,
    profilePanelUserId,
    session,
    upsertCommunityVisualIdentities,
  ]);

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
      docked={showInteractionProjection}
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
    if (!selectedInteractionRootId) return;
    if (value.trim()) {
      onCommunityTypingSignal?.(selectedInteractionRootId);
      return;
    }
    onCommunityTypingClear?.(selectedInteractionRootId);
  }, [
    onCommunityTypingClear,
    onCommunityTypingSignal,
    selectedInteractionRootId,
  ]);

  useEffect(() => {
    if (!selectedInteractionRootId) return;
    return () => {
      onCommunityTypingClear?.(selectedInteractionRootId);
    };
  }, [onCommunityTypingClear, selectedInteractionRootId]);

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

  const insertMainComposerEmoji = useCallback((emoji: string) => {
    const textarea = chatInputRef.current;
    if (!textarea) return;
    applyCommunityComposerEdit(
      textarea,
      insertCommunityComposerText(readCommunityComposerSelection(textarea), emoji),
      handleMainCommunityComposerUserInput,
    );
  }, [chatInputRef, handleMainCommunityComposerUserInput]);

  const insertDrawerComposerEmoji = useCallback((emoji: string) => {
    const textarea = drawerReplyInputRef.current;
    if (!textarea) return;
    applyCommunityComposerEdit(
      textarea,
      insertCommunityComposerText(readCommunityComposerSelection(textarea), emoji),
      handleDrawerReplyInputChange,
    );
  }, [handleDrawerReplyInputChange]);

  const handleCommunityComposerAuthoringKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    applyText: (value: string, textarea: HTMLTextAreaElement) => void,
  ): boolean => {
    const textarea = event.currentTarget;
    const selection = readCommunityComposerSelection(textarea);
    let edit: CommunityComposerEdit | null = null;

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "b") edit = toggleCommunityComposerInlineFormat(selection, "bold");
      if (key === "i") edit = toggleCommunityComposerInlineFormat(selection, "italic");
    } else if (event.key === "Tab") {
      edit = indentCommunityComposerList(selection, event.shiftKey ? "outdent" : "indent");
    } else if (event.key === "Enter" && event.shiftKey) {
      edit = continueCommunityComposerList(selection);
    }

    if (!edit?.changed) return false;
    event.preventDefault();
    return applyCommunityComposerEdit(textarea, edit, applyText);
  }, []);

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
  }, []);

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
    if (selectedInteractionRootId) {
      onCommunityTypingClear?.(selectedInteractionRootId);
    }
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
    onCommunityTypingClear,
    selectedInteractionRootId,
    setDrawerReplyAttachmentsAndRef,
  ]);

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
    const isMemberLimit = communityAgentServeIssue.reason === "member_agent_limit_reached";
    return (
      <div className="community-agent-serve-notice" role="status" aria-live="polite">
        <div className="community-agent-serve-notice-copy">
          <strong>
            {isMemberLimit
              ? "You've used this month's free agent messages"
              : "Community AI is temporarily unavailable"}
          </strong>
          <span>{communityAgentServeIssue.message}</span>
        </div>
        <div className="community-agent-serve-notice-actions">
          {communityAgentServeIssue.cta === "start_builder" && onStartBuilderFromServeIssue ? (
            <button
              className="community-agent-serve-notice-primary"
              type="button"
              onClick={onStartBuilderFromServeIssue}
            >
              Build your own community — $79/mo
            </button>
          ) : null}
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

  const activeCommunityChannelSlug = String(interactionProjection?.activeChannel?.slug ?? "").trim();
  const podsFrame = useWebCommunityFrame().pods;
  // In the posts layout the composer writes a post: several lines, the first
  // read as the title, so Enter is a new line and Ctrl/Cmd+Enter posts.
  const isPostsComposer = interactionProjection?.presentation === "posts" && interactionProjection?.surface !== "members";
  // A pod's box says it stays in the pod (Classroom pods, WebCommunityPods).
  const activePod = podsFrame?.pods.find((pod) => pod.id === interactionProjection?.activeChannel?.id) ?? null;
  const activeCommunityComposerPlaceholder = isPostsComposer
    ? "Title on the first line, then your post..."
    : activePod
    ? `Message ${activePod.name} (only the pod sees this)...`
    : activeCommunityChannelSlug
    ? `Message #${activeCommunityChannelSlug}`
    : "Message the community...";
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
              : activeCommunityComposerPlaceholder;

  const mainCommunityComposer = (
    <>
      {renderCommunityAgentServeNotice()}

      <div className="chat-input-bar">
        <MentionAutocompleteMenu
          id={COMMUNITY_MAIN_MENTION_MENU_ID}
          autocomplete={mainMention}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
        />
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
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {renderCommunityAttachmentsPreview(communityAttachments, onRemoveCommunityAttachment)}

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
        <div className="community-composer-authoring-row">
        <div className="community-composer-editor-row">
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
              aria-label={mainCommunityComposerPlaceholder}
              placeholder={mainCommunityComposerPlaceholder}
              value={communityMessageInput}
              onChange={(event) => {
                handleMainCommunityComposerUserInput(event.target.value, event.target);
                mainMention.syncFromTextarea(event.target);
                syncMentionComposerHighlightScroll(event.target);
              }}
              onClick={(event) => {
                mainMention.syncFromTextarea(event.currentTarget);
              }}
              onBlur={() => {
                mainMention.close();
                onCommunityTypingClear?.(null);
              }}
              onScroll={(event) => syncMentionComposerHighlightScroll(event.currentTarget)}
              onPaste={onCommunityAttachmentPaste}
              onKeyDown={(event) => {
                if (mainMention.handleKeyDown(event)) return;
                if (
                  handleMentionTokenBackspace({
                    event,
                    mentions: communityMessageMentions,
                    applyText: handleMainCommunityComposerUserInput,
                    setMentions: setCommunityMessageMentions,
                  })
                ) return;
                if (
                  handleCommunityComposerAuthoringKeyDown(event, handleMainCommunityComposerUserInput)
                ) return;
                if (event.key === "Enter" && (isPostsComposer ? event.ctrlKey || event.metaKey : !event.shiftKey)) {
                  event.preventDefault();
                  if (isAuthRecoveringSignedIn) return;
                  void handleMainCommunityComposerSubmit();
                }
              }}
              disabled={
                isAuthRecoveringSignedIn ||
                !hasSession ||
                !activeCommunity ||
                !canUseComposer
              }
              rows={isPostsComposer ? 4 : 1}
            />
          </div>
        </div>
        <CommunityComposerControls
          contextKey={`main:${activeCommunity?.id ?? "none"}:${activeCommunityChannelSlug || "general"}`}
          groupLabel="Message tools"
          attachLabel="Add files"
          mentionLabel="Mention someone"
          mentionMenuId={COMMUNITY_MAIN_MENTION_MENU_ID}
          mentionMenuOpen={mainMention.isOpen}
          toolsDisabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage
          }
          attachDisabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseCommunityAttachments ||
            isSendingCommunityMessage
          }
          onAttach={() => fileInputRef.current?.click()}
          onPoll={() => setPostCardDialog("poll")}
          onForm={props.canShareForms ? () => setPostCardDialog("form") : undefined}
          onMention={mainMention.begin}
          onEmoji={insertMainComposerEmoji}
          voiceControl={isPostsComposer ? null : (
            <VoiceInputButton
              {...voiceButtonProps}
              disabled={
                voiceButtonProps.disabled
              }
            />
          )}
          sendControl={(
            <button
              className="chat-send ask-send-btn ask-send-btn-v2"
              onClick={() => void handleMainCommunityComposerSubmit()}
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
          )}
        />
        </div>
      </div>
    </>
  );

  const drawerReplyPlaceholder = drawerReplyTarget?.sender_id
    ? `Reply to ${drawerReplyTarget.reply_author_label?.trim() || displayName(drawerReplyTarget.sender_id).trim() || "this message"}...`
    : "Reply...";
  const drawerReplyComposer = drawerReplyTarget ? (
    <div className="community-interaction-reply-composer-panel">
      {renderCommunityAgentServeNotice()}
      <div className="chat-input-bar community-interaction-reply-input-bar">
        <MentionAutocompleteMenu
          id={COMMUNITY_REPLY_MENTION_MENU_ID}
          autocomplete={drawerMention}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
        />
        {renderCommunityAttachmentsPreview(
          drawerReplyAttachments,
          removeDrawerReplyAttachment,
          "community-attachments-preview community-interaction-reply-attachments-preview",
        )}
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
        <div className="community-composer-authoring-row">
        <div className="community-composer-editor-row">
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
              aria-label={drawerReplyPlaceholder}
              placeholder={drawerReplyPlaceholder}
              value={drawerReplyInput}
              onChange={(event) => {
                handleDrawerReplyInputChange(event.target.value, event.target);
                drawerMention.syncFromTextarea(event.target);
                syncMentionComposerHighlightScroll(event.target);
              }}
              onClick={(event) => drawerMention.syncFromTextarea(event.currentTarget)}
              onBlur={() => {
                drawerMention.close();
                if (selectedInteractionRootId) {
                  onCommunityTypingClear?.(selectedInteractionRootId);
                }
              }}
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
                if (handleCommunityComposerAuthoringKeyDown(event, handleDrawerReplyInputChange)) return;
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
        </div>
        <CommunityComposerControls
          contextKey={`reply:${activeCommunity?.id ?? "none"}:${activeCommunityChannelSlug || "general"}:${selectedInteractionRootId ?? "none"}`}
          groupLabel="Reply tools"
          attachLabel="Add files to reply"
          mentionLabel="Mention someone in reply"
          mentionMenuId={COMMUNITY_REPLY_MENTION_MENU_ID}
          mentionMenuOpen={drawerMention.isOpen}
          toolsDisabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage
          }
          attachDisabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage
          }
          onAttach={() => drawerReplyFileInputRef.current?.click()}
          onMention={drawerMention.begin}
          onEmoji={insertDrawerComposerEmoji}
          voiceControl={(
            <VoiceInputButton
              {...drawerVoiceButtonProps}
              onClick={() => onCommunityVoiceInputClick(drawerVoiceTranscriptTarget, "drawer")}
            />
          )}
          sendControl={(
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
          )}
        />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <CommunityChannelSessionContext.Provider value={session && activeCommunity ? { session, communityId: activeCommunity.id } : null}>
    <PostPeopleContext.Provider value={postPeople}>
      {postCardDialog && activeCommunity ? (postCardDialog === "poll" ? (
        <PollComposerDialog communityId={activeCommunity.id} channelId={interactionProjection?.activeChannel?.id ?? null}
          channelName={interactionProjection?.activeChannel?.name ?? null} onClose={() => setPostCardDialog(null)} />
      ) : (
        <FormShareDialog communityId={activeCommunity.id} channelId={interactionProjection?.activeChannel?.id ?? null}
          channelName={interactionProjection?.activeChannel?.name ?? null} onClose={() => setPostCardDialog(null)} />
      )) : null}
      <div
        className={`community-chat community-member-chat community-attachment-drop-surface${isCommunityAttachmentDragOver ? " drag-over" : ""}`}
        onDrop={canUseCommunityAttachments ? onCommunityAttachmentDrop : undefined}
        onDragEnter={canUseCommunityAttachments ? onCommunityAttachmentDragEnter : undefined}
        onDragOver={canUseCommunityAttachments ? onCommunityAttachmentDragOver : undefined}
        onDragLeave={canUseCommunityAttachments ? onCommunityAttachmentDragLeave : undefined}
      >
        {canUseCommunityAttachments && isCommunityAttachmentDragOver ? (
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
            <div className="community-interaction-scroll">
              <WebCommunityInteractionProjection
                {...interactionProjection}
                onSelectRoot={handleSelectCommunityRoot}
                floatingComposers
                onOpenCommunityChatLightbox={onOpenCommunityChatLightbox}
                activeCommunityName={activeCommunity?.name ?? "Community"}
                profilesByUserId={profilesByUserId}
                displayName={displayName}
                getAvatarColor={getAvatarColor}
                getInitials={getInitials}
                formatChatTime={formatChatTime}
                renderTextWithLinks={renderTextWithLinks}
                onStartRootReply={(message) => {
                  const seededMention = committedMentionFromCandidate(message.mention_candidate);
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
                  } else if (
                    seededMention &&
                    !textContainsMentionToken(drawerReplyInput, seededMention.token)
                  ) {
                    setDrawerReplyInput(`${seededMention.token} ${drawerReplyInput.trimStart()}`);
                    setDrawerReplyMentions((previous) => [
                      ...previous.filter((mention) => mention.userId !== seededMention.userId),
                      seededMention,
                    ]);
                    drawerReplyAutoSeedTokenRef.current = null;
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
                onOpenProfile={handleOpenCommunityProfile}
                onMessageUser={canOpenDirectMessageFromCommunity ? openDirectMessage : undefined}
                profilePanel={profilePanelElement}
                onCloseProfile={() => setProfilePanelUserId(null)}
                mainComposer={interactionProjection.mobileThreadPage ? null : mainCommunityComposer}
                drawerComposer={drawerReplyComposer}
              />
            </div>
          ) : showCanonicalCommunityBootstrap ? (
            <div className="community-interaction-scroll">
              <WebCommunityInteractionBootstrap mainComposer={mainCommunityComposer} />
            </div>
          ) : (
            <div className="chat-messages">
              <div className="chat-messages-inner">
                {!hasAuthenticatedPresentation ? (
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
                ) : hasSession && !isResolvingSelectedCommunity && !activeCommunity ? (
                  <div className="chat-messages-state-shell">
                    <div className="chat-empty">
                      Select a community to start chatting.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

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

      <WebCommunityChatLightboxModal {...lightboxModalProps} />
    </PostPeopleContext.Provider>
    </CommunityChannelSessionContext.Provider>
  );
}
