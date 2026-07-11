import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Check,
  LoaderCircle,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { AuthSession } from "../auth";
import { renderMarkdown } from "../../../../shared/markdownUi";
import {
  sendCloudCommunityAgentDockMessage,
  subscribeCloudCommunityAgentDockTranscript,
  subscribeCloudCommunityAgentDockTurn,
  type CommunityAgentDockEvent,
  type CommunityAgentDockTranscript,
  type CommunityAgentDockTurn,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import {
  createCloudCommunityChatLiveClient,
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
import "./WebCommunityAgentDock.css";

type WebCommunityAgentDockProps = {
  isVisible: boolean;
  communityId: string | null;
  communityName: string;
  communityAvatarUrl?: string | null;
  session: AuthSession | null;
  ensureSession: (
    session?: AuthSession | null,
    source?: string,
    options?: { forceRefresh?: boolean },
  ) => Promise<AuthSession | null>;
};

const EMPTY_TRANSCRIPT: CommunityAgentDockTranscript = {
  root_id: null,
  messages: [],
};

const EMPTY_TURN: CommunityAgentDockTurn = {
  request: null,
  events: [],
};

function toolLabel(toolName: string | null): string {
  switch (toolName) {
    case "search_product_docs":
      return "Searching Polynet docs";
    case "get_product_doc":
      return "Reading Polynet docs";
    case "community_resources_search":
      return "Searching community resources";
    case "community_resources_read":
      return "Reading community resources";
    default:
      return "Using a community tool";
  }
}

function formatDockError(turn: CommunityAgentDockTurn, fallback: string | null): string | null {
  return turn.request?.public_issue?.message ?? fallback;
}

function latestToolRows(events: CommunityAgentDockEvent[]): CommunityAgentDockEvent[] {
  return events.filter((event) => event.kind === "tool_call").slice(-4);
}

function isResponsePersisted(transcript: CommunityAgentDockTranscript, turn: CommunityAgentDockTurn): boolean {
  const responseReplyId = turn.request?.response_reply_id;
  return Boolean(
    responseReplyId && transcript.messages.some((message) => message.id === responseReplyId),
  );
}

export function WebCommunityAgentDock(props: WebCommunityAgentDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState<CommunityAgentDockTranscript>(EMPTY_TRANSCRIPT);
  const [turn, setTurn] = useState<CommunityAgentDockTurn>(EMPTY_TURN);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<{ text: string; replyId: string | null } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const retrySendRef = useRef<{ text: string; idempotencyKey: string } | null>(null);

  useEffect(() => {
    setTranscript(EMPTY_TRANSCRIPT);
    setTurn(EMPTY_TURN);
    setInput("");
    setPendingMessage(null);
    setLocalError(null);
    retrySendRef.current = null;
  }, [props.communityId]);

  useEffect(() => {
    if (!props.isVisible) setIsOpen(false);
  }, [props.isVisible]);

  useEffect(() => {
    if (!isOpen || !props.isVisible || !props.communityId || !props.session) return;
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribeTranscript: (() => void) | null = null;
    let unsubscribeTurn: (() => void) | null = null;
    void (async () => {
      const usableSession = await props.ensureSession(props.session, "community_agent_dock");
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: props.ensureSession,
        });
        unsubscribeTranscript = subscribeCloudCommunityAgentDockTranscript({
          liveClient,
          communityId: props.communityId!,
          onUpdate: (nextTranscript) => {
            if (cancelled) return;
            setTranscript(nextTranscript);
            setLocalError(null);
          },
          onError: (error) => {
            if (cancelled) return;
            console.warn("community_agent_dock_subscription_failed", error);
            setLocalError("The community agent could not reconnect.");
          },
        });
        unsubscribeTurn = subscribeCloudCommunityAgentDockTurn({
          liveClient,
          communityId: props.communityId!,
          onUpdate: (nextTurn) => {
            if (cancelled) return;
            setTurn(nextTurn);
            setLocalError(null);
          },
          onError: (error) => {
            if (cancelled) return;
            console.warn("community_agent_dock_turn_subscription_failed", error);
            setLocalError("The community agent could not reconnect.");
          },
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("community_agent_dock_subscription_failed", error);
        setLocalError("The community agent could not reconnect.");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribeTranscript?.();
      unsubscribeTurn?.();
      liveClient?.close();
    };
  }, [isOpen, props.communityId, props.ensureSession, props.isVisible, props.session]);

  const requestIsActive = turn.request?.status === "queued" || turn.request?.status === "running";
  const pendingMessageIsPersisted = Boolean(
    pendingMessage?.replyId && transcript.messages.some((message) => message.id === pendingMessage.replyId),
  );
  const visiblePendingText = pendingMessageIsPersisted ? null : pendingMessage?.text ?? null;
  const turnIsActive = isSending || Boolean(visiblePendingText) || requestIsActive;
  const responsePersisted = isResponsePersisted(transcript, turn);
  const assistantStream = useMemo(
    () => turn.events.filter((event) => event.kind === "assistant").map((event) => event.content).join(""),
    [turn.events],
  );
  const finalEventText = useMemo(
    () => [...turn.events].reverse().find((event) => event.kind === "final")?.content ?? "",
    [turn.events],
  );
  const reasoningText = useMemo(
    () => turn.events.filter((event) => event.kind === "reasoning").map((event) => event.content).join("").trim(),
    [turn.events],
  );
  const toolRows = useMemo(() => latestToolRows(turn.events), [turn.events]);
  const dockError = formatDockError(turn, localError);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assistantStream, isOpen, transcript.messages.length, turn.events.length]);

  useEffect(() => {
    if (pendingMessageIsPersisted) setPendingMessage(null);
  }, [pendingMessageIsPersisted]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || turnIsActive || !props.communityId || !props.session) return;
    setIsSending(true);
    setPendingMessage({ text, replyId: null });
    setLocalError(null);
    setInput("");
    const retrySend = retrySendRef.current;
    const idempotencyKey = retrySend?.text === text
      ? retrySend.idempotencyKey
      : typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const usableSession = await props.ensureSession(props.session, "community_agent_dock_send");
      if (!usableSession) throw new Error("auth_session_required");
      const result = await sendCloudCommunityAgentDockMessage({
        session: usableSession,
        communityId: props.communityId,
        idempotencyKey,
        text,
      });
      setPendingMessage({ text, replyId: result.reply_id });
      retrySendRef.current = null;
    } catch (error) {
      console.warn("community_agent_dock_send_failed", error);
      setInput(text);
      setPendingMessage(null);
      retrySendRef.current = { text, idempotencyKey };
      setLocalError("Your message was not sent. Try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (!props.isVisible || !props.communityId) return null;

  const streamedText = responsePersisted ? "" : assistantStream || finalEventText;

  return (
    <aside className={`community-agent-dock${isOpen ? " is-open" : ""}`} aria-live="polite">
      <button
        type="button"
        className="community-agent-dock-launcher"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close community agent" : `Open ${props.communityName} agent`}
        title={isOpen ? "Close community agent" : `Open ${props.communityName} agent`}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <X aria-hidden="true" />
        ) : props.communityAvatarUrl ? (
          <img src={props.communityAvatarUrl} alt="" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
      </button>

      <section className="community-agent-dock-panel" aria-label={`${props.communityName} agent`}>
        <header className="community-agent-dock-header">
          <div className="community-agent-dock-identity">
            <span className="community-agent-dock-avatar" aria-hidden="true">
              {props.communityAvatarUrl ? <img src={props.communityAvatarUrl} alt="" /> : <Sparkles />}
            </span>
            <span>
              <strong>{props.communityName} agent</strong>
              <small>{turnIsActive ? "Working" : "Ready"}</small>
            </span>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} aria-label="Close" title="Close">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="community-agent-dock-transcript" ref={scrollRef}>
          {transcript.messages.length === 0 && !turnIsActive ? (
            <div className="community-agent-dock-empty">
              <MessageCircle aria-hidden="true" />
              <p>What do you want to know about {props.communityName}?</p>
            </div>
          ) : null}

          {transcript.messages.map((message) => (
            <article
              key={message.id}
              className={`community-agent-dock-message is-${message.actor_type}`}
            >
              {message.actor_type === "community_agent"
                ? renderMarkdown(message.text)
                : <p>{message.text}</p>}
            </article>
          ))}

          {visiblePendingText ? (
            <article className="community-agent-dock-message is-human is-pending">
              <p>{visiblePendingText}</p>
            </article>
          ) : null}

          {turnIsActive || streamedText ? (
            <div className="community-agent-dock-live-turn">
              {reasoningText ? (
                <div className="community-agent-dock-reasoning">
                  <LoaderCircle aria-hidden="true" />
                  <span>{reasoningText}</span>
                </div>
              ) : turnIsActive ? (
                <div className="community-agent-dock-reasoning">
                  <LoaderCircle aria-hidden="true" />
                  <span>Getting oriented in {props.communityName}</span>
                </div>
              ) : null}
              {toolRows.map((toolEvent) => {
                const result = turn.events.find(
                  (event) =>
                    event.kind === "tool_result" &&
                    event.seq > toolEvent.seq &&
                    event.tool_name === toolEvent.tool_name,
                );
                return (
                  <div className="community-agent-dock-tool" key={toolEvent.id}>
                    {result ? <Check aria-hidden="true" /> : <Search aria-hidden="true" />}
                    <span>{toolLabel(toolEvent.tool_name)}</span>
                  </div>
                );
              })}
              {streamedText ? (
                <article className="community-agent-dock-message is-community_agent is-streaming">
                  {renderMarkdown(streamedText)}
                  {turnIsActive ? <span className="community-agent-dock-caret" aria-hidden="true" /> : null}
                </article>
              ) : null}
            </div>
          ) : null}

          {dockError ? <p className="community-agent-dock-error">{dockError}</p> : null}
        </div>

        <form className="community-agent-dock-composer" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Ask ${props.communityName}`}
            aria-label={`Message ${props.communityName} agent`}
            rows={1}
            maxLength={8000}
            disabled={turnIsActive}
          />
          <button
            type="submit"
            disabled={!input.trim() || turnIsActive}
            aria-label="Send"
            title="Send"
          >
            {isSending ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Send aria-hidden="true" />}
          </button>
        </form>
      </section>
    </aside>
  );
}
