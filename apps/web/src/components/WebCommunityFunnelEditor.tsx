import {
  Link2,
  LoaderCircle,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { getAuthUrl, type AuthSession } from "../auth";
import { resolveAuthPresentationIdentity } from "../../../../shared/authSession";
import { extractTextFromContentJson } from "../../../../shared/communityMessageParsing";
import {
  normalizeCommunityFunnelManagerConfig,
  normalizeCommunityFunnelVslUrl,
} from "../../../../shared/communityFunnel";
import {
  fetchCloudCommunityFunnelConfig,
  publishCloudCommunityFunnelDraft,
  setCloudActiveCommunityFunnel,
  setCloudCommunityFunnelDraftVsl,
} from "../../../../shared/cloudCommunityFunnelGateway";
import { fetchCloudPublicFunnelStats } from "../../../../shared/cloudPublicFunnelGateway";
import { ensureCloudThreadRecord } from "../../../../shared/cloudThreadsGateway";
import {
  listConvexCloudNewestThreadMessagesByThreadKey,
  type CloudMessageTransportRow,
} from "../../../../shared/cloudThreadsRead";
import { COMMUNITY_OWNER_FUNDED_MODEL_ID } from "../../../../shared/founderInference";
import { buildCommunityFunnelThreadKey } from "../../../../shared/runtimeInvocationSurface";
import type {
  CommunityCustomFunnelSlot,
  CommunityFunnelManagerConfig,
  CommunityFunnelSlot,
  CommunityMemberProof,
  CommunityPublicFace,
} from "../../../../shared/communityTypes";
import { buildCommunityFunnelRenderModel } from "../../../../shared/communityFunnelUi";
import {
  communityFunnelDraftAdvanced,
  readCommunityFunnelDraftAuthoritySnapshot,
} from "../../../../shared/communityFunnelTurnPostcondition";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import { useWebTurnRunnerController } from "../../../../shared/useWebTurnRunnerController";
import { renderMarkdown } from "../../../../shared/markdownUi";
import type {
  InferenceIssueModalState,
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../../shared/webTurnRunnerCore";
import type { CommunityFunnelSurfaceAction } from "./CommunityFunnelSurface";
import { WebCommunityFunnelRenderer } from "./WebCommunityFunnelRenderer";
import { WebAgentLiveTurn } from "./WebAgentLiveTurn";
import { WebPlatformTabList } from "./WebPlatformChoiceControls";

type PreviewCommunityLike = {
  id: string;
  slug?: string | null;
  name: string;
  one_liner?: string | null;
  about?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  member_count?: number | null;
  member_faces_preview?: CommunityPublicFace[] | null;
};

type FunnelBuilderMessage = Omit<CloudMessageTransportRow, "role"> & {
  role: "user" | "assistant" | "system";
};

export type WebCommunityFunnelEditorProps = {
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
  handlePreviewCommunityFunnel: (slot: CommunityFunnelSlot) => void;
  communityFunnelConfig: CommunityFunnelManagerConfig;
  hydrateCommunityFunnelEditor: (
    config: CommunityFunnelManagerConfig | null,
  ) => void;
  previewPrimaryActionLabel: string;
  previewCommunity: PreviewCommunityLike;
};

function normalizeMessages(
  rows: CloudMessageTransportRow[],
): FunnelBuilderMessage[] {
  return rows
    .filter(
      (
        row,
      ): row is CloudMessageTransportRow & {
        role: FunnelBuilderMessage["role"];
      } =>
        row.role === "user" ||
        row.role === "assistant" ||
        row.role === "system",
    )
    .sort((left, right) => left.seq - right.seq);
}

function formatInferenceIssue(
  issue: InferenceIssueModalState | null,
): string | null {
  if (!issue) return null;
  return (
    issue.message?.trim() || "The funnel composer could not complete this turn."
  );
}

function formatVslSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_funnel_draft_conflict")) {
    return "The draft changed elsewhere. The latest version was reloaded; try again.";
  }
  if (message.includes("community_funnel_vsl_url_unsupported")) {
    return "Use a YouTube, Vimeo, Loom, or Wistia video link.";
  }
  if (message.includes("community_forbidden")) {
    return "Only community managers can change the Video Sales Letter.";
  }
  return "The Video Sales Letter could not be saved.";
}

function formatActivationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_funnel_activation_conflict")) {
    return "This funnel changed elsewhere. Review it before making it live.";
  }
  if (message.includes("community_funnel_activation_requires_published")) {
    return "Publish this funnel before making it live.";
  }
  if (message.includes("community_forbidden")) {
    return "Only community managers can make a funnel live.";
  }
  return "The selected funnel could not be made live.";
}

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const [selectedSlot, setSelectedSlot] = useState<CommunityFunnelSlot>("default");
  const selectedCustomSlot: CommunityCustomFunnelSlot | null =
    selectedSlot === "default" ? null : selectedSlot;
  const selectedVariant = selectedCustomSlot
    ? props.communityFunnelConfig.custom_funnels[selectedCustomSlot]
    : null;
  const selectedCommunityIdRef = useRef(props.previewCommunity.id);
  const threadKey = useMemo(
    () => buildCommunityFunnelThreadKey(
      props.previewCommunity.id,
      selectedCustomSlot ?? "custom_1",
    ),
    [props.previewCommunity.id, selectedCustomSlot],
  );
  const [memberProof, setMemberProof] = useState<CommunityMemberProof>({
    member_count: props.previewCommunity.member_count ?? null,
    member_faces_preview: props.previewCommunity.member_faces_preview ?? null,
  });
  useEffect(() => {
    let cancelled = false;
    const slug = props.previewCommunity.slug?.trim() ?? "";
    setMemberProof({
      member_count: props.previewCommunity.member_count ?? null,
      member_faces_preview: props.previewCommunity.member_faces_preview ?? null,
    });
    if (!slug) {
      return () => {
        cancelled = true;
      };
    }
    void fetchCloudPublicFunnelStats<AuthSession, CommunityMemberProof>({
      communitySlug: slug,
    })
      .then((payload) => {
        if (cancelled || !payload?.ok || !payload.community) return;
        setMemberProof({
          member_count: payload.community.member_count ?? null,
          member_faces_preview: payload.community.member_faces_preview ?? null,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("community_funnel_member_proof_load_failed", error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.previewCommunity.id,
    props.previewCommunity.member_count,
    props.previewCommunity.member_faces_preview,
    props.previewCommunity.slug,
  ]);
  const hydratedPreviewCommunity = useMemo(
    () => ({ ...props.previewCommunity, ...memberProof }),
    [memberProof, props.previewCommunity],
  );
  const [messages, setMessages] = useState<FunnelBuilderMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingStream, setIsAwaitingStream] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isSavingVsl, setIsSavingVsl] = useState(false);
  const [vslInput, setVslInput] = useState(
    selectedVariant?.draft_vsl_url ?? "",
  );
  const [vslError, setVslError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inferenceIssue, setInferenceIssue] =
    useState<InferenceIssueModalState | null>(null);
  const [sendingByThread, setSendingByThread] = useState<
    Record<string, boolean>
  >({});
  const [streamingByThread, setStreamingByThread] = useState<
    Record<string, ThreadStreamingState<never, never, never>>
  >({});
  const [, setRuntimeEventsByRunId] = useState<
    Record<string, ThreadStreamingRuntimeEvent[]>
  >({});
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const followStreamingRef = useRef(true);
  const sessionRef = useRef(props.session);
  const activeThreadKeyRef = useRef(threadKey);
  const activeCommunityIdRef = useRef(props.previewCommunity.id);
  const submitInFlightRef = useRef(false);
  sessionRef.current = props.session;
  activeThreadKeyRef.current = threadKey;
  activeCommunityIdRef.current = props.previewCommunity.id;
  const sessionIdentity = resolveAuthPresentationIdentity(props.session);

  const content = selectedVariant?.draft_content_v2 ?? null;
  const savedVslUrl = selectedVariant?.draft_vsl_url ?? null;
  const isVslInputDirty = vslInput.trim() !== (savedVslUrl ?? "");
  const isPublishedCurrentDraft =
    Boolean(content) &&
    Boolean(selectedVariant?.published_content_v2) &&
    (selectedVariant?.draft_revision ?? 0) > 0 &&
    selectedVariant?.published_draft_revision === selectedVariant?.draft_revision;
  const selectedSlotIsLive =
    props.communityFunnelConfig.active_slot === selectedSlot;
  const previewRenderModel = useMemo(
    () => buildCommunityFunnelRenderModel({
      communityName: hydratedPreviewCommunity.name,
      oneLiner: hydratedPreviewCommunity.one_liner,
      about: hydratedPreviewCommunity.about,
      funnel: selectedSlot === "default"
        ? {
            ...props.communityFunnelConfig,
            active_slot: "default",
            published_content_v2: null,
            published_vsl_url: null,
          }
        : content
        ? {
            ...props.communityFunnelConfig,
            active_slot: selectedSlot,
            published_content_v2: content,
            published_vsl_url: savedVslUrl,
          }
        : {
            ...props.communityFunnelConfig,
            active_slot: selectedSlot,
            published_content_v2: null,
            published_vsl_url: null,
          },
    }),
    [
      content,
      hydratedPreviewCommunity.about,
      hydratedPreviewCommunity.name,
      hydratedPreviewCommunity.one_liner,
      props.communityFunnelConfig,
      savedVslUrl,
      selectedSlot,
    ],
  );
  const previewAction = useMemo<CommunityFunnelSurfaceAction>(() => ({
    communityName: hydratedPreviewCommunity.name,
    primaryActionLabel: props.previewPrimaryActionLabel,
    isPrimaryActionDisabled: true,
    onPrimaryAction: () => undefined,
    canJoinWithApproval: false,
    showSignIn: false,
    approvalPending: false,
    approvalDenied: false,
    canRequestAgain: false,
    isPreviewMode: true,
  }), [hydratedPreviewCommunity.name, props.previewPrimaryActionLabel]);

  useEffect(() => {
    if (selectedCommunityIdRef.current === props.previewCommunity.id) return;
    selectedCommunityIdRef.current = props.previewCommunity.id;
    setSelectedSlot("default");
  }, [props.previewCommunity.id]);

  useEffect(() => {
    setVslInput(selectedVariant?.draft_vsl_url ?? "");
  }, [props.previewCommunity.id, selectedSlot, selectedVariant?.draft_vsl_url]);

  useEffect(() => {
    setVslError(null);
    setLocalError(null);
  }, [props.previewCommunity.id, selectedSlot]);

  const loadMessages = useCallback(
    async (targetThreadKey: string, session: AuthSession) => {
      const rows = await listConvexCloudNewestThreadMessagesByThreadKey({
        session,
        threadKey: targetThreadKey,
        limit: 100,
      });
      if (activeThreadKeyRef.current === targetThreadKey) {
        setMessages(normalizeMessages(rows ?? []));
      }
    },
    [],
  );

  const refreshDraft = useCallback(
    async (session: AuthSession) => {
      const config = await fetchCloudCommunityFunnelConfig<
        AuthSession,
        CommunityFunnelManagerConfig
      >({
        session,
        communityId: props.previewCommunity.id,
      });
      const normalizedConfig = normalizeCommunityFunnelManagerConfig(config);
      if (activeCommunityIdRef.current === props.previewCommunity.id) {
        props.hydrateCommunityFunnelEditor(normalizedConfig);
      }
      return normalizedConfig;
    },
    [props.hydrateCommunityFunnelEditor, props.previewCommunity.id],
  );

  const { createThreadMessage, runAgentTurn, stopStreamingTurn } =
    useWebTurnRunnerController<
      AuthSession,
      FunnelBuilderMessage,
      never,
      never,
      never
    >({
      activeThreadId: threadKey,
      session: props.session,
      threadStreamingStateById: streamingByThread,
      getCloudRuntimeBaseUrl: getAuthUrl,
      getThreadById: (targetThreadKey) =>
        targetThreadKey === threadKey
          ? {
              id: threadKey,
              title: `${props.previewCommunity.name} funnel`,
              model_id: COMMUNITY_OWNER_FUNDED_MODEL_ID,
              runtime_engine: "polynet",
              community_id: props.previewCommunity.id,
              context_version: 0,
            }
          : null,
      fetchAuth: props.fetchAuth,
      extractTextFromContentJson,
      parseMemoryUsedArray: () => [],
      parseHistoryUsedArray: () => [],
      extractCommunityEvidenceUsedV1: () => null,
      loadThreadMessages: loadMessages,
      loadThreads: async () => undefined,
      showMemoryToastMessage: () => undefined,
      setThreadErrorForThread: (_targetThreadKey, value) => {
        setLocalError((previous) =>
          typeof value === "function" ? value(previous) : value,
        );
      },
      setInferenceIssueModal: setInferenceIssue,
      setThreadSendingStateById: setSendingByThread,
      setThreadStreamingStateById: setStreamingByThread,
      setRuntimeEventsByRunId,
    });

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setLocalError(null);
    setIsPreparing(true);
    if (!selectedCustomSlot) {
      setIsPreparing(false);
      return () => undefined;
    }
    void (async () => {
      try {
        const session = await props.ensureSession(
          sessionRef.current,
          "community_funnel_builder_open",
        );
        if (!session || cancelled) return;
        await ensureCloudThreadRecord({
          session,
          thread: {
            threadId: threadKey,
            title: `${props.previewCommunity.name} funnel`,
            modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
            runtimeEngine: "polynet",
            communityId: props.previewCommunity.id,
            contextVersion: 0,
          },
        });
        if (!cancelled) await loadMessages(threadKey, session);
      } catch (error) {
        if (!cancelled) {
          console.warn("community_funnel_builder_open_failed", error);
          setLocalError("The funnel composer could not open.");
        }
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
      stopStreamingTurn(threadKey);
    };
  }, [
    loadMessages,
    props.ensureSession,
    props.previewCommunity.id,
    props.previewCommunity.name,
    sessionIdentity,
    stopStreamingTurn,
    threadKey,
    selectedCustomSlot,
  ]);

  const streamingState = streamingByThread[threadKey] ?? null;
  const runtimeEvents = streamingState?.runtimeEvents ?? [];
  const streamedText = streamingState?.content ?? "";
  const turnIsActive =
    sendingByThread[threadKey] === true || Boolean(streamingState);

  useEffect(() => {
    if (!followStreamingRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isAwaitingStream, messages.length, runtimeEvents.length, streamedText]);

  const handleMessagesScroll = () => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    followStreamingRef.current = distanceFromBottom <= 48;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (
      !text ||
      submitInFlightRef.current
    )
      return;
    submitInFlightRef.current = true;
    followStreamingRef.current = true;
    setIsSubmitting(true);
    setIsAwaitingStream(true);
    setLocalError(null);
    setInferenceIssue(null);
    const messageId = crypto.randomUUID();
    const draftBefore = selectedCustomSlot
      ? readCommunityFunnelDraftAuthoritySnapshot(
          props.communityFunnelConfig,
          selectedCustomSlot,
        )
      : null;
    try {
      const session = await props.ensureSession(
        props.session,
        "community_funnel_builder_send",
      );
      if (!session) throw new Error("auth_session_required");
      await ensureCloudThreadRecord({
        session,
        thread: {
          threadId: threadKey,
          title: `${props.previewCommunity.name} funnel`,
          modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
          runtimeEngine: "polynet",
          communityId: props.previewCommunity.id,
          contextVersion: 0,
        },
      });
      const contentJson = {
        text,
      };
      await createThreadMessage(session, {
        id: messageId,
        threadId: threadKey,
        role: "user",
        content_json: contentJson,
      });
      const optimisticMessage: FunnelBuilderMessage = {
        id: messageId,
        thread_id: threadKey,
        seq: messages.length + 1,
        role: "user",
        content_json: contentJson,
        engine_id: null,
        model_id: null,
        run_id: null,
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimisticMessage]);
      setInput("");
      const result = await runAgentTurn(session, threadKey, {
        preferredModelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
        mode: "respond",
        runIdHint: `community_funnel_builder:${messageId}`,
        userMessageKey: messageId,
        runtimeEngine: "polynet",
        invocationSurface: "community_funnel_builder",
        requestedFundingSource: "platform",
        requestedAgenticTools: true,
        onStreamStart: () => setIsAwaitingStream(false),
        replyToId: messageId,
        messages: [optimisticMessage],
      });
      if (result.error) throw new Error(result.error);
      const nextConfig = await refreshDraft(session);
      if (
        selectedCustomSlot &&
        draftBefore &&
        !communityFunnelDraftAdvanced({
          before: draftBefore,
          after: readCommunityFunnelDraftAuthoritySnapshot(
            nextConfig,
            selectedCustomSlot,
          ),
        })
      ) {
        throw new Error(
          "The composer finished without saving this funnel. Try the revision again.",
        );
      }
      await loadMessages(threadKey, session);
    } catch (error) {
      console.warn("community_funnel_builder_send_failed", error);
      setLocalError(
        error instanceof Error && error.message
          ? error.message
          : "The funnel composer could not complete this turn.",
      );
    } finally {
      submitInFlightRef.current = false;
      setIsAwaitingStream(false);
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (
      !selectedCustomSlot ||
      !content ||
      isPublishing ||
      isPreparing ||
      isSubmitting ||
      sendingByThread[threadKey] === true ||
      Boolean(streamingByThread[threadKey]) ||
      isVslInputDirty ||
      isPublishedCurrentDraft
    ) {
      return;
    }
    setIsPublishing(true);
    setLocalError(null);
    try {
      const session = await props.ensureSession(
        props.session,
        "community_funnel_publish",
      );
      if (!session) throw new Error("auth_session_required");
      const config = await publishCloudCommunityFunnelDraft<
        AuthSession,
        CommunityFunnelManagerConfig
      >({
        session,
        communityId: props.previewCommunity.id,
        slot: selectedCustomSlot,
        expectedDraftRevision: selectedVariant?.draft_revision ?? 0,
      });
      props.hydrateCommunityFunnelEditor(
        normalizeCommunityFunnelManagerConfig(config),
      );
    } catch (error) {
      console.warn("community_funnel_publish_failed", error);
      setLocalError(
        error instanceof Error && error.message
          ? error.message
          : "The funnel could not be published.",
      );
      try {
        const session = await props.ensureSession(
          props.session,
          "community_funnel_publish_refresh",
        );
        if (session) await refreshDraft(session);
      } catch {
        // Preserve the original publication error. The next editor load will
        // reconcile any stale revision.
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveVsl = async (url: string | null) => {
    if (
      !selectedCustomSlot ||
      isSavingVsl ||
      turnIsActive ||
      isPublishing ||
      isActivating
    )
      return;
    let normalizedUrl: string | null = null;
    try {
      normalizedUrl = normalizeCommunityFunnelVslUrl(url);
    } catch {
      setVslError("Use a YouTube, Vimeo, Loom, or Wistia video link.");
      return;
    }
    setIsSavingVsl(true);
    setVslError(null);
    try {
      const session = await props.ensureSession(
        props.session,
        "community_funnel_vsl_save",
      );
      if (!session) throw new Error("auth_session_required");
      const config = await setCloudCommunityFunnelDraftVsl<
        AuthSession,
        CommunityFunnelManagerConfig
      >({
        session,
        communityId: props.previewCommunity.id,
        slot: selectedCustomSlot,
        expectedDraftRevision: selectedVariant?.draft_revision ?? 0,
        url: normalizedUrl,
      });
      const normalizedConfig = normalizeCommunityFunnelManagerConfig(config);
      props.hydrateCommunityFunnelEditor(normalizedConfig);
      setVslInput(
        normalizedConfig.custom_funnels[selectedCustomSlot]?.draft_vsl_url ?? "",
      );
    } catch (error) {
      console.warn("community_funnel_vsl_save_failed", error);
      setVslError(formatVslSaveError(error));
      try {
        const session = await props.ensureSession(
          props.session,
          "community_funnel_vsl_refresh",
        );
        if (session) await refreshDraft(session);
      } catch {
        // Preserve the save error; the next editor load reconciles the draft.
      }
    } finally {
      setIsSavingVsl(false);
    }
  };

  const handleSetLiveSlot = async (slot: CommunityFunnelSlot) => {
    if (
      isActivating ||
      isPublishing ||
      isSavingVsl ||
      turnIsActive ||
      selectedSlotIsLive ||
      (slot !== "default" && (isVslInputDirty || !isPublishedCurrentDraft))
    )
      return;
    setIsActivating(true);
    setLocalError(null);
    try {
      const session = await props.ensureSession(
        props.session,
        `community_funnel_activate_${slot}`,
      );
      if (!session) throw new Error("auth_session_required");
      const config = await setCloudActiveCommunityFunnel<
        AuthSession,
        CommunityFunnelManagerConfig
      >({
        session,
        communityId: props.previewCommunity.id,
        target: slot === "default"
          ? { slot: "default" }
          : {
              slot,
              expectedPublishedDraftRevision:
                selectedVariant?.published_draft_revision ?? 0,
            },
      });
      props.hydrateCommunityFunnelEditor(
        normalizeCommunityFunnelManagerConfig(config),
      );
    } catch (error) {
      console.warn("community_funnel_activation_failed", error);
      setLocalError(formatActivationError(error));
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (message.includes("community_funnel_activation_conflict")) {
        try {
          const session = await props.ensureSession(
            props.session,
            `community_funnel_activation_${slot}_conflict_refresh`,
          );
          if (session) await refreshDraft(session);
        } catch {
          // Preserve the activation conflict. The next editor load will
          // reconcile the published revision.
        }
      }
    } finally {
      setIsActivating(false);
    }
  };

  const isBusy =
    isPreparing ||
    isSubmitting ||
    isPublishing ||
    isActivating ||
    isSavingVsl ||
    turnIsActive;
  const visibleMessages = messages.filter(
    (message) => message.role !== "system",
  );
  const shouldShowPublish =
    Boolean(selectedCustomSlot) &&
    Boolean(content) &&
    !isPublishedCurrentDraft;
  const shouldShowActivate =
    !selectedSlotIsLive &&
    (selectedSlot === "default" || isPublishedCurrentDraft);

  const funnelTabs = useMemo(() => [
    {
      id: "default" as const,
      label: `Default${props.communityFunnelConfig.active_slot === "default" ? " · Live" : ""}`,
    },
    {
      id: "custom_1" as const,
      label: `Funnel 1${props.communityFunnelConfig.active_slot === "custom_1" ? " · Live" : ""}`,
    },
    {
      id: "custom_2" as const,
      label: `Funnel 2${props.communityFunnelConfig.active_slot === "custom_2" ? " · Live" : ""}`,
    },
  ], [props.communityFunnelConfig.active_slot]);
  const funnelSwitcherStyle = useMemo(
    () => buildPlatformSwitcherStyle(
      funnelTabs.length,
      Math.max(0, funnelTabs.findIndex((tab) => tab.id === selectedSlot)),
    ),
    [funnelTabs, selectedSlot],
  );
  return (
    <section className="funnel-builder" aria-labelledby="funnel-builder-title">
      <header className="funnel-builder-toolbar">
        <WebPlatformTabList
          tabs={funnelTabs}
          activeTab={selectedSlot}
          onSelectTab={(slot) => setSelectedSlot(slot)}
          ariaLabel="Community funnels"
          idPrefix="community-funnel"
          className="platform-switcher funnel-builder-slot-switcher"
          style={funnelSwitcherStyle}
        />
        <div className="funnel-builder-header-actions">
          <button
            type="button"
            onClick={() => props.handlePreviewCommunityFunnel(selectedSlot)}
            disabled={isBusy || (selectedSlot !== "default" && !content)}
          >
            Open full preview
          </button>
          {shouldShowPublish ? (
            <button
              type="button"
              className="is-primary"
              onClick={() => void handlePublish()}
              disabled={
                !content ||
                isBusy ||
                isVslInputDirty ||
                isPublishedCurrentDraft
              }
              title={
                isVslInputDirty
                  ? "Save the Video Sales Letter before publishing."
                  : "Publish the current draft"
              }
            >
              {isPublishing ? "Saving…" : "Save funnel"}
            </button>
          ) : null}
          {shouldShowActivate ? (
            <button
              type="button"
              className="is-primary"
              onClick={() => void handleSetLiveSlot(selectedSlot)}
              disabled={
                isBusy ||
                isVslInputDirty ||
                !isPublishedCurrentDraft
              }
              title={
                isVslInputDirty
                  ? "Save the Video Sales Letter before making this funnel live."
                  : !isPublishedCurrentDraft
                    ? "Publish the current draft before making it live."
                    : "Make this funnel live"
              }
            >
              {isActivating ? "Making live…" : "Make live"}
            </button>
          ) : null}
          {selectedSlotIsLive ? <span className="funnel-builder-live-status">Live</span> : null}
        </div>
      </header>
      <div className="funnel-builder-context">
        <div className="settings-section-title" id="funnel-builder-title">
          {selectedSlot === "default" ? "Default funnel" : `Funnel ${selectedSlot === "custom_1" ? "1" : "2"}`}
        </div>
        <p>
          {selectedSlot === "default"
            ? "Built automatically from your community profile. Always available."
            : "Describe what you want. Changes stay private until you save them."}
        </p>
      </div>
      <div
        className={`funnel-builder-layout ${selectedSlot === "default" ? "is-default" : "is-custom"}`}
      >
        <div
          className={`funnel-builder-preview${selectedSlot === "default" || content ? "" : " is-empty"}`}
          aria-label={selectedSlot === "default" ? "Default funnel preview" : "Custom funnel preview"}
        >
          {selectedSlot === "default" || content ? (
            <WebCommunityFunnelRenderer
              communityId={hydratedPreviewCommunity.id}
              communityName={hydratedPreviewCommunity.name}
              avatarUrl={hydratedPreviewCommunity.avatar_url ?? null}
              avatarFocusX={hydratedPreviewCommunity.avatar_focus_x ?? null}
              avatarFocusY={hydratedPreviewCommunity.avatar_focus_y ?? null}
              avatarZoom={hydratedPreviewCommunity.avatar_zoom ?? null}
              memberCount={hydratedPreviewCommunity.member_count ?? null}
              memberFaces={hydratedPreviewCommunity.member_faces_preview ?? []}
              renderModel={previewRenderModel}
              action={previewAction}
            />
          ) : (
            <div className="funnel-builder-preview-empty">
              <strong>Nothing to preview yet.</strong>
              <span>Prompt the agent to build your funnel.</span>
            </div>
          )}
        </div>

          {selectedCustomSlot ? <aside
            className="funnel-builder-conversation"
            aria-label="Funnel composer conversation"
          >
            <header className="funnel-builder-conversation-header">
              <div>
                <Sparkles aria-hidden="true" />
                <span>AI builder</span>
              </div>
              <small>Funnel {selectedCustomSlot === "custom_1" ? "1" : "2"}</small>
            </header>
            <div
              className="funnel-builder-messages"
              ref={messagesRef}
              onScroll={handleMessagesScroll}
            >
              {isPreparing ? (
                <div className="funnel-builder-empty">
                  <LoaderCircle className="is-spinning" />
                  Opening composer…
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="funnel-builder-empty">
                  <Sparkles aria-hidden="true" />
                  <strong>Build from a conversation.</strong>
                  <span>
                    Tell the agent who this community is for, the
                    audience, transformation, offer, proof, and desired tone.
                  </span>
                </div>
              ) : (
                visibleMessages.map((message) => (
                  <article
                    key={message.id}
                    className={`funnel-builder-message is-${message.role}`}
                  >
                    <span>{message.role === "user" ? "You" : "Composer"}</span>
                    {message.role === "assistant" ? (
                      <div className="funnel-builder-message-content message-text">
                        {renderMarkdown(
                          extractTextFromContentJson(message.content_json),
                        )}
                      </div>
                    ) : (
                      <p>{extractTextFromContentJson(message.content_json)}</p>
                    )}
                  </article>
                ))
              )}
              <WebAgentLiveTurn
                events={runtimeEvents}
                streamedText={streamedText}
                isActive={turnIsActive || isAwaitingStream}
                session={props.session}
                renderMarkdown={renderMarkdown}
                fallbackLabel="Understanding your direction"
                variant="funnel"
              />
            </div>

            <form
              className="funnel-builder-vsl"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveVsl(vslInput);
              }}
            >
              <label htmlFor="community-funnel-vsl-url">
                <span>Video Sales Letter</span>
                <small>YouTube, Vimeo, Loom, or Wistia</small>
              </label>
              <div className="funnel-builder-vsl-control">
                <Link2 aria-hidden="true" />
                <input
                  id="community-funnel-vsl-url"
                  type="url"
                  inputMode="url"
                  value={vslInput}
                  maxLength={2_000}
                  placeholder="Paste the VSL link…"
                  onChange={(event) => {
                    setVslInput(event.target.value);
                    setVslError(null);
                  }}
                  disabled={isBusy}
                />
                <button
                  type="submit"
                  disabled={isBusy || !vslInput.trim() || !isVslInputDirty}
                >
                  {isSavingVsl ? "Saving…" : savedVslUrl ? "Replace" : "Save"}
                </button>
                {savedVslUrl ? (
                  <button
                    type="button"
                    className="funnel-builder-vsl-remove"
                    onClick={() => void handleSaveVsl(null)}
                    aria-label="Remove Video Sales Letter"
                    title="Remove Video Sales Letter"
                    disabled={isBusy}
                  >
                    <X aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {vslError ? (
                <span className="funnel-builder-vsl-error">{vslError}</span>
              ) : isVslInputDirty ? (
                <span className="funnel-builder-vsl-status">
                  Save to update this private draft.
                </span>
              ) : savedVslUrl ? (
                <span className="funnel-builder-vsl-status">
                  Saved to this private draft.
                </span>
              ) : null}
            </form>
            {localError || inferenceIssue ? (
              <div className="auth-error">
                {localError ?? formatInferenceIssue(inferenceIssue)}
              </div>
            ) : null}
            <form className="funnel-builder-composer" onSubmit={handleSubmit}>
              <textarea
                rows={2}
                value={input}
                maxLength={4_000}
                aria-label="Describe the funnel or ask for a revision"
                placeholder="Describe the funnel or ask for a revision…"
                onChange={(event) => setInput(event.target.value)}
                disabled={isBusy}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {runtimeEvents.length > 0 ? (
                <button
                  type="button"
                  className="funnel-builder-send"
                  onClick={() => stopStreamingTurn(threadKey)}
                  aria-label="Stop"
                  title="Stop"
                >
                  <Square aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="funnel-builder-send"
                  aria-label="Send"
                  disabled={isBusy || !input.trim()}
                >
                  {isBusy ? <LoaderCircle className="is-spinning" /> : <Send />}
                </button>
              )}
            </form>
          </aside> : null}
      </div>
    </section>
  );
}
