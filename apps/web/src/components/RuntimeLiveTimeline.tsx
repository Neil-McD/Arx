import { useMemo, type ReactNode } from "react";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import {
  buildAgentActivityTimeline,
  type AgentActivityStep,
} from "../../../../shared/runtimeActivityTimeline";
import { buildRuntimeLiveTimeline } from "../../../../shared/runtimeTimelineUi";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";

function RuntimeReasoningEntry(props: {
  id: string;
  isActive: boolean;
  text: string;
  renderReasoningMarkdown: (text: string) => ReactNode;
  showActiveIndicators: boolean;
}): JSX.Element {
  const displayText = useSmoothStreamingText(props.text, {
    active: props.showActiveIndicators && props.isActive,
  });

  return (
    <div
      className={`runtime-live-timeline-entry runtime-live-timeline-reasoning${props.showActiveIndicators && props.isActive ? " active" : ""}`}
    >
      <div className="message-text runtime-live-timeline-reasoning-text">
        {props.renderReasoningMarkdown(displayText)}
        {props.showActiveIndicators && props.isActive ? <span className="streaming-caret" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

function formatStepDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function statusLabel(status: AgentActivityStep["status"]): string {
  if (status === "running") return "Running";
  if (status === "error") return "Issue";
  return "Done";
}

function RuntimeActivityStepRow(props: {
  step: AgentActivityStep;
  showActiveIndicators: boolean;
}): JSX.Element {
  const { step } = props;
  const isActive = props.showActiveIndicators && step.isActive;
  const duration = formatStepDuration(step.durationMs);
  const defaultOpen = isActive || step.status === "error";

  return (
    <details
      key={`${step.id}:${isActive ? "active" : "settled"}:${step.status}`}
      className={`runtime-live-timeline-entry runtime-activity-step runtime-activity-step-${step.kind} runtime-activity-step-${step.status}${isActive ? " active" : ""}`}
      open={defaultOpen}
    >
      <summary className="runtime-activity-summary">
        <span className="runtime-activity-status-dot" aria-hidden="true" />
        <span className="runtime-activity-copy">
          <span className="runtime-activity-title-row">
            <span className="runtime-activity-title">{step.title}</span>
            <span className="runtime-activity-state">{statusLabel(step.status)}</span>
            {duration ? <span className="runtime-activity-duration">{duration}</span> : null}
          </span>
          <span className="runtime-activity-summary-text">
            {step.summary}
            {isActive ? (
              <>
                <span className="runtime-tool-trace-active-detail">
                  {step.items[step.items.length - 1]?.title ?? "Working"}
                </span>
                <span className="streaming-caret" aria-hidden="true" />
              </>
            ) : null}
          </span>
        </span>
      </summary>
      {step.items.length > 0 ? (
        <div className="runtime-activity-items">
          {step.items.map((item) => {
            const itemDuration = formatStepDuration(item.durationMs);
            return (
              <div
                key={item.id}
                className={`runtime-activity-item runtime-activity-item-${item.status}`}
              >
                <span className="runtime-activity-item-title">{item.title}</span>
                {item.detail ? <span className="runtime-activity-item-detail">{item.detail}</span> : null}
                {itemDuration ? <span className="runtime-activity-item-duration">{itemDuration}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </details>
  );
}

export function RuntimeLiveTimeline(props: {
  events: ThreadStreamingRuntimeEvent[];
  renderReasoningMarkdown: (text: string) => ReactNode;
  showActiveIndicators?: boolean;
}): JSX.Element | null {
  const reasoningEntries = useMemo(
    () => buildRuntimeLiveTimeline(props.events as any).filter((entry) => entry.kind === "reasoning"),
    [props.events],
  );
  const activitySteps = useMemo(
    () => buildAgentActivityTimeline(props.events as any),
    [props.events],
  );
  if (reasoningEntries.length === 0 && activitySteps.length === 0) return null;
  const showActiveIndicators = props.showActiveIndicators ?? false;

  return (
    <div className="runtime-live-timeline">
      {reasoningEntries.map((entry) => (
        <RuntimeReasoningEntry
          key={entry.id}
          id={entry.id}
          isActive={entry.isActive}
          text={entry.text}
          renderReasoningMarkdown={props.renderReasoningMarkdown}
          showActiveIndicators={showActiveIndicators}
        />
      ))}
      {activitySteps.length > 0 ? (
        <div className="runtime-activity-rail">
          {activitySteps.map((step) => (
            <RuntimeActivityStepRow
              key={step.id}
              step={step}
              showActiveIndicators={showActiveIndicators}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
