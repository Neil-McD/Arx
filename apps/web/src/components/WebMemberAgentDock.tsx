import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type ClipboardEvent,
  type ComponentProps,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Paperclip,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { getAuthUrl, type AuthSession } from "../auth";
import { renderMarkdown } from "../../../../shared/markdownUi";
import {
  extractTextFromContentJson,
  parseMessageAttachments,
} from "../../../../shared/communityMessageParsing";
import { CommunityChatMediaGrid } from "../../../../shared/CommunityChatMediaGrid";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import {
  MEMBER_AGENT_IMAGE_ACCEPT,
  validateMemberAgentImageDrafts,
  type MemberAgentImageAttachment,
} from "../../../../shared/memberAgentAttachments";
import { mergeVoiceTranscript } from "../../../../shared/voiceCapture";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import {
  ensureCloudMemberAgentGlobalChannel,
  startNewCloudMemberAgentGlobalEpisode,
  type CloudMemberAgentChannel,
} from "../../../../shared/cloudMemberAgentGateway";
import { listCloudPendingCommunityResourceBuilderChangesets } from "../../../../shared/cloudCommunityAdminGateway";
import {
  fetchCloudThreadContextById,
  setCloudThreadContext,
} from "../../../../shared/cloudThreadContextGateway";
import { syncThreadCommunityLensCloud } from "../../../../shared/threadContextCloudSync";
import {
  listConvexCloudNewestThreadMessagesByThreadKey,
  type CloudMessageTransportRow,
} from "../../../../shared/cloudThreadsRead";
import { DEFAULT_ACTIVE_MODEL_ID } from "../../../../shared/modelCatalog";
import { uploadCloudMemberAgentImageFile } from "../../../../shared/cloudThreadsGateway";
import {
  buildMemberAgentSurfacePresentation,
  type MemberAgentSurfaceContextV1,
} from "../../../../shared/memberAgentSurfaceContext";
import {
  shouldPresentCommunityOnboardingAgentReview,
  shouldPresentCommunityOnboardingAgentStep,
} from "../../../../shared/communityOnboarding";
import { useWebTurnRunnerController } from "../../../../shared/useWebTurnRunnerController";
import type {
  InferenceIssueModalState,
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../../shared/webTurnRunnerCore";
import { RuntimeLiveTimeline } from "./RuntimeLiveTimeline";
import {
  buildResourceChangesetCardFromPayload,
  extractRuntimeResourceChangesetCards,
  RuntimeResourceChangesetApprovalCards,
  type ResourceChangesetCardModel,
} from "./RuntimeResourceChangesetApprovalCards";
import { useWebCommunityOnboarding } from "./WebCommunityOnboardingController";
import type { WebCommunityRecord } from "../webAppContracts";
import "./WebMemberAgentDock.css";

type MemberAgentMessage = Omit<CloudMessageTransportRow, "role"> & {
  role: "user" | "assistant" | "system";
};

type AgentScope = {
  userId: string | null;
  surfaceKey: string;
  generation: number;
};

type ActiveThreadContext = {
  communityId: string | null;
  contextVersion: number;
};

export type WebMemberAgentDockHandle = {
  appendTranscript: (transcript: string) => void;
  focusInput: () => void;
  startResourceBuild: (request: {
    communityId: string;
    prompt: string;
  }) => Promise<boolean>;
};

type MemberAgentImageDraft = Omit<MemberAgentImageAttachment, "storage_id"> & {
  file: File;
  previewUrl: string;
  storage_id?: string | null;
};

type MemberAgentRetryState = {
  signature: string;
  text: string;
  messageId: string;
  attachments: MemberAgentImageDraft[];
};

export type WebMemberAgentDockProps = {
  isVisible: boolean;
  isSuppressed?: boolean;
  canManageResources?: boolean;
  mobileShellActive?: boolean;
  onRequestOpen?: () => void;
  mobileRoot?: boolean;
  community: WebCommunityRecord | null;
  surfaceContext: MemberAgentSurfaceContextV1 | null;
  session: AuthSession | null;
  ensureSession: (
    session?: AuthSession | null,
    source?: string,
    options?: { forceRefresh?: boolean },
  ) => Promise<AuthSession | null>;
  fetchPublic: (url: string, init?: RequestInit) => Promise<Response>;
  fetchAuth: (
    url: string,
    init: RequestInit,
    session: AuthSession,
  ) => Promise<Response>;
  voiceButtonProps: ComponentProps<typeof VoiceInputButton>;
  finalizeVoiceInputForSubmit?: () => Promise<string>;
};

function buildDraftSignature(text: string, attachments: readonly MemberAgentImageDraft[]): string {
  return `${text}\u0000${attachments.map((attachment) => attachment.id).join(",")}`;
}

function MemberAgentAttachmentViews(props: {
  attachments: ReturnType<typeof parseMessageAttachments>;
}) {
  const { imageAttachments } = partitionCommunityAttachments(props.attachments);
  if (imageAttachments.length === 0) return null;
  const images = imageAttachments.map((item) => ({
    id: item.attachment.id,
    url: item.url,
    previewUrl: item.previewUrl,
    fullUrl: item.fullUrl,
    name: item.name,
  }));
  return (
    <CommunityChatMediaGrid
      images={images}
      className="member-agent-dock-media-grid"
      onOpenImage={(items, index) => {
        const url = String(items[index]?.fullUrl ?? items[index]?.url ?? "").trim();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
    />
  );
}

function normalizeMessages(rows: CloudMessageTransportRow[]): MemberAgentMessage[] {
  return rows
    .filter(
      (row): row is CloudMessageTransportRow & { role: MemberAgentMessage["role"] } =>
        row.role === "user" || row.role === "assistant" || row.role === "system",
    )
    .sort((a, b) => a.seq - b.seq);
}

function hasSequencedAssistantText(events: ThreadStreamingRuntimeEvent[]): boolean {
  return events.some((event) => event.event_type === "assistant_text_delta");
}

function formatInferenceIssue(issue: InferenceIssueModalState | null): string | null {
  if (!issue) return null;
  if (issue.reason === "provider_connection_required") {
    return "Community AI is unavailable for this turn. Ask the community owner to check Builder billing.";
  }
  return issue.message?.trim() || "Your agent could not complete this turn. Try again.";
}

export const WebMemberAgentDock = forwardRef<WebMemberAgentDockHandle, WebMemberAgentDockProps>(
function WebMemberAgentDock(props, ref) {
  const communityId = props.community?.id ?? null;
  const communityName = String(props.community?.name ?? "").trim();
  const onboarding = useWebCommunityOnboarding();
  const [isOpen, setIsOpen] = useState(false);
  const isOpenSurface = props.mobileShellActive
    ? Boolean(props.mobileRoot)
    : isOpen;
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [, setThreadContext] = useState<ActiveThreadContext | null>(null);
  const [messages, setMessages] = useState<MemberAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<MemberAgentImageDraft[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAttachmentDragOver, setIsAttachmentDragOver] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isStartingNewChat, setIsStartingNewChat] = useState(false);
  const [resourceBuildLaunchVersion, setResourceBuildLaunchVersion] = useState(0);
  const [recoveredResourceChangesetCards, setRecoveredResourceChangesetCards] = useState<
    ResourceChangesetCardModel[]
  >([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inferenceIssue, setInferenceIssue] = useState<InferenceIssueModalState | null>(null);
  const [sendingByThread, setSendingByThread] = useState<Record<string, boolean>>({});
  const [streamingByThread, setStreamingByThread] = useState<
    Record<string, ThreadStreamingState<never, never, never>>
  >({});
  const [, setRuntimeEventsByRunId] = useState<Record<string, ThreadStreamingRuntimeEvent[]>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const onboardingOpenedSessionIdsRef = useRef(new Set<string>());
  const onboardingSeededSessionIdsRef = useRef(new Set<string>());
  const onboardingFocusSessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<MemberAgentImageDraft[]>([]);
  const draftTextRef = useRef("");
  const submitInFlightRef = useRef(false);
  const resourceBuildStartInFlightRef = useRef(false);
  const pendingResourceBuildRef = useRef<{
    communityId: string;
    prompt: string;
  } | null>(null);
  const retryRef = useRef<MemberAgentRetryState | null>(null);
  const runUiScopeRef = useRef<AgentScope | null>(null);
  const activeThreadKeyRef = useRef<string | null>(null);
  const activeThreadContextRef = useRef<ActiveThreadContext | null>(null);
  const surfaceKey = JSON.stringify([
    props.surfaceContext,
    communityId,
  ]);
  const agentScopeRef = useRef<AgentScope>({
    userId: props.session?.user.id ?? null,
    surfaceKey,
    generation: 0,
  });
  const scopeUserId = props.session?.user.id ?? null;
  const surfaceKind = props.surfaceContext?.kind ?? null;
  const onboardingSession = onboarding?.activeSession ?? null;
  const isConversationSurfaceActive = isOpenSurface;
  if (
    agentScopeRef.current.userId !== scopeUserId ||
    agentScopeRef.current.surfaceKey !== surfaceKey
  ) {
    agentScopeRef.current = {
      userId: scopeUserId,
      surfaceKey,
      generation: agentScopeRef.current.generation + 1,
    };
  }

  const setAttachmentDrafts = useCallback((next: MemberAgentImageDraft[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const revokeDraftPreviews = useCallback((drafts: readonly MemberAgentImageDraft[]) => {
    for (const draft of drafts) URL.revokeObjectURL(draft.previewUrl);
  }, []);

  const clearAttachmentDrafts = useCallback(() => {
    const current = attachmentsRef.current;
    attachmentsRef.current = [];
    setAttachments([]);
    revokeDraftPreviews(current);
  }, [revokeDraftPreviews]);

  useImperativeHandle(ref, () => ({
    appendTranscript: (transcript: string) => {
      const next = mergeVoiceTranscript(draftTextRef.current, transcript);
      draftTextRef.current = next;
      setInput(next);
    },
    focusInput: () => {
      const inputElement = textareaRef.current;
      if (!inputElement) return;
      inputElement.style.height = "auto";
      inputElement.style.height = `${Math.min(inputElement.scrollHeight, 112)}px`;
      inputElement.focus();
    },
    startResourceBuild: async (request) => {
      const requestedCommunityId = String(request.communityId ?? "").trim();
      const prompt = String(request.prompt ?? "").trim();
      if (
        !requestedCommunityId ||
        requestedCommunityId !== communityId ||
        !prompt ||
        !props.canManageResources ||
        !props.session ||
        props.voiceButtonProps.state !== "idle" ||
        resourceBuildStartInFlightRef.current ||
        pendingResourceBuildRef.current ||
        draftTextRef.current.trim() ||
        attachmentsRef.current.length > 0
      ) {
        return false;
      }
      resourceBuildStartInFlightRef.current = true;
      const launchScope = agentScopeRef.current;
      if (props.mobileShellActive) props.onRequestOpen?.();
      else setIsOpen(true);
      setLocalError(null);
      try {
        const usableSession = await props.ensureSession(
          props.session,
          "member_agent_resource_build",
        );
        if (
          !usableSession ||
          agentScopeRef.current.userId !== launchScope.userId ||
          agentScopeRef.current.generation !== launchScope.generation
        ) return false;
        const rows = await listCloudPendingCommunityResourceBuilderChangesets<
          AuthSession,
          Record<string, unknown>
        >({
          session: usableSession,
          communityId: requestedCommunityId,
          limit: 1,
        });
        const pendingCards = rows.flatMap((row, index) => {
          const updatedAt = Date.parse(String(row.updated_at ?? ""));
          const card = buildResourceChangesetCardFromPayload(
            row,
            Number.isFinite(updatedAt) ? updatedAt : index,
          );
          return card ? [card] : [];
        });
        if (
          agentScopeRef.current.userId !== launchScope.userId ||
          agentScopeRef.current.generation !== launchScope.generation
        ) return false;
        if (pendingCards.length > 0) {
          setRecoveredResourceChangesetCards(pendingCards);
          return true;
        }
        if (draftTextRef.current.trim() || attachmentsRef.current.length > 0) {
          return false;
        }
        pendingResourceBuildRef.current = {
          communityId: requestedCommunityId,
          prompt,
        };
        setResourceBuildLaunchVersion((current) => current + 1);
        return true;
      } catch (error) {
        console.warn("member_agent_resource_build_start_failed", error);
        setLocalError("Your resource proposal could not be checked. Try again.");
        return false;
      } finally {
        resourceBuildStartInFlightRef.current = false;
      }
    },
  }), [
    communityId,
    props.canManageResources,
    props.ensureSession,
    props.mobileShellActive,
    props.onRequestOpen,
    props.session,
    props.voiceButtonProps.state,
  ]);

  const isCurrentScope = useCallback((scope: AgentScope): boolean => {
    const current = agentScopeRef.current;
    return current.userId === scope.userId && current.generation === scope.generation;
  }, []);

  const loadMessages = useCallback(
    async (
      targetThreadKey: string,
      session: AuthSession,
    ): Promise<MemberAgentMessage[] | null> => {
      const scope = agentScopeRef.current;
      const rows = await listConvexCloudNewestThreadMessagesByThreadKey({
        session,
        threadKey: targetThreadKey,
        limit: 200,
      });
      if (!isCurrentScope(scope) || activeThreadKeyRef.current !== targetThreadKey) return null;
      const normalized = normalizeMessages(rows ?? []);
      setMessages(normalized);
      return normalized;
    },
    [isCurrentScope],
  );

  const setThreadError = useCallback(
    (
      targetThreadKey: string | null,
      value: string | null | ((previous: string | null) => string | null),
    ) => {
      if (targetThreadKey && targetThreadKey !== activeThreadKeyRef.current) return;
      setLocalError((previous) =>
        typeof value === "function" ? value(previous) : value,
      );
    },
    [],
  );

  const setInferenceIssueForActiveThread = useCallback<
    Dispatch<SetStateAction<InferenceIssueModalState | null>>
  >((value) => {
    setInferenceIssue((previous) => {
      const next = typeof value === "function" ? value(previous) : value;
      if (next?.threadId && next.threadId !== activeThreadKeyRef.current) return previous;
      return next;
    });
  }, []);

  const allowRunUiWrite = useCallback((): boolean => {
    const runScope = runUiScopeRef.current;
    return !runScope || isCurrentScope(runScope);
  }, [isCurrentScope]);

  const setScopedSendingByThread = useCallback<Dispatch<SetStateAction<Record<string, boolean>>>>(
    (value) => {
      if (allowRunUiWrite()) setSendingByThread(value);
    },
    [allowRunUiWrite],
  );

  const setScopedStreamingByThread = useCallback<
    Dispatch<SetStateAction<Record<string, ThreadStreamingState<never, never, never>>>>
  >((value) => {
    if (allowRunUiWrite()) setStreamingByThread(value);
  }, [allowRunUiWrite]);

  const setScopedRuntimeEventsByRunId = useCallback<
    Dispatch<SetStateAction<Record<string, ThreadStreamingRuntimeEvent[]>>>
  >((value) => {
    if (allowRunUiWrite()) setRuntimeEventsByRunId(value);
  }, [allowRunUiWrite]);

  const {
    createThreadMessage,
    runAgentTurn,
    stopStreamingTurn,
  } = useWebTurnRunnerController<
    AuthSession,
    MemberAgentMessage,
    never,
    never,
    never
  >({
    activeThreadId: threadKey,
    session: props.session,
    threadStreamingStateById: streamingByThread,
    getCloudRuntimeBaseUrl: getAuthUrl,
    getThreadById: (targetThreadKey) =>
      targetThreadKey === threadKey && activeThreadContextRef.current
        ? {
            id: targetThreadKey,
            title: "Your agent",
            model_id: DEFAULT_ACTIVE_MODEL_ID,
            runtime_engine: "polynet",
            project_id: null,
            community_id: activeThreadContextRef.current.communityId,
            context_version: activeThreadContextRef.current.contextVersion,
          }
        : null,
    fetchCloudPublic: props.fetchPublic,
    fetchAuth: props.fetchAuth,
    extractTextFromContentJson,
    parseMemoryUsedArray: () => [],
    parseHistoryUsedArray: () => [],
    extractCommunityEvidenceUsedV1: () => null,
    loadThreadMessages: async (targetThreadKey, session) => {
      if (!allowRunUiWrite()) return;
      await loadMessages(targetThreadKey, session);
    },
    loadThreads: async () => undefined,
    showMemoryToastMessage: () => undefined,
    setThreadErrorForThread: (targetThreadKey, value) => {
      if (allowRunUiWrite()) setThreadError(targetThreadKey, value);
    },
    setInferenceIssueModal: (value) => {
      if (allowRunUiWrite()) setInferenceIssueForActiveThread(value);
    },
    setThreadSendingStateById: setScopedSendingByThread,
    setThreadStreamingStateById: setScopedStreamingByThread,
    setRuntimeEventsByRunId: setScopedRuntimeEventsByRunId,
  });

  useEffect(() => {
    const previousThreadKey = activeThreadKeyRef.current;
    if (previousThreadKey) stopStreamingTurn(previousThreadKey);
    activeThreadKeyRef.current = null;
    activeThreadContextRef.current = null;
    setThreadKey(null);
    setEpisodeId(null);
    setThreadContext(null);
    setMessages([]);
    setSendingByThread({});
    setStreamingByThread({});
    setIsPreparing(false);
    setIsStartingNewChat(false);
    submitInFlightRef.current = false;
    setIsSubmitting(false);
    draftTextRef.current = "";
    setInput("");
    clearAttachmentDrafts();
    setIsUploadingAttachments(false);
    setLocalError(null);
    setInferenceIssue(null);
    retryRef.current = null;
    pendingResourceBuildRef.current = null;
    resourceBuildStartInFlightRef.current = false;
    setRecoveredResourceChangesetCards([]);
  }, [clearAttachmentDrafts, props.session?.user.id, stopStreamingTurn]);

  const previousSurfaceKeyRef = useRef(surfaceKey);
  useEffect(() => {
    if (previousSurfaceKeyRef.current === surfaceKey) return;
    previousSurfaceKeyRef.current = surfaceKey;
    setSendingByThread({});
    setStreamingByThread({});
    setInferenceIssue(null);
    draftTextRef.current = "";
    setInput("");
    clearAttachmentDrafts();
    setIsUploadingAttachments(false);
    setIsAttachmentDragOver(false);
    retryRef.current = null;
    setLocalError(null);
    pendingResourceBuildRef.current = null;
    setRecoveredResourceChangesetCards([]);
  }, [clearAttachmentDrafts, surfaceKey]);

  useEffect(() => {
    return () => {
      revokeDraftPreviews(attachmentsRef.current);
    };
  }, [revokeDraftPreviews]);

  useEffect(() => {
    if (!props.isVisible) {
      setIsOpen(false);
      setIsPreparing(false);
    }
  }, [props.isVisible]);

  useEffect(() => {
    if (
      !isConversationSurfaceActive ||
      !props.isVisible ||
      !surfaceKind ||
      !props.session
    ) return;
    let cancelled = false;
    if (activeThreadKeyRef.current) return;
    const scope = agentScopeRef.current;
    setIsPreparing(true);
    setLocalError(null);
    void (async () => {
      try {
        const usableSession = await props.ensureSession(
          props.session,
          "member_agent_dock_open",
        );
        if (!usableSession || cancelled || !isCurrentScope(scope)) return;
        const thread = await ensureCloudMemberAgentGlobalChannel({
          session: usableSession,
          initialCommunityId: communityId,
        });
        if (cancelled || !isCurrentScope(scope)) return;
        activeThreadKeyRef.current = thread.thread_key;
        setThreadKey(thread.thread_key);
        setEpisodeId(thread.episode_id);
        activeThreadContextRef.current = {
          communityId: thread.community_id,
          contextVersion: thread.context_version,
        };
        setThreadContext(activeThreadContextRef.current);
        await loadMessages(thread.thread_key, usableSession);
      } catch (error) {
        if (cancelled || !isCurrentScope(scope)) return;
        console.warn("member_agent_dock_open_failed", error);
        setLocalError("Your agent could not open.");
      } finally {
        if (!cancelled && isCurrentScope(scope)) setIsPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isConversationSurfaceActive,
    loadMessages,
    communityId,
    props.ensureSession,
    props.isVisible,
    props.session,
    surfaceKind,
    isCurrentScope,
  ]);

  const streamingState = threadKey ? streamingByThread[threadKey] ?? null : null;
  const runtimeEvents = streamingState?.runtimeEvents ?? [];
  const streamedText = streamingState?.content?.trim() ?? "";
  const isSending = Boolean(threadKey && sendingByThread[threadKey]);
  const turnIsActive = isSending || Boolean(streamingState);
  const composerIsBusy = turnIsActive || isUploadingAttachments || isSubmitting;
  const visibleMessages = messages.filter((message) => message.role !== "system");
  const dockError = localError ?? formatInferenceIssue(inferenceIssue);
  const showOnboardingAgentFocus = Boolean(
    communityId &&
    communityName &&
    onboardingSession?.community_id === communityId &&
    !onboarding?.firstPostAcknowledgementPending &&
    (
      shouldPresentCommunityOnboardingAgentStep(onboardingSession) ||
      shouldPresentCommunityOnboardingAgentReview(onboardingSession)
    ),
  );
  const onboardingDescriptionId = "community-onboarding-agent-description";

  useEffect(() => {
    const request = pendingResourceBuildRef.current;
    if (
      !request ||
      !isOpenSurface ||
      !props.isVisible ||
      !props.session ||
      props.surfaceContext?.kind !== "community" ||
      request.communityId !== communityId ||
      composerIsBusy ||
      isPreparing ||
      isStartingNewChat
    ) {
      return;
    }
    if (draftTextRef.current.trim() || attachmentsRef.current.length > 0) {
      pendingResourceBuildRef.current = null;
      setLocalError("Finish or clear your current agent message, then try again.");
      return;
    }
    pendingResourceBuildRef.current = null;
    draftTextRef.current = request.prompt;
    setInput(request.prompt);
    composerFormRef.current?.requestSubmit();
  }, [
    communityId,
    composerIsBusy,
    isOpenSurface,
    isPreparing,
    isStartingNewChat,
    props.isVisible,
    props.session,
    props.surfaceContext,
    resourceBuildLaunchVersion,
  ]);

  useEffect(() => {
    const liveCards = extractRuntimeResourceChangesetCards(runtimeEvents);
    if (liveCards.length === 0) return;
    setRecoveredResourceChangesetCards((current) => {
      const merged = new Map(current.map((card) => [card.changesetId, card]));
      liveCards.forEach((card) => merged.set(card.changesetId, card));
      return [...merged.values()]
        .sort((a, b) => a.seq - b.seq)
        .slice(-1);
    });
  }, [runtimeEvents]);

  useEffect(() => {
    if (
      !isOpenSurface ||
      turnIsActive ||
      !props.canManageResources ||
      !props.session ||
      !communityId
    ) {
      return;
    }
    let cancelled = false;
    const scope = agentScopeRef.current;
    void (async () => {
      try {
        const usableSession = await props.ensureSession(
          props.session,
          "member_agent_resource_changeset_recovery",
        );
        if (!usableSession || cancelled || !isCurrentScope(scope)) return;
        const rows = await listCloudPendingCommunityResourceBuilderChangesets<
          AuthSession,
          Record<string, unknown>
        >({
          session: usableSession,
          communityId,
          limit: 1,
        });
        if (cancelled || !isCurrentScope(scope)) return;
        setRecoveredResourceChangesetCards(
          rows.flatMap((row, index) => {
            const updatedAt = Date.parse(String(row.updated_at ?? ""));
            const card = buildResourceChangesetCardFromPayload(
              row,
              Number.isFinite(updatedAt) ? updatedAt : index,
            );
            return card ? [card] : [];
          }),
        );
      } catch (error) {
        if (!cancelled) {
          console.warn("member_agent_resource_changeset_recovery_failed", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    communityId,
    isCurrentScope,
    isOpenSurface,
    props.canManageResources,
    props.ensureSession,
    props.session,
    turnIsActive,
  ]);

  useEffect(() => {
    if (
      !showOnboardingAgentFocus ||
      !onboardingSession ||
      !props.isVisible ||
      onboardingOpenedSessionIdsRef.current.has(onboardingSession.id)
    ) {
      return;
    }
    onboardingOpenedSessionIdsRef.current.add(onboardingSession.id);
    onboardingFocusSessionIdRef.current = onboardingSession.id;
    if (props.mobileShellActive) {
      props.onRequestOpen?.();
      return;
    }
    setIsOpen(true);
  }, [
    onboardingSession,
    props.isVisible,
    props.mobileShellActive,
    props.onRequestOpen,
    showOnboardingAgentFocus,
  ]);

  useEffect(() => {
    if (
      !showOnboardingAgentFocus ||
      !shouldPresentCommunityOnboardingAgentStep(onboardingSession) ||
      !onboardingSession ||
      !communityName ||
      onboardingSeededSessionIdsRef.current.has(onboardingSession.id)
    ) {
      return;
    }
    onboardingSeededSessionIdsRef.current.add(onboardingSession.id);
    setInput((current) => {
      if (current.trim()) {
        draftTextRef.current = current;
        return current;
      }
      const seededPrompt =
        `What is one useful first action I should take in ${communityName}?`;
      draftTextRef.current = seededPrompt;
      return seededPrompt;
    });
  }, [communityName, onboardingSession, showOnboardingAgentFocus]);

  useEffect(() => {
    if (
      !showOnboardingAgentFocus ||
      !shouldPresentCommunityOnboardingAgentStep(onboardingSession) ||
      !onboardingSession ||
      onboardingFocusSessionIdRef.current !== onboardingSession.id ||
      !isOpenSurface ||
      !threadKey ||
      turnIsActive ||
      isPreparing ||
      isStartingNewChat
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea || textarea.disabled || !document.contains(textarea)) return;
      textarea.focus({ preventScroll: true });
      onboardingFocusSessionIdRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    isOpenSurface,
    isPreparing,
    isStartingNewChat,
    onboardingSession,
    showOnboardingAgentFocus,
    threadKey,
    turnIsActive,
  ]);

  const observeThreadContext = useCallback((communityId: string | null, contextVersion: number) => {
    const next = {
      communityId: String(communityId ?? "").trim() || null,
      contextVersion: Math.max(0, Math.floor(contextVersion)),
    };
    activeThreadContextRef.current = next;
    setThreadContext(next);
  }, []);

  const synchronizeDesiredLens = useCallback(
    async (
      channel: CloudMemberAgentChannel,
      session: AuthSession,
      desiredCommunityId: string | null,
    ): Promise<CloudMemberAgentChannel> => {
      if (channel.community_id === desiredCommunityId) {
        observeThreadContext(channel.community_id, channel.context_version);
        return channel;
      }
      const context = await syncThreadCommunityLensCloud({
        threadId: channel.thread_key,
        desiredCommunityId,
        initialExpectedContextVersion: channel.context_version,
        fetchLatestContext: () =>
          fetchCloudThreadContextById({
            session,
            threadId: channel.thread_key,
          }),
        setThreadContext: (expectedContextVersion) =>
          setCloudThreadContext({
            session,
            threadId: channel.thread_key,
            expectedContextVersion,
            communityId: desiredCommunityId,
          }),
      });
      if (!context || context.community_id !== desiredCommunityId) {
        throw new Error("Community context was not confirmed.");
      }
      observeThreadContext(desiredCommunityId, context.context_version);
      return {
        ...channel,
        community_id: desiredCommunityId,
        context_version: context.context_version,
      };
    },
    [observeThreadContext],
  );

  const activateEmptyEpisode = useCallback((thread: CloudMemberAgentChannel) => {
    activeThreadKeyRef.current = thread.thread_key;
    observeThreadContext(thread.community_id, thread.context_version);
    setThreadKey(thread.thread_key);
    setEpisodeId(thread.episode_id);
    setMessages([]);
    draftTextRef.current = "";
    setInput("");
    clearAttachmentDrafts();
    setIsUploadingAttachments(false);
    setSendingByThread({});
    setStreamingByThread({});
    retryRef.current = null;
  }, [clearAttachmentDrafts, observeThreadContext]);

  useEffect(() => {
    if (!isOpenSurface) return;
    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpenSurface, messages.length, runtimeEvents.length, streamedText]);

  const startNewChat = async () => {
    if (
      composerIsBusy ||
      isPreparing ||
      isStartingNewChat ||
      !episodeId ||
      !props.surfaceContext ||
      !props.session
    ) {
      return;
    }
    const scope = agentScopeRef.current;
    const expectedEpisodeId = episodeId;
    let usableSession: AuthSession | null = null;
    setIsStartingNewChat(true);
    setLocalError(null);
    setInferenceIssue(null);
    try {
      usableSession = await props.ensureSession(
        props.session,
        "member_agent_dock_new_chat",
      );
      if (!usableSession || !isCurrentScope(scope)) return;
      const thread = await startNewCloudMemberAgentGlobalEpisode({
        session: usableSession,
        initialCommunityId: communityId,
        expectedActiveEpisodeId: expectedEpisodeId,
      });
      if (!isCurrentScope(scope)) return;
      activateEmptyEpisode(thread);
    } catch (error) {
      if (!isCurrentScope(scope)) return;
      console.warn("member_agent_dock_new_chat_failed", error);
      if (usableSession) {
        try {
          const current = await ensureCloudMemberAgentGlobalChannel({
            session: usableSession,
            initialCommunityId: communityId,
          });
          if (!isCurrentScope(scope)) return;
          if (current.episode_id !== expectedEpisodeId) {
            activateEmptyEpisode(current);
            try {
              await loadMessages(current.thread_key, usableSession);
            } catch (loadError) {
              if (!isCurrentScope(scope)) return;
              console.warn("member_agent_dock_new_chat_reconcile_load_failed", loadError);
              setLocalError("Your new chat is active, but its messages could not load.");
            }
            return;
          }
        } catch (reconcileError) {
          if (!isCurrentScope(scope)) return;
          console.warn("member_agent_dock_new_chat_reconcile_failed", reconcileError);
        }
      }
      setLocalError("Your agent could not start a new chat. Try again.");
    } finally {
      if (isCurrentScope(scope)) setIsStartingNewChat(false);
    }
  };

  const ingestAttachmentFiles = useCallback((files: readonly File[]) => {
    if (files.length === 0) return;
    const error = validateMemberAgentImageDrafts(files, attachmentsRef.current);
    if (error) {
      setLocalError(error);
      return;
    }
    const next = [
      ...attachmentsRef.current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name || "image",
        type: "image" as const,
        mime: file.type,
        size: file.size,
        file,
        previewUrl: URL.createObjectURL(file),
        storage_id: null,
      })),
    ];
    setLocalError(null);
    setAttachmentDrafts(next);
  }, [setAttachmentDrafts]);

  const removeAttachment = useCallback((id: string) => {
    const removed = attachmentsRef.current.find((attachment) => attachment.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setAttachmentDrafts(
      attachmentsRef.current.filter((attachment) => attachment.id !== id),
    );
    retryRef.current = null;
  }, [setAttachmentDrafts]);

  const handleAttachmentPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []).filter(
      (file): file is File => file instanceof File,
    );
    if (files.length === 0) return;
    event.preventDefault();
    ingestAttachmentFiles(files);
  }, [ingestAttachmentFiles]);

  const handleAttachmentDrop = useCallback((event: DragEvent<HTMLFormElement>) => {
    const files = Array.from(event.dataTransfer.files ?? []).filter(
      (file): file is File => file instanceof File,
    );
    if (files.length === 0) return;
    event.preventDefault();
    setIsAttachmentDragOver(false);
    ingestAttachmentFiles(files);
  }, [ingestAttachmentFiles]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitInFlightRef.current) return;
    const surfaceContext = props.surfaceContext;
    const session = props.session;
    if (
      composerIsBusy ||
      isPreparing ||
      isStartingNewChat ||
      !surfaceContext ||
      !session
    ) {
      return;
    }
    const desiredCommunityId =
      surfaceContext.kind === "community" ? communityId : null;
    if (surfaceContext.kind === "community" && !desiredCommunityId) {
      setLocalError("This community context is still loading. Try again.");
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setLocalError(null);
    setInferenceIssue(null);
    const scope = agentScopeRef.current;
    let text = "";
    let workingDrafts: MemberAgentImageDraft[] = [];
    let signature = "";
    let messageId = "";
    let committed = false;
    let targetThreadKey: string | null = null;

    try {
      const voiceTranscript = await props.finalizeVoiceInputForSubmit?.() ?? "";
      if (!isCurrentScope(scope)) return;
      text = mergeVoiceTranscript(draftTextRef.current, voiceTranscript).trim();
      workingDrafts = attachmentsRef.current.slice();
      if (!text && workingDrafts.length === 0) return;

      signature = buildDraftSignature(text, workingDrafts);
      const retry = retryRef.current;
      messageId = retry?.signature === signature ? retry.messageId : crypto.randomUUID();
      if (retry?.signature === signature) workingDrafts = retry.attachments.slice();

      // Detach the submitted snapshot immediately. Anything entered after this
      // point belongs to the next turn and must never be cleared by this one.
      draftTextRef.current = "";
      setInput("");
      attachmentsRef.current = [];
      setAttachments([]);
      retryRef.current = null;
      setIsUploadingAttachments(workingDrafts.some((attachment) => !attachment.storage_id));

      const usableSession = await props.ensureSession(
        session,
        "member_agent_dock_send",
      );
      if (!usableSession) throw new Error("auth_session_required");
      if (!isCurrentScope(scope)) return;
      let thread = await ensureCloudMemberAgentGlobalChannel({
        session: usableSession,
        initialCommunityId: desiredCommunityId,
      });
      if (!isCurrentScope(scope)) return;
      thread = await synchronizeDesiredLens(thread, usableSession, desiredCommunityId);
      if (!isCurrentScope(scope)) return;
      let activeMessages = messages;
      if (activeThreadKeyRef.current !== thread.thread_key) {
        activeThreadKeyRef.current = thread.thread_key;
        setThreadKey(thread.thread_key);
        setEpisodeId(thread.episode_id);
        setMessages([]);
        activeMessages = (await loadMessages(thread.thread_key, usableSession)) ?? [];
        if (!isCurrentScope(scope)) return;
      } else {
        setEpisodeId(thread.episode_id);
      }
      targetThreadKey = thread.thread_key;
      for (let index = 0; index < workingDrafts.length; index += 1) {
        const draft = workingDrafts[index]!;
        if (draft.storage_id) continue;
        const claimed = await uploadCloudMemberAgentImageFile({
          session: usableSession,
          threadId: thread.thread_key,
          messageId,
          file: draft.file,
        });
        if (!isCurrentScope(scope)) return;
        workingDrafts = workingDrafts.map((candidate) =>
          candidate.id === draft.id
            ? {
                ...candidate,
                name: claimed.name,
                mime: claimed.mime,
                size: claimed.size,
                storage_id: claimed.storage_id,
              }
            : candidate,
        );
      }
      if (!isCurrentScope(scope)) return;
      const storedAttachments = workingDrafts.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        type: "image" as const,
        mime: attachment.mime,
        size: attachment.size,
        storage_id: String(attachment.storage_id ?? "").trim(),
      }));
      setSendingByThread((previous) => ({ ...previous, [thread.thread_key]: true }));
      await createThreadMessage(usableSession, {
        id: messageId,
        threadId: thread.thread_key,
        role: "user",
        content_json: {
          text,
          ...(storedAttachments.length > 0 ? { attachments: storedAttachments } : null),
        },
      });
      committed = true;

      const optimisticAttachments = storedAttachments.map((attachment) => ({
        ...attachment,
        url: workingDrafts.find((draft) => draft.id === attachment.id)?.previewUrl ?? null,
      }));
      const optimisticMessage: MemberAgentMessage = {
        id: messageId,
        thread_id: thread.thread_key,
        seq: activeMessages.length + 1,
        role: "user",
        content_json: {
          text,
          ...(optimisticAttachments.length > 0
            ? { attachments: optimisticAttachments }
            : null),
        },
        engine_id: null,
        model_id: null,
        run_id: null,
        created_at: new Date().toISOString(),
      };
      if (isCurrentScope(scope)) {
        const optimisticMessages = activeMessages.some((message) => message.id === messageId)
          ? activeMessages
          : [...activeMessages, optimisticMessage];
        setMessages(optimisticMessages);
      }

      // The message is durable now. Finish its captured turn even if navigation
      // changes; only the visible UI writes remain scoped to the current surface.
      runUiScopeRef.current = scope;
      const result = await runAgentTurn(usableSession, thread.thread_key, {
        preferredModelId: thread.model_id || DEFAULT_ACTIVE_MODEL_ID,
        mode: "respond",
        runIdHint: `member_agent_dock:${messageId}`,
        userMessageKey: messageId,
        runtimeEngine: "polynet",
        invocationSurface: "member_agent_dock",
        surfaceContext,
        suppressOnboardingProgress: onboarding?.mode === "preview",
        requestedFundingSource: "platform",
        requestedAgenticTools: true,
        replyToId: messageId,
        messages: [optimisticMessage],
        suppressStreamingUi: !isCurrentScope(scope),
      });
      if (result.error) throw new Error(result.error);
      if (isCurrentScope(scope)) {
        await loadMessages(thread.thread_key, usableSession);
        if (onboarding?.mode === "preview") onboarding.completeAgentTurnPreview();
      }
      revokeDraftPreviews(workingDrafts);
    } catch (error) {
      if (!isCurrentScope(scope)) {
        if (committed) revokeDraftPreviews(workingDrafts);
        return;
      }
      console.warn("member_agent_dock_send_failed", error);
      const currentText = draftTextRef.current.trim();
      const restoredText = currentText ? `${text}\n${currentText}` : text;
      draftTextRef.current = restoredText;
      setInput(restoredText);
      const currentDrafts = attachmentsRef.current;
      const restoredDrafts = [
        ...workingDrafts,
        ...currentDrafts.filter(
          (candidate) => !workingDrafts.some((draft) => draft.id === candidate.id),
        ),
      ];
      setAttachmentDrafts(restoredDrafts);
      if (text || workingDrafts.length > 0) {
        retryRef.current = { signature, text, messageId, attachments: workingDrafts };
      }
      setLocalError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Your message was not sent. Try again.",
      );
    } finally {
      submitInFlightRef.current = false;
      runUiScopeRef.current = null;
      setIsSubmitting(false);
      setIsUploadingAttachments(false);
      if (targetThreadKey) {
        setSendingByThread((previous) => {
          const next = { ...previous };
          delete next[targetThreadKey!];
          return next;
        });
      }
    }
  };

  if (!props.isVisible || !props.surfaceContext) return null;

  const presentation = buildMemberAgentSurfacePresentation(
    props.surfaceContext,
    communityName,
  );
  const hasCommunityIntelligence = Boolean(
    presentation.communityIntelligenceName,
  );
  const shouldRenderStreamedText =
    Boolean(streamedText) && !hasSequencedAssistantText(runtimeEvents);

  const liveResourceChangesetIds = new Set(
    extractRuntimeResourceChangesetCards(runtimeEvents).map(
      (card) => card.changesetId,
    ),
  );
  const persistentResourceChangesetCards =
    recoveredResourceChangesetCards.filter(
      (card) => !liveResourceChangesetIds.has(card.changesetId),
    );

  return (
    <>
    <aside
      id="polynet-member-agent-surface"
      className={`member-agent-dock${isOpenSurface ? " is-open" : ""}${props.mobileRoot ? " mobile-root" : ""}${showOnboardingAgentFocus ? " is-onboarding" : ""}${props.isSuppressed ? " is-suppressed" : ""}`}
      aria-live="polite"
    >
      {!props.mobileShellActive ? (
        <button
          type="button"
          className={`member-agent-dock-launcher${composerIsBusy ? " is-working" : ""}${showOnboardingAgentFocus ? " is-onboarding" : ""}`}
          onClick={() => setIsOpen((open) => !open)}
          aria-label={isOpen ? presentation.closeLabel : presentation.openLabel}
          title={isOpen ? presentation.closeLabel : presentation.openLabel}
          aria-expanded={isOpen}
        >
          {isOpen ? <X aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        </button>
      ) : null}

      <section className="member-agent-dock-panel" aria-label={presentation.title}>
        <header className="member-agent-dock-header">
          <div className="member-agent-dock-identity">
            {hasCommunityIntelligence ? (
              <CommunityAvatar
                communityId={communityId}
                visualIdentity={props.community?.visual_identity}
                name={communityName}
                imageUrl={props.community?.avatar_url}
                focusX={props.community?.avatar_focus_x}
                focusY={props.community?.avatar_focus_y}
                zoom={props.community?.avatar_zoom}
                className="member-agent-dock-community-avatar"
                aria-hidden={true}
              />
            ) : (
              <span className="member-agent-dock-avatar" aria-hidden="true">
                <Sparkles />
              </span>
            )}
            <span>
              <strong>{presentation.title}</strong>
              <small>
                {isUploadingAttachments
                  ? "Uploading images"
                  : turnIsActive
                    ? "Working"
                    : `${presentation.surfaceLabel} context`}
              </small>
            </span>
          </div>
          <div className="member-agent-dock-header-actions">
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={
                showOnboardingAgentFocus ||
                composerIsBusy ||
                isPreparing ||
                isStartingNewChat ||
                !episodeId
              }
              aria-label="Start fresh conversation"
              title="Start fresh conversation"
            >
              <MessageSquarePlus aria-hidden="true" />
            </button>
            {!props.mobileShellActive ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={showOnboardingAgentFocus}
                aria-label="Close"
                title="Close"
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

        <div className="member-agent-dock-transcript" ref={scrollRef}>
          {visibleMessages.length === 0 &&
          !composerIsBusy &&
          !isPreparing &&
          !isStartingNewChat ? (
            <div className="member-agent-dock-empty">
              {hasCommunityIntelligence
                ? <Sparkles aria-hidden="true" />
                : <MessageCircle aria-hidden="true" />}
              <p>
                {presentation.emptyLabel}
              </p>
            </div>
          ) : null}

          {visibleMessages.map((message) => {
            const text = extractTextFromContentJson(message.content_json);
            const messageAttachments = parseMessageAttachments(message.content_json);
            return (
              <article
                key={message.id}
                className={`member-agent-dock-message is-${message.role}${text ? "" : " is-media-only"}`}
              >
                {text
                  ? message.role === "assistant"
                    ? renderMarkdown(text)
                    : <p>{text}</p>
                  : null}
                <MemberAgentAttachmentViews attachments={messageAttachments} />
              </article>
            );
          })}

          {persistentResourceChangesetCards.length > 0 ? (
            <RuntimeResourceChangesetApprovalCards
              cards={persistentResourceChangesetCards}
              session={props.session}
            />
          ) : null}

          {isPreparing ? (
            <div className="member-agent-dock-reasoning">
              <LoaderCircle aria-hidden="true" />
              <span>{presentation.loadingLabel}</span>
            </div>
          ) : null}

          {isStartingNewChat ? (
            <div className="member-agent-dock-reasoning">
              <LoaderCircle aria-hidden="true" />
              <span>Starting fresh</span>
            </div>
          ) : null}

          {turnIsActive || shouldRenderStreamedText ? (
            <div className="member-agent-dock-live-turn">
              {runtimeEvents.length > 0 ? (
                <RuntimeLiveTimeline
                  events={runtimeEvents}
                  session={props.session}
                  renderReasoningMarkdown={renderMarkdown}
                  showActiveIndicators={turnIsActive}
                  showThinkingFooter={!shouldRenderStreamedText}
                />
              ) : turnIsActive ? (
                <div className="member-agent-dock-reasoning">
                  <LoaderCircle aria-hidden="true" />
                  <span>Getting oriented in {presentation.surfaceLabel}</span>
                </div>
              ) : null}
              {shouldRenderStreamedText ? (
                <article className="member-agent-dock-message is-assistant is-streaming">
                  {renderMarkdown(streamedText)}
                  {turnIsActive ? <span className="member-agent-dock-caret" aria-hidden="true" /> : null}
                </article>
              ) : null}
            </div>
          ) : null}

          {dockError ? <p className="member-agent-dock-error">{dockError}</p> : null}
        </div>

        <div className="member-agent-dock-composer-shell">
          {attachments.length > 0 ? (
            <div className="member-agent-dock-composer-attachments">
              {attachments.map((attachment) => (
                <div className="member-agent-dock-composer-image" key={attachment.id}>
                  <img src={attachment.previewUrl} alt={attachment.name} />
                  {isUploadingAttachments && !attachment.storage_id ? (
                    <span aria-label={`Uploading ${attachment.name}`}>
                      <LoaderCircle aria-hidden="true" />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    disabled={composerIsBusy}
                    aria-label={`Remove ${attachment.name}`}
                    title="Remove"
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <form
            ref={composerFormRef}
            className={`member-agent-dock-composer${isAttachmentDragOver ? " is-dragging" : ""}${showOnboardingAgentFocus ? " is-onboarding" : ""}`}
            onSubmit={submit}
            onDragEnter={(event) => {
              if (!Array.from(event.dataTransfer.types ?? []).includes("Files")) return;
              event.preventDefault();
              setIsAttachmentDragOver(true);
            }}
            onDragOver={(event) => {
              if (!Array.from(event.dataTransfer.types ?? []).includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsAttachmentDragOver(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setIsAttachmentDragOver(false);
            }}
            onDrop={handleAttachmentDrop}
          >
            <input
              ref={fileInputRef}
              className="member-agent-dock-file-input"
              type="file"
              multiple
              accept={MEMBER_AGENT_IMAGE_ACCEPT}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                ingestAttachmentFiles(files);
                event.currentTarget.value = "";
              }}
            />
            <button
              className="member-agent-dock-attach"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={composerIsBusy || isPreparing || isStartingNewChat}
              aria-label="Attach images"
              title="Attach images"
            >
              <Paperclip aria-hidden="true" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                draftTextRef.current = event.target.value;
                setInput(event.target.value);
                event.currentTarget.style.height = "auto";
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 112)}px`;
              }}
              onPaste={handleAttachmentPaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={presentation.composerLabel}
              aria-label={presentation.composerLabel}
              aria-describedby={showOnboardingAgentFocus ? onboardingDescriptionId : undefined}
              rows={1}
              maxLength={8000}
              disabled={composerIsBusy || isPreparing || isStartingNewChat}
            />
            <VoiceInputButton
              {...props.voiceButtonProps}
              disabled={
                props.voiceButtonProps.disabled ||
                composerIsBusy ||
                isPreparing ||
                isStartingNewChat
              }
            />
            {turnIsActive && threadKey ? (
              <button
                className="member-agent-dock-send chat-send ask-send-btn ask-send-btn-v2"
                type="button"
                onClick={() => stopStreamingTurn(threadKey)}
                aria-label="Stop"
                title="Stop"
              >
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                className="member-agent-dock-send chat-send ask-send-btn ask-send-btn-v2"
                type="submit"
                disabled={
                  (!input.trim() && attachments.length === 0) ||
                  isUploadingAttachments ||
                  isPreparing ||
                  isStartingNewChat
                }
                aria-label="Send message"
                title="Send"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
                </svg>
              </button>
            )}
          </form>
        </div>
      </section>
    </aside>
    </>
  );
});
