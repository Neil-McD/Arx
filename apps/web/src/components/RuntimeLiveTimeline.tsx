import { useMemo } from "react";
import {
  buildAgentActivityTimeline,
  type AgentActivityItem,
  type AgentActivityStep,
} from "../../../../shared/runtimeActivityTimeline";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";

const TOOL_ROLL_LIMIT = 4;
const DRAWER_STEP_LIMIT = 6;

function activityWordForEvents(events: ThreadStreamingRuntimeEvent[]): string {
  const steps = buildAgentActivityTimeline(events as any);
  const activeStep =
    steps.find((step) => step.isActive) ??
    [...steps].reverse().find((step) => step.kind !== "completed") ??
    null;
  if (!activeStep) return "Thinking";
  return activeStep.title;
}

function isToolStep(step: AgentActivityStep): boolean {
  return step.items.some((item) => Boolean(item.toolName));
}

function toolItemLabel(item: AgentActivityItem): string {
  return item.title || item.toolName || "Used tool";
}

function toolItemsForRoll(steps: AgentActivityStep[]): AgentActivityItem[] {
  return steps
    .flatMap((step) => step.items)
    .filter((item) => Boolean(item.toolName))
    .sort((a, b) => a.seqStart - b.seqStart)
    .slice(-TOOL_ROLL_LIMIT);
}

function drawerSteps(steps: AgentActivityStep[]): AgentActivityStep[] {
  return steps
    .filter((step) => isToolStep(step) && step.status !== "running")
    .slice(-DRAWER_STEP_LIMIT);
}

export function RuntimeLiveTimeline(props: {
  events: ThreadStreamingRuntimeEvent[];
  renderReasoningMarkdown: (text: string) => unknown;
  showActiveIndicators?: boolean;
}): JSX.Element | null {
  const showActiveIndicators = props.showActiveIndicators ?? false;
  const activityWord = useMemo(
    () => activityWordForEvents(props.events),
    [props.events],
  );
  const steps = useMemo(
    () => buildAgentActivityTimeline(props.events as any),
    [props.events],
  );
  const rollingToolItems = useMemo(() => toolItemsForRoll(steps), [steps]);
  const completedDrawers = useMemo(() => drawerSteps(steps), [steps]);
  const displayWord = useSmoothStreamingText(activityWord, {
    active: showActiveIndicators,
  });

  if (!showActiveIndicators) return null;

  return (
    <div className="runtime-live-timeline" aria-live="polite">
      <span className="streaming-placeholder shimmer-text streaming-thinking-footer runtime-activity-word">
        {displayWord}
      </span>
      {rollingToolItems.length > 0 ? (
        <div className="runtime-tool-roll" aria-label="Recent tool activity">
          {rollingToolItems.map((item, index) => (
            <div
              key={item.id}
              className="runtime-tool-roll-item streaming-placeholder"
              style={{
                ["--runtime-tool-delay" as string]: `${index * 70}ms`,
              }}
            >
              <span className="runtime-tool-roll-kind">
                {item.toolName ?? "tool"}
              </span>
              <span className="runtime-tool-roll-label">
                {toolItemLabel(item)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {completedDrawers.length > 0 ? (
        <div className="runtime-tool-drawers" aria-label="Grouped tool activity">
          {completedDrawers.map((step) => (
            <details key={step.id} className="runtime-tool-drawer">
              <summary className="runtime-tool-drawer-summary streaming-placeholder">
                <span className="runtime-tool-drawer-title">{step.title}</span>
                <span className="runtime-tool-drawer-detail">{step.summary}</span>
              </summary>
              <div className="runtime-tool-drawer-body">
                {step.items
                  .filter((item) => Boolean(item.toolName))
                  .map((item) => (
                    <div key={item.id} className="runtime-tool-drawer-item">
                      {toolItemLabel(item)}
                    </div>
                  ))}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
