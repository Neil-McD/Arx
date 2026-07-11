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
  subscribeCloudCommunityAgentDock,
  type CommunityAgentDockEvent,
  type CommunityAgentDockSnapshot,
  type CommunityInteractionReplyBundle,
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

const EMPTY_SNAPSHOT: CommunityAgentDockSnapshot = {
  root_id: null,
  messages: [],
  request: null,
  events: [],
};

function messageText(bundle: CommunityInteractionReplyBundle): string {
  const markdown = bundle.content_blocks
    .filter((block) => block.block_type === "markdown_text" && block.text)
    .map((block) => block.text)
    .join("\n\n")
    .trim();
  return markdown || bundle.reply.content_summary;
}

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

function formatDockError(snapshot: CommunityAgentDockSnapshot, fallback: string | null): string | null {
  const request = snapshot.request;
  if (request?.intake_reason === "requester_connection_missing") {
    return "Connect ChatGPT in Settings to use this agent.";
  }
  if (request?.intake_reason === "agent_disabled") {
    return "This community agent is currently unavailable.";
  }
  if (request?.status === "error" || request?.status === "skipped") {
    return request.error_message || "The community agent could not complete this turn.";
  }
  return fallback;
}

function latestToolRows(events: CommunityAgentDockEvent[]): CommunityAgentDockEvent[] {
  return events.filter((event) => event.kind === "tool_call").slice(-4);
}

function isResponsePersisted(snapshot: CommunityAgentDockSnapshot): boolean {
  const responseReplyId = snapshot.request?.response_reply_id;
  return Boolean(
    responseReplyId && snapshot.messages.some((message) => message.reply.id === responseReplyId),
  );
}

export function WebCommunityAgentDock(props: WebCommunityAgentDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CommunityAgentDockSnapshot>(EMPTY_SNAPSHOT);
  const [input, setInput] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const retrySendRef = useRef<{ text: string; idempotencyKey: string } | null>(null);

  useEffect(() => {
    setSnapshot(EMPTY_SNAPSHOT);
    setInput("");
    setPendingText(null);
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
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const usableSession = await props.ensureSession(props.session, "community_agent_dock");
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: props.ensureSession,
        });
        unsubscribe = subscribeCloudCommunityAgentDock({
          liveClient,
          communityId: props.communityId!,
          onUpdate: (nextSnapshot) => {
            if (cancelled) return;
            setSnapshot(nextSnapshot);
            setLocalError(null);
          },
          onError: (error) => {
            if (cancelled) return;
            console.warn("community_agent_dock_subscription_failed", error);
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
      unsubscribe?.();
      liveClient?.close();
    };
  }, [isOpen, props.communityId, props.ensureSession, props.isVisible, props.session]);

  const requestIsActive = snapshot.request?.status === "queued" || snapshot.request?.status === "running";
  const pendingTextIsPersisted = Boolean(
    pendingText && snapshot.messages.some(
      (message) => message.reply.actor_type === "human" && messageText(message) === pendingText,
    ),
  );
  const visiblePendingText = pendingTextIsPersisted ? null : pendingText;
  const turnIsActive = isSending || Boolean(visiblePendingText) || requestIsActive;
  const responsePersisted = isResponsePersisted(snapshot);
  const assistantStream = useMemo(
    () => snapshot.events.filter((event) => event.kind === "assistant").map((event) => event.content).join(""),
    [snapshot.events],
  );
  const finalEventText = useMemo(
    () => [...snapshot.events].reverse().find((event) => event.kind === "final")?.content ?? "",
    [snapshot.events],
  );
  const reasoningText = useMemo(
    () => snapshot.events.filter((event) => event.kind === "reasoning").map((event) => event.content).join("").trim(),
    [snapshot.events],
  );
  const toolRows = useMemo(() => latestToolRows(snapshot.events), [snapshot.events]);
  const dockError = formatDockError(snapshot, localError);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assistantStream, isOpen, snapshot.messages.length, snapshot.events.length]);

  useEffect(() => {
    if (pendingTextIsPersisted) setPendingText(null);
  }, [pendingTextIsPersisted]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || turnIsActive || !props.communityId || !props.session) return;
    setIsSending(true);
    setPendingText(text);
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
      await sendCloudCommunityAgentDockMessage({
        session: usableSession,
        communityId: props.communityId,
        idempotencyKey,
        text,
      });
      retrySendRef.current = null;
    } catch (error) {
      console.warn("community_agent_dock_send_failed", error);
      setInput(text);
      setPendingText(null);
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
          {snapshot.messages.length === 0 && !turnIsActive ? (
            <div className="community-agent-dock-empty">
              <MessageCircle aria-hidden="true" />
              <p>What do you want to know about {props.communityName}?</p>
            </div>
          ) : null}

          {snapshot.messages.map((message) => (
            <article
              key={message.reply.id}
              className={`community-agent-dock-message is-${message.reply.actor_type}`}
            >
              {message.reply.actor_type === "community_agent"
                ? renderMarkdown(messageText(message))
                : <p>{messageText(message)}</p>}
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
                const result = snapshot.events.find(
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
