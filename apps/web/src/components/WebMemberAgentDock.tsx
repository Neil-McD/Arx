import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { getAuthUrl, type AuthSession } from "../auth";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { extractTextFromContentJson } from "../../../../shared/communityMessageParsing";
import {
  ensureCloudMemberAgentGlobalChannel,
  startNewCloudMemberAgentGlobalEpisode,
  type CloudMemberAgentChannel,
} from "../../../../shared/cloudMemberAgentGateway";
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
import {
  describeMemberAgentSurface,
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
import { useWebCommunityOnboarding } from "./WebCommunityOnboardingController";
import "./WebMemberAgentDock.css";

type MemberAgentMessage = Omit<CloudMessageTransportRow, "role"> & {
  role: "user" | "assistant" | "system";
};

type AgentScope = {
  userId: string | null;
  generation: number;
};

type ActiveThreadContext = {
  communityId: string | null;
  contextVersion: number;
};

type WebMemberAgentDockProps = {
  isVisible: boolean;
  mobileShellActive?: boolean;
  onRequestOpen?: () => void;
  mobileRoot?: boolean;
  communityId: string | null;
  communityName: string | null;
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
};

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
    return "Connect or reconnect ChatGPT or your OpenAI account, then try again.";
  }
  return issue.message?.trim() || "Your agent could not complete this turn. Try again.";
}

