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
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { getAuthUrl, type AuthSession } from "../auth";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { extractTextFromContentJson } from "../../../../shared/communityMessageParsing";
import { ensureCloudMemberAgentCommunityThread } from "../../../../shared/cloudMemberAgentGateway";
import {
  listConvexCloudNewestThreadMessagesByThreadKey,
  type CloudMessageTransportRow,
} from "../../../../shared/cloudThreadsRead";
import { DEFAULT_ACTIVE_MODEL_ID } from "../../../../shared/modelCatalog";
import { useWebTurnRunnerController } from "../../../../shared/useWebTurnRunnerController";
import type {
  InferenceIssueModalState,
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../../shared/webTurnRunnerCore";
import { RuntimeLiveTimeline } from "./RuntimeLiveTimeline";
import "./WebMemberAgentDock.css";

type MemberAgentMessage = Omit<CloudMessageTransportRow, "role"> & {
  role: "user" | "assistant" | "system";
};

type CommunityScope = {
  communityId: string | null;
  userId: string | null;
  generation: number;
};

type WebMemberAgentDockProps = {
  isVisible: boolean;
  communityId: string | null;
  communityName: string;
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
  const [isOpen, setIsOpen] = useState(false);
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<MemberAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inferenceIssue, setInferenceIssue] = useState<InferenceIssueModalState | null>(null);
  const [sendingByThread, setSendingByThread] = useState<Record<string, boolean>>({});
  const [streamingByThread, setStreamingByThread] = useState<
    Record<string, ThreadStreamingState<never, never, never>>
  >({});
  const [, setRuntimeEventsByRunId] = useState<Record<string, ThreadStreamingRuntimeEvent[]>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef<{ text: string; messageId: string } | null>(null);
  const activeThreadKeyRef = useRef<string | null>(null);
  const communityScopeRef = useRef<CommunityScope>({
    communityId: props.communityId,
    userId: props.session?.user.id ?? null,
    generation: 0,
  });
  const scopeUserId = props.session?.user.id ?? null;
  if (
    communityScopeRef.current.communityId !== props.communityId ||
    communityScopeRef.current.userId !== scopeUserId
  ) {
    communityScopeRef.current = {
      communityId: props.communityId,
      userId: scopeUserId,
      generation: communityScopeRef.current.generation + 1,
    };
  }

  const isCurrentScope = useCallback((scope: CommunityScope): boolean => {
    const current = communityScopeRef.current;
    return (
      current.communityId === scope.communityId &&
      current.userId === scope.userId &&
      current.generation === scope.generation
    );
  }, []);

  const loadMessages = useCallback(
    async (targetThreadKey: string, session: AuthSession): Promise<void> => {
      const scope = communityScopeRef.current;
      const rows = await listConvexCloudNewestThreadMessagesByThreadKey({
        session,
        threadKey: targetThreadKey,
        limit: 200,
      });
      if (!isCurrentScope(scope) || activeThreadKeyRef.current !== targetThreadKey) return;
      setMessages(normalizeMessages(rows ?? []));
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
      targetThreadKey === threadKey && props.communityId
        ? {
            id: targetThreadKey,
            title: `${props.communityName} agent`,
            model_id: DEFAULT_ACTIVE_MODEL_ID,
            runtime_engine: "polynet",
            project_id: null,
            community_id: props.communityId,
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
    setThreadKey(null);
    setMessages([]);
    setSendingByThread({});
    setStreamingByThread({});
    setIsPreparing(false);
    setInput("");
    setLocalError(null);
    setInferenceIssue(null);
    retryRef.current = null;
  }, [props.communityId, props.session?.user.id, stopStreamingTurn]);

  useEffect(() => {
    if (!props.isVisible) {
      setIsOpen(false);
      setIsPreparing(false);
    }
  }, [props.isVisible]);

  useEffect(() => {
    if (!isOpen || !props.isVisible || !props.communityId || !props.session) return;
    let cancelled = false;
    const scope = communityScopeRef.current;
    setIsPreparing(true);
    setLocalError(null);
    void (async () => {
      try {
        const usableSession = await props.ensureSession(
          props.session,
          "member_agent_dock_open",
        );
        if (!usableSession || cancelled || !isCurrentScope(scope)) return;
        const thread = await ensureCloudMemberAgentCommunityThread({
          session: usableSession,
          communityId: props.communityId!,
        });
        if (cancelled || !isCurrentScope(scope)) return;
        activeThreadKeyRef.current = thread.thread_key;
        setThreadKey(thread.thread_key);
        await loadMessages(thread.thread_key, usableSession);
      } catch (error) {
        if (cancelled || !isCurrentScope(scope)) return;
        console.warn("member_agent_dock_open_failed", error);
        setLocalError("Your agent could not open in this community.");
      } finally {
        if (!cancelled && isCurrentScope(scope)) setIsPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    loadMessages,
    props.communityId,
    props.ensureSession,
    props.isVisible,
    props.session,
    isCurrentScope,
  ]);

  const streamingState = threadKey ? streamingByThread[threadKey] ?? null : null;
  const runtimeEvents = streamingState?.runtimeEvents ?? [];
  const streamedText = streamingState?.content?.trim() ?? "";
  const isSending = Boolean(threadKey && sendingByThread[threadKey]);
  const turnIsActive = isSending || Boolean(streamingState);
  const visibleMessages = messages.filter((message) => message.role !== "system");
  const dockError = localError ?? formatInferenceIssue(inferenceIssue);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || turnIsActive || !props.communityId || !props.session) return;
    setLocalError(null);
    setInferenceIssue(null);
    setInput("");
    const retry = retryRef.current;
    const messageId = retry?.text === text ? retry.messageId : crypto.randomUUID();
    const scope = communityScopeRef.current;
    let targetThreadKey: string | null = null;
    try {
      const usableSession = await props.ensureSession(
        props.session,
        "member_agent_dock_send",
      );
      if (!usableSession) throw new Error("auth_session_required");
      if (!isCurrentScope(scope)) return;
      const thread = await ensureCloudMemberAgentCommunityThread({
        session: usableSession,
        communityId: props.communityId,
      });
      if (!isCurrentScope(scope)) return;
      targetThreadKey = thread.thread_key;
      activeThreadKeyRef.current = thread.thread_key;
      setThreadKey(thread.thread_key);
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
        seq: messages.length + 1,
        role: "user",
        content_json: { text },
        engine_id: null,
        model_id: null,
        run_id: null,
        created_at: new Date().toISOString(),
      };
      const optimisticMessages = messages.some((message) => message.id === messageId)
        ? messages
        : [...messages, optimisticMessage];
      setMessages(optimisticMessages);
      retryRef.current = null;
      const result = await runAgentTurn(usableSession, thread.thread_key, {
        preferredModelId: thread.model_id || DEFAULT_ACTIVE_MODEL_ID,
        mode: "respond",
        runIdHint: `member_agent_dock:${messageId}`,
        userMessageKey: messageId,
        runtimeEngine: "polynet",
        invocationSurface: "member_agent_dock",
        requestedFundingSource: "auto",
        requestedAgenticTools: true,
        replyToId: messageId,
        messages: [optimisticMessage],
      });
      if (result.error) throw new Error(result.error);
      if (!isCurrentScope(scope)) return;
      await loadMessages(thread.thread_key, usableSession);
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

  if (!props.isVisible || !props.communityId) return null;

  const shouldRenderStreamedText =
    Boolean(streamedText) && !hasSequencedAssistantText(runtimeEvents);

  return (
    <aside className={`member-agent-dock${isOpen ? " is-open" : ""}`} aria-live="polite">
      <button
        type="button"
        className={`member-agent-dock-launcher${turnIsActive ? " is-working" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close your agent" : "Open your agent"}
        title={isOpen ? "Close your agent" : "Open your agent"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
      </button>

      <section className="member-agent-dock-panel" aria-label="Your Polynet agent">
        <header className="member-agent-dock-header">
          <div className="member-agent-dock-identity">
            <span className="member-agent-dock-avatar" aria-hidden="true">
              <Sparkles />
            </span>
            <span>
              <strong>Your agent</strong>
              <small>{turnIsActive ? "Working" : `${props.communityName} context`}</small>
            </span>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} aria-label="Close" title="Close">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="member-agent-dock-transcript" ref={scrollRef}>
          {visibleMessages.length === 0 && !turnIsActive && !isPreparing ? (
            <div className="member-agent-dock-empty">
              <MessageCircle aria-hidden="true" />
              <p>Ask your agent about {props.communityName}.</p>
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
                  <span>Getting oriented in {props.communityName}</span>
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

        <form className="member-agent-dock-composer" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Message your agent in ${props.communityName}`}
            aria-label="Message your agent"
            rows={1}
            maxLength={8000}
            disabled={turnIsActive || isPreparing}
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
              disabled={!input.trim() || isPreparing}
              aria-label="Send"
              title="Send"
            >
              <Send aria-hidden="true" />
            </button>
          )}
        </form>
      </section>
    </aside>
  );
}
