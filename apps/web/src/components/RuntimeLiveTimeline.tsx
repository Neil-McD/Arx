import { useMemo } from "react";
import { buildAgentActivityTimeline } from "../../../../shared/runtimeActivityTimeline";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";

function activityWordForEvents(events: ThreadStreamingRuntimeEvent[]): string {
  const steps = buildAgentActivityTimeline(events as any);
  const activeStep =
    steps.find((step) => step.isActive) ??
    [...steps].reverse().find((step) => step.kind !== "completed") ??
    null;
  if (!activeStep) return "Thinking";
  return activeStep.title;
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
  const displayWord = useSmoothStreamingText(activityWord, {
    active: showActiveIndicators,
  });

  if (!showActiveIndicators) return null;

  return (
    <div className="runtime-live-timeline" aria-live="polite">
      <span className="runtime-activity-word shimmer-text">
        {displayWord}
      </span>
    </div>
  );
}
