import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildRuntimeLiveTimeline,
  type RuntimeTimelineToolCall,
  type RuntimeTimelineToolGroup,
} from "../../../../shared/runtimeTimelineUi";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  extractRuntimeResourceChangesetCards,
  RuntimeResourceChangesetApprovalCards,
} from "./RuntimeResourceChangesetApprovalCards";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";

function parseEventTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatElapsedTime(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function runTimingForEvents(events: ThreadStreamingRuntimeEvent[]): {
  startedAtMs: number | null;
  finishedAtMs: number | null;
  lastEventAtMs: number | null;
} {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const startedAt =
    sorted.find((event) => event.event_type === "run_started")?.created_at ??
    sorted[0]?.created_at ??
    null;
  const finishedAt =
    [...sorted].reverse().find((event) => event.event_type === "run_finished")
      ?.created_at ?? null;
  return {
    startedAtMs: parseEventTimeMs(startedAt),
    finishedAtMs: parseEventTimeMs(finishedAt),
    lastEventAtMs: parseEventTimeMs(sorted[sorted.length - 1]?.created_at),
  };
}

function renderToolCallLabel(call: RuntimeTimelineToolCall): ReactNode {
  if (call.href) {
    return (
      <a
        className="runtime-trace-tool-call-link"
        href={call.href}
        target="_blank"
        rel="noreferrer"
      >
        {call.title}
      </a>
    );
  }
  return <span className="runtime-trace-tool-call-title">{call.title}</span>;
}

function RuntimeTraceToolGroup(props: {
  group: RuntimeTimelineToolGroup;
  isActive: boolean;
}): JSX.Element {
  const { group, isActive } = props;
  const isLiveActive = isActive && group.status === "running";
  return (
    <details
      className={[
        "runtime-trace-tool",
        `runtime-trace-tool-${group.status}`,
        isLiveActive ? "runtime-trace-tool-active" : "",
      ].filter(Boolean).join(" ")}
    >
      <summary className="runtime-trace-tool-summary">
        <span className="runtime-trace-tool-title">{group.title}</span>
        <span className="runtime-trace-tool-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="runtime-trace-tool-body">
        {group.calls.map((call) => (
          <div key={call.id} className="runtime-trace-tool-call">
            {renderToolCallLabel(call)}
            <span className="runtime-trace-tool-call-kind">
              {call.toolName}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function RuntimeLiveTimeline(props: {
  events: ThreadStreamingRuntimeEvent[];
  session: AuthSessionLike | null;
  renderReasoningMarkdown: (text: string) => ReactNode;
  showActiveIndicators?: boolean;
  showThinkingFooter?: boolean;
  onInitialResourcesApplied?: (communityId: string) => void;
}): JSX.Element | null {
  const showActiveIndicators = props.showActiveIndicators ?? false;
  const allowThinkingFooter = props.showThinkingFooter ?? true;
  const runTiming = useMemo(
    () => runTimingForEvents(props.events),
    [props.events],
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const liveTimelineEntries = useMemo(
    () => buildRuntimeLiveTimeline(props.events),
    [props.events],
  );
  const changesetCards = useMemo(
    () => extractRuntimeResourceChangesetCards(props.events),
    [props.events],
  );
  const elapsedMs =
    runTiming.startedAtMs === null
      ? null
      : Math.max(
          0,
          (runTiming.finishedAtMs ??
            (showActiveIndicators ? nowMs : runTiming.lastEventAtMs) ??
            nowMs) - runTiming.startedAtMs,
        );
  const isLiveTimer = showActiveIndicators && runTiming.finishedAtMs === null;
  const showThinkingFooter =
    allowThinkingFooter && showActiveIndicators && runTiming.finishedAtMs === null;
  const timerLabel =
    elapsedMs === null
      ? null
      : `${isLiveTimer ? "Working" : "Worked"} for ${formatElapsedTime(elapsedMs)}`;

  useEffect(() => {
    if (!showActiveIndicators || runTiming.finishedAtMs !== null) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [runTiming.finishedAtMs, showActiveIndicators]);

  const approvalCards =
    props.session && changesetCards.length > 0 ? (
      <RuntimeResourceChangesetApprovalCards
        cards={changesetCards}
        session={props.session}
        onInitialResourcesApplied={props.onInitialResourcesApplied}
        disableInitialResourcesAction={showActiveIndicators}
      />
    ) : null;

  if (!showActiveIndicators) {
    return timerLabel || approvalCards ? (
      <div className="runtime-live-timeline runtime-live-timeline-compact">
        {timerLabel ? (
          <span className="runtime-turn-timer">
            {timerLabel}
            <span className="runtime-turn-timer-chevron" aria-hidden="true">
              &gt;
            </span>
          </span>
        ) : null}
        {approvalCards}
      </div>
    ) : null;
  }

  return (
    <div className="runtime-live-timeline">
      {timerLabel ? (
        <span className="runtime-turn-timer">
          {timerLabel}
          <span className="runtime-turn-timer-chevron" aria-hidden="true">
            ›
          </span>
        </span>
      ) : null}
      {liveTimelineEntries.length > 0 ? (
        <div className="runtime-trace-flow">
          {liveTimelineEntries.map((entry) =>
            entry.kind === "reasoning" || entry.kind === "assistant_text" ? (
              <div
                key={entry.id}
                className="runtime-trace-reasoning message-text runtime-live-timeline-reasoning-text"
              >
                {props.renderReasoningMarkdown(entry.text)}
              </div>
            ) : (
              <RuntimeTraceToolGroup
                key={entry.id}
                group={entry.group}
                isActive={entry.isActive}
              />
            ),
          )}
        </div>
      ) : null}
      {showThinkingFooter ? (
        <span
          className="streaming-placeholder shimmer-text streaming-thinking-footer"
          aria-live="polite"
          aria-label="Thinking"
        >
          Thinking
        </span>
      ) : null}
      {approvalCards}
    </div>
  );
}
