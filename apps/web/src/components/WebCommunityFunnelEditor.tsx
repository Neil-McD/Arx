import {
  ImagePlus,
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
  type ChangeEvent,
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
  setCloudCommunityFunnelDraftVsl,
} from "../../../../shared/cloudCommunityFunnelGateway";
import { fetchCloudPublicFunnelStats } from "../../../../shared/cloudPublicFunnelGateway";
import {
  ensureCloudThreadRecord,
  uploadCloudMemberAgentImageFile,
} from "../../../../shared/cloudThreadsGateway";
import {
  listConvexCloudNewestThreadMessagesByThreadKey,
  type CloudMessageTransportRow,
} from "../../../../shared/cloudThreadsRead";
import { DEFAULT_ACTIVE_MODEL_ID } from "../../../../shared/modelCatalog";
import { buildCommunityFunnelThreadKey } from "../../../../shared/runtimeInvocationSurface";
import type {
  CommunityFunnelManagerConfig,
  CommunityMemberProof,
  CommunityPublicFace,
} from "../../../../shared/communityTypes";
import { useWebTurnRunnerController } from "../../../../shared/useWebTurnRunnerController";
import { renderMarkdown } from "../../../../shared/markdownUi";
import type {
  InferenceIssueModalState,
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../../shared/webTurnRunnerCore";
import { CommunityFunnelV1Preview } from "./CommunityFunnelV1Preview";
import { WebAgentLiveTurn } from "./WebAgentLiveTurn";

type PreviewCommunityLike = {
  id: string;
  slug?: string | null;
  name: string;
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

type ReferenceImageDraft = {
  file: File;
  previewUrl: string;
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
  handlePreviewCommunityFunnel: () => void;
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
    return "Only community managers can change the intro video.";
  }
  return "The intro video could not be saved.";
}

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const threadKey = useMemo(
    () => buildCommunityFunnelThreadKey(props.previewCommunity.id),
    [props.previewCommunity.id],
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
      member_faces_preview:
        props.previewCommunity.member_faces_preview ?? null,
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
          member_faces_preview:
            payload.community.member_faces_preview ?? null,
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
  const [referenceImage, setReferenceImage] =
    useState<ReferenceImageDraft | null>(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingStream, setIsAwaitingStream] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingVsl, setIsSavingVsl] = useState(false);
  const [vslInput, setVslInput] = useState(
    props.communityFunnelConfig.draft_vsl_url ?? "",
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const document = props.communityFunnelConfig.draft_document_v1;
  const savedVslUrl = props.communityFunnelConfig.draft_vsl_url;
  const isVslInputDirty = vslInput.trim() !== (savedVslUrl ?? "");
  const isPublishedCurrentDraft =
    Boolean(document) &&
    Boolean(props.communityFunnelConfig.published_document_v1) &&
    props.communityFunnelConfig.draft_revision > 0 &&
    props.communityFunnelConfig.published_draft_revision ===
      props.communityFunnelConfig.draft_revision;

  useEffect(() => {
    setVslInput(props.communityFunnelConfig.draft_vsl_url ?? "");
  }, [props.communityFunnelConfig.draft_vsl_url, props.previewCommunity.id]);

  useEffect(() => {
    setVslError(null);
  }, [props.previewCommunity.id]);

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
      if (activeCommunityIdRef.current === props.previewCommunity.id) {
        props.hydrateCommunityFunnelEditor(
          normalizeCommunityFunnelManagerConfig(config),
        );
      }
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
              model_id: DEFAULT_ACTIVE_MODEL_ID,
              runtime_engine: "polynet",
              project_id: null,
              community_id: props.previewCommunity.id,
              context_version: 0,
            }
          : null,
      fetchCloudPublic: props.fetchPublic,
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
    setIsPreparing(true);
    setMessages([]);
    setLocalError(null);
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
            modelId: DEFAULT_ACTIVE_MODEL_ID,
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
  ]);

  useEffect(() => {
    return () => {
      if (referenceImage) URL.revokeObjectURL(referenceImage.previewUrl);
    };
  }, [referenceImage]);

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

  const selectReferenceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    const allowedImageTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    if (!allowedImageTypes.has(file.type) || file.size > 10 * 1024 * 1024) {
      setLocalError("Use one PNG, JPEG, or WebP reference image under 10 MB.");
      return;
    }
    setReferenceImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
    setLocalError(null);
  };

  const removeReferenceImage = () => {
    setReferenceImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if ((!text && !referenceImage) || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    followStreamingRef.current = true;
    setIsSubmitting(true);
    setIsAwaitingStream(true);
    setLocalError(null);
    setInferenceIssue(null);
    const messageId = crypto.randomUUID();
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
          modelId: DEFAULT_ACTIVE_MODEL_ID,
          runtimeEngine: "polynet",
          communityId: props.previewCommunity.id,
          contextVersion: 0,
        },
      });
      let storedAttachment: Record<string, unknown> | null = null;
      if (referenceImage) {
        const claimedAttachment = await uploadCloudMemberAgentImageFile({
          session,
          threadId: threadKey,
          messageId,
          file: referenceImage.file,
        });
        storedAttachment = {
          id: crypto.randomUUID(),
          name: claimedAttachment.name,
          type: "image",
          mime: claimedAttachment.mime,
          size: claimedAttachment.size,
          storage_id: claimedAttachment.storage_id,
        };
      }
      const contentJson = {
        text:
          text ||
          "Use this reference image as visual inspiration and revise the funnel draft.",
        ...(storedAttachment ? { attachments: [storedAttachment] } : null),
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
      removeReferenceImage();
      const result = await runAgentTurn(session, threadKey, {
        preferredModelId: DEFAULT_ACTIVE_MODEL_ID,
        mode: "respond",
        runIdHint: `community_funnel_builder:${messageId}`,
        userMessageKey: messageId,
        runtimeEngine: "polynet",
        invocationSurface: "community_funnel_builder",
        requestedFundingSource: "platform",
        requestedAgenticTools: true,
        suppressOnboardingProgress: true,
        onStreamStart: () => setIsAwaitingStream(false),
        replyToId: messageId,
        messages: [optimisticMessage],
      });
      if (result.error) throw new Error(result.error);
      await Promise.all([
        loadMessages(threadKey, session),
        refreshDraft(session),
      ]);
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
      !document ||
      isPublishing ||
      isPreparing ||
      isSubmitting ||
      sendingByThread[threadKey] === true ||
      Boolean(streamingByThread[threadKey]) ||
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
        expectedDraftRevision: props.communityFunnelConfig.draft_revision,
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
    if (isSavingVsl || turnIsActive || isPublishing) return;
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
        expectedDraftRevision: props.communityFunnelConfig.draft_revision,
        url: normalizedUrl,
      });
      const normalizedConfig = normalizeCommunityFunnelManagerConfig(config);
      props.hydrateCommunityFunnelEditor(normalizedConfig);
      setVslInput(normalizedConfig.draft_vsl_url ?? "");
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

  const isBusy =
    isPreparing ||
    isSubmitting ||
    isPublishing ||
    isSavingVsl ||
    turnIsActive;
  const visibleMessages = messages.filter(
    (message) => message.role !== "system",
  );

  return (
    <section className="funnel-builder" aria-labelledby="funnel-builder-title">
      <header className="funnel-builder-header">
        <div>
          <div className="settings-section-title" id="funnel-builder-title">
            Funnel composer
          </div>
          <p>
            Describe the page you want. The agent can revise this private draft,
            never the live funnel.
          </p>
        </div>
        <div className="funnel-builder-header-actions">
          <button
            type="button"
            onClick={props.handlePreviewCommunityFunnel}
            disabled={!document}
          >
            Open full preview
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => void handlePublish()}
            disabled={!document || isBusy || isPublishedCurrentDraft}
          >
            {isPublishing
              ? "Publishing…"
              : isPublishedCurrentDraft
                ? "Published"
                : "Publish funnel"}
          </button>
        </div>
      </header>

      <div className="funnel-builder-layout">
        <div
          className={`funnel-builder-preview${document ? "" : " is-empty"}`}
          aria-label="Funnel draft preview"
        >
          {document ? (
            <CommunityFunnelV1Preview
              community={hydratedPreviewCommunity}
              document={document}
              vslUrl={savedVslUrl}
              primaryActionLabel={props.previewPrimaryActionLabel}
            />
          ) : (
            <div className="funnel-builder-preview-empty">
              <strong>Nothing to preview yet.</strong>
              <span>Prompt the agent to build your funnel.</span>
            </div>
          )}
        </div>

        <aside
          className="funnel-builder-conversation"
          aria-label="Funnel composer conversation"
        >
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
                  Tell the agent who this community is for, the transformation,
                  offer, proof, and desired visual mood.
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

          {referenceImage ? (
            <div className="funnel-builder-reference">
              <img src={referenceImage.previewUrl} alt="Reference preview" />
              <span>{referenceImage.file.name}</span>
              <button
                type="button"
                onClick={removeReferenceImage}
                aria-label="Remove reference image"
              >
                <X />
              </button>
            </div>
          ) : null}
          <form
            className="funnel-builder-vsl"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveVsl(vslInput);
            }}
          >
            <label htmlFor="community-funnel-vsl-url">
              <span>Intro video</span>
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
                disabled={
                  isBusy ||
                  !vslInput.trim() ||
                  !isVslInputDirty
                }
              >
                {isSavingVsl
                  ? "Saving…"
                  : savedVslUrl
                    ? "Replace"
                    : "Save"}
              </button>
              {savedVslUrl ? (
                <button
                  type="button"
                  className="funnel-builder-vsl-remove"
                  onClick={() => void handleSaveVsl(null)}
                  aria-label="Remove intro video"
                  title="Remove intro video"
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={selectReferenceImage}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add reference image"
              title="Add reference image"
              disabled={isBusy}
            >
              <ImagePlus aria-hidden="true" />
            </button>
            <textarea
              rows={3}
              value={input}
              maxLength={4_000}
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
            {turnIsActive ? (
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
                disabled={isBusy || (!input.trim() && !referenceImage)}
              >
                {isBusy ? <LoaderCircle className="is-spinning" /> : <Send />}
              </button>
            )}
          </form>
        </aside>
      </div>
    </section>
  );
}