export function WebMemberAgentDock(props: WebMemberAgentDockProps) {
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
  const [isPreparing, setIsPreparing] = useState(false);
  const [isStartingNewChat, setIsStartingNewChat] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inferenceIssue, setInferenceIssue] = useState<InferenceIssueModalState | null>(null);
  const [sendingByThread, setSendingByThread] = useState<Record<string, boolean>>({});
  const [streamingByThread, setStreamingByThread] = useState<
    Record<string, ThreadStreamingState<never, never, never>>
  >({});
  const [, setRuntimeEventsByRunId] = useState<Record<string, ThreadStreamingRuntimeEvent[]>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const onboardingOpenedSessionIdsRef = useRef(new Set<string>());
  const onboardingFocusSessionIdRef = useRef<string | null>(null);
  const retryRef = useRef<{ text: string; messageId: string } | null>(null);
  const activeThreadKeyRef = useRef<string | null>(null);
  const activeThreadContextRef = useRef<ActiveThreadContext | null>(null);
  const agentScopeRef = useRef<AgentScope>({
    userId: props.session?.user.id ?? null,
    generation: 0,
  });
  const scopeUserId = props.session?.user.id ?? null;
  const surfaceKind = props.surfaceContext?.kind ?? null;
  const onboardingSession = onboarding?.activeSession ?? null;
  const isConversationSurfaceActive = isOpenSurface;
  if (agentScopeRef.current.userId !== scopeUserId) {
    agentScopeRef.current = {
      userId: scopeUserId,
      generation: agentScopeRef.current.generation + 1,
    };
  }

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
      await loadMessages(targetThreadKey, session);
    },
    loadThreads: async () => undefined,
    showMemoryToastMessage: () => undefined,
    setThreadErrorForThread: setThreadError,
    setInferenceIssueModal: setInferenceIssueForActiveThread,
    setThreadSendingStateById: setSendingByThread,
    setThreadStreamingStateById: setStreamingByThread,
    setRuntimeEventsByRunId,
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
    setInput("");
    setLocalError(null);
    setInferenceIssue(null);
    retryRef.current = null;
  }, [props.session?.user.id, stopStreamingTurn]);

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
          initialCommunityId: props.communityId,
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
    props.communityId,
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
  const visibleMessages = messages.filter((message) => message.role !== "system");
  const dockError = localError ?? formatInferenceIssue(inferenceIssue);
  const showOnboardingAgentFocus = Boolean(
    props.communityId &&
    props.communityName &&
    onboardingSession?.community_id === props.communityId &&
    !onboarding?.firstPostAcknowledgementPending &&
    (
      shouldPresentCommunityOnboardingAgentStep(onboardingSession) ||
      shouldPresentCommunityOnboardingAgentReview(onboardingSession)
    ),
  );
  const onboardingDescriptionId = "community-onboarding-agent-description";

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
    setInput("");
    setSendingByThread({});
    setStreamingByThread({});
    retryRef.current = null;
  }, [observeThreadContext]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, messages.length, runtimeEvents.length, streamedText]);

  const startNewChat = async () => {
    if (
      turnIsActive ||
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
        initialCommunityId: props.communityId,
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
            initialCommunityId: props.communityId,
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (
      !text ||
      turnIsActive ||
      isPreparing ||
      isStartingNewChat ||
      !props.surfaceContext ||
      !props.session
    ) {
      return;
    }
    setLocalError(null);
    setInferenceIssue(null);
    setInput("");
    const retry = retryRef.current;
    const messageId = retry?.text === text ? retry.messageId : crypto.randomUUID();
    const scope = agentScopeRef.current;
    const desiredCommunityId =
      props.surfaceContext.kind === "community" ? props.communityId : null;
    if (props.surfaceContext.kind === "community" && !desiredCommunityId) {
      setInput(text);
      setLocalError("This community context is still loading. Try again.");
      return;
    }
    let targetThreadKey: string | null = null;
    try {
      const usableSession = await props.ensureSession(
        props.session,
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
      setSendingByThread((previous) => ({ ...previous, [thread.thread_key]: true }));
      await createThreadMessage(usableSession, {
        id: messageId,
        threadId: thread.thread_key,
        role: "user",
        content_json: { text },
      });
      if (!isCurrentScope(scope)) return;
      const optimisticMessage: MemberAgentMessage = {
        id: messageId,
        thread_id: thread.thread_key,
        seq: activeMessages.length + 1,
        role: "user",
        content_json: { text },
        engine_id: null,
        model_id: null,
        run_id: null,
        created_at: new Date().toISOString(),
      };
      const optimisticMessages = activeMessages.some((message) => message.id === messageId)
        ? activeMessages
        : [...activeMessages, optimisticMessage];
      setMessages(optimisticMessages);
      retryRef.current = null;
      const result = await runAgentTurn(usableSession, thread.thread_key, {
        preferredModelId: thread.model_id || DEFAULT_ACTIVE_MODEL_ID,
        mode: "respond",
        runIdHint: `member_agent_dock:${messageId}`,
        userMessageKey: messageId,
        runtimeEngine: "polynet",
        invocationSurface: "member_agent_dock",
        surfaceContext: props.surfaceContext,
        suppressOnboardingProgress: onboarding?.mode === "preview",
        requestedFundingSource: "auto",
        requestedAgenticTools: true,
        replyToId: messageId,
        messages: [optimisticMessage],
      });
      if (result.error) throw new Error(result.error);
      if (!isCurrentScope(scope)) return;
      await loadMessages(thread.thread_key, usableSession);
      if (onboarding?.mode === "preview") onboarding.completeAgentTurnPreview();
    } catch (error) {
      if (!isCurrentScope(scope)) return;
      console.warn("member_agent_dock_send_failed", error);
      setInput(text);
      retryRef.current = { text, messageId };
      setLocalError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Your message was not sent. Try again.",
      );
    } finally {
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

  const surfaceLabel = describeMemberAgentSurface(
    props.surfaceContext,
    props.communityName,
  );

  const shouldRenderStreamedText =
    Boolean(streamedText) && !hasSequencedAssistantText(runtimeEvents);

  return (
    <>
    <aside
      id="polynet-member-agent-surface"
      className={`member-agent-dock${isOpenSurface ? " is-open" : ""}${props.mobileRoot ? " mobile-root" : ""}${showOnboardingAgentFocus ? " is-onboarding" : ""}`}
      aria-live="polite"
    >
      {!props.mobileShellActive ? (
        <button
          type="button"
          className={`member-agent-dock-launcher${turnIsActive ? " is-working" : ""}${showOnboardingAgentFocus ? " is-onboarding" : ""}`}
          onClick={() => setIsOpen((open) => !open)}
          aria-label={isOpen ? "Close your agent" : "Open your agent"}
          title={isOpen ? "Close your agent" : "Open your agent"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        </button>
      ) : null}

      <section className="member-agent-dock-panel" aria-label="Your Polynet agent">
        <header className="member-agent-dock-header">
          <div className="member-agent-dock-identity">
            <span className="member-agent-dock-avatar" aria-hidden="true">
              <Sparkles />
            </span>
            <span>
              <strong>Your agent</strong>
              <small>
                {turnIsActive
                    ? "Working"
                    : `${surfaceLabel} context`}
              </small>
            </span>
          </div>
          <div className="member-agent-dock-header-actions">
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={
                turnIsActive ||
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
                aria-label="Close"
                title="Close"
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

        <div className="member-agent-dock-transcript" ref={scrollRef}>
          {visibleMessages.length === 0 && !turnIsActive && !isPreparing && !isStartingNewChat ? (
            <div className="member-agent-dock-empty">
              <MessageCircle aria-hidden="true" />
              <p>
                {props.surfaceContext.kind === "discover"
                  ? "Ask your agent to help you explore communities."
                  : `Ask your agent about ${surfaceLabel}.`}
              </p>
            </div>
          ) : null}

          {visibleMessages.map((message) => (
            <article
              key={message.id}
              className={`member-agent-dock-message is-${message.role}`}
            >
              {message.role === "assistant"
                ? renderMarkdown(extractTextFromContentJson(message.content_json))
                : <p>{extractTextFromContentJson(message.content_json)}</p>}
            </article>
          ))}

          {isPreparing ? (
            <div className="member-agent-dock-reasoning">
              <LoaderCircle aria-hidden="true" />
              <span>Opening your agent</span>
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
                  <span>Getting oriented in {surfaceLabel}</span>
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

        <div className="member-agent-dock-composer-stack">
          <form
            className={`member-agent-dock-composer${showOnboardingAgentFocus ? " is-onboarding" : ""}`}
            onSubmit={submit}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Message your agent in ${surfaceLabel}`}
              aria-label="Message your agent"
              aria-describedby={showOnboardingAgentFocus ? onboardingDescriptionId : undefined}
              rows={1}
              maxLength={8000}
              disabled={turnIsActive || isPreparing || isStartingNewChat}
            />
            {turnIsActive && threadKey ? (
              <button
                type="button"
                onClick={() => stopStreamingTurn(threadKey)}
                aria-label="Stop"
                title="Stop"
              >
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || isPreparing || isStartingNewChat}
                aria-label="Send"
                title="Send"
              >
                <Send aria-hidden="true" />
              </button>
            )}
          </form>
        </div>
      </section>
    </aside>
    </>
  );
}
