import { ImagePlus, LoaderCircle, Send, Sparkles, X } from "lucide-react";
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
  buildDefaultCommunityFunnelDocumentV1,
  normalizeCommunityFunnelManagerConfig,
} from "../../../../shared/communityFunnel";
import { fetchCloudCommunityFunnelConfig } from "../../../../shared/cloudCommunityFunnelGateway";
import {
  ensureCloudThreadRecord,
  uploadCloudThreadAttachmentFile,
} from "../../../../shared/cloudThreadsGateway";
import {
  listConvexCloudNewestThreadMessagesByThreadKey,
  type CloudMessageTransportRow,
} from "../../../../shared/cloudThreadsRead";
import { DEFAULT_ACTIVE_MODEL_ID } from "../../../../shared/modelCatalog";
import { buildCommunityFunnelThreadKey } from "../../../../shared/runtimeInvocationSurface";
import type { CommunityFunnelManagerConfig } from "../../../../shared/communityTypes";
import { useWebTurnRunnerController } from "../../../../shared/useWebTurnRunnerController";
import type {
  InferenceIssueModalState,
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../../shared/webTurnRunnerCore";
import { CommunityFunnelV1Preview } from "./CommunityFunnelV1Preview";

type PreviewCommunityLike = {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
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
  funnelOneLiner: string;
  funnelAbout: string;
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

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const threadKey = useMemo(
    () => buildCommunityFunnelThreadKey(props.previewCommunity.id),
    [props.previewCommunity.id],
  );
  const [messages, setMessages] = useState<FunnelBuilderMessage[]>([]);
  const [input, setInput] = useState("");
  const [referenceImage, setReferenceImage] =
    useState<ReferenceImageDraft | null>(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const sessionRef = useRef(props.session);
  const activeThreadKeyRef = useRef(threadKey);
  const activeCommunityIdRef = useRef(props.previewCommunity.id);
  const submitInFlightRef = useRef(false);
  sessionRef.current = props.session;
  activeThreadKeyRef.current = threadKey;
  activeCommunityIdRef.current = props.previewCommunity.id;
  const sessionIdentity = resolveAuthPresentationIdentity(props.session);

  const document = useMemo(
    () =>
      props.communityFunnelConfig.draft_document_v1 ??
      buildDefaultCommunityFunnelDocumentV1({
        communityName: props.previewCommunity.name,
        oneLiner: props.funnelOneLiner,
        about: props.funnelAbout,
        heroMediaUrl: props.communityFunnelConfig.hero_media_url,
      }),
    [
      props.communityFunnelConfig.draft_document_v1,
      props.communityFunnelConfig.hero_media_url,
      props.funnelAbout,
      props.funnelOneLiner,
      props.previewCommunity.name,
    ],
  );

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
    setIsSubmitting(true);
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
        const storageId = await uploadCloudThreadAttachmentFile({
          session,
          threadId: threadKey,
          file: referenceImage.file,
        });
        storedAttachment = {
          id: crypto.randomUUID(),
          name: referenceImage.file.name,
          type: "image",
          mime: referenceImage.file.type,
          size: referenceImage.file.size,
          storage_id: storageId,
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
      setIsSubmitting(false);
    }
  };

  const streamingState = streamingByThread[threadKey] ?? null;
  const isBusy =
    isPreparing ||
    isSubmitting ||
    sendingByThread[threadKey] === true ||
    Boolean(streamingState);
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
        <button type="button" onClick={props.handlePreviewCommunityFunnel}>
          Open full preview
        </button>
      </header>

      <div className="funnel-builder-layout">
        <div
          className="funnel-builder-preview"
          aria-label="Funnel draft preview"
        >
          <CommunityFunnelV1Preview
            community={props.previewCommunity}
            document={document}
            primaryActionLabel={`Join ${props.previewCommunity.name}`}
          />
        </div>

        <aside
          className="funnel-builder-conversation"
          aria-label="Funnel composer conversation"
        >
          <div className="funnel-builder-messages" aria-live="polite">
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
                  <p>{extractTextFromContentJson(message.content_json)}</p>
                </article>
              ))
            )}
            {streamingState?.content ? (
              <article className="funnel-builder-message is-assistant is-streaming">
                <span>Composer</span>
                <p>{streamingState.content}</p>
              </article>
            ) : null}
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
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              className="funnel-builder-send"
              aria-label="Send"
              disabled={isBusy || (!input.trim() && !referenceImage)}
            >
              {isBusy ? <LoaderCircle className="is-spinning" /> : <Send />}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}
