import { useEffect, useMemo, useState } from "react";
import {
  buildAgentActivityTimeline,
  type AgentActivityItem,
  type AgentActivityStep,
} from "../../../../shared/runtimeActivityTimeline";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";

const TOOL_ROLL_LIMIT = 3;
const DRAWER_STEP_LIMIT = 5;

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

function latestWorkStep(steps: AgentActivityStep[]): AgentActivityStep | null {
  return (
    [...steps].reverse().find((step) => step.kind !== "completed") ??
    steps[steps.length - 1] ??
    null
  );
}

function activityWordForSteps(steps: AgentActivityStep[]): string {
  const activeStep =
    steps.find((step) => step.isActive) ??
    latestWorkStep(steps) ??
    null;
  if (!activeStep) return "Thinking";
  return activeStep.title;
}

function narrationForStep(step: AgentActivityStep | null): string | null {
  if (!step) return null;
  if (step.kind === "planning") return "I’m setting up the run and deciding where to start.";
  if (step.kind === "connecting") return "I’m starting the workspace computer for this turn.";
  if (step.kind === "exploring") {
    if (step.stats.searches) return "I’m searching for the relevant path before changing anything.";
    if (step.stats.directoriesScanned) return "I’m mapping the workspace so I can work from the right place.";
    return "I’m narrowing down where the answer should come from.";
  }
  if (step.kind === "reading") return "I’m reading the files that look relevant.";
  if (step.kind === "editing") return "I’m applying the smallest change that fits what I found.";
  if (step.kind === "verifying") return "I’m checking whether the change actually holds.";
  if (step.kind === "blocked") return "I hit a blocker and I’m preserving what happened.";
  return "I’m wrapping up the result.";
}

function isToolStep(step: AgentActivityStep): boolean {
  return step.items.some((item) => Boolean(item.toolName));
}

function toolItemLabel(item: AgentActivityItem): string {
  return item.title || item.toolName || "Used tool";
}

function toolItemsForRoll(step: AgentActivityStep | null): AgentActivityItem[] {
  if (!step) return [];
  return step.items
    .filter((item) => Boolean(item.toolName))
    .sort((a, b) => a.seqStart - b.seqStart)
    .slice(-TOOL_ROLL_LIMIT);
}

function toolStepsForDrawers(steps: AgentActivityStep[]): AgentActivityStep[] {
  return steps.filter(isToolStep).slice(-DRAWER_STEP_LIMIT);
}

export function RuntimeLiveTimeline(props: {
  events: ThreadStreamingRuntimeEvent[];
  renderReasoningMarkdown: (text: string) => unknown;
  showActiveIndicators?: boolean;
}): JSX.Element | null {
  const showActiveIndicators = props.showActiveIndicators ?? false;
  const steps = useMemo(
    () => buildAgentActivityTimeline(props.events as any),
    [props.events],
  );
  const runTiming = useMemo(
    () => runTimingForEvents(props.events),
    [props.events],
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const activityWord = useMemo(() => activityWordForSteps(steps), [steps]);
  const narration = useMemo(
    () => narrationForStep(latestWorkStep(steps)),
    [steps],
  );
  const visibleToolSteps = useMemo(() => toolStepsForDrawers(steps), [steps]);
  const rollTargetStep = visibleToolSteps[visibleToolSteps.length - 1] ?? null;
  const olderDrawers = rollTargetStep ? visibleToolSteps.slice(0, -1) : visibleToolSteps;
  const rollingToolItems = useMemo(
    () => toolItemsForRoll(rollTargetStep),
    [rollTargetStep],
  );
  const displayWord = useSmoothStreamingText(activityWord, {
    active: showActiveIndicators,
  });
  const displayNarration = useSmoothStreamingText(narration ?? "", {
    active: showActiveIndicators && Boolean(narration),
  });
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

  if (!showActiveIndicators) {
    return timerLabel ? (
      <div className="runtime-live-timeline runtime-live-timeline-compact">
        <span className="runtime-turn-timer">
          {timerLabel}
          <span className="runtime-turn-timer-chevron" aria-hidden="true">
            ›
          </span>
        </span>
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
      {visibleToolSteps.length > 0 ? (
        <div className="runtime-tool-drawers" aria-label="Grouped tool activity">
          {olderDrawers.map((step) => (
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
          {rollTargetStep ? (
            <details key={rollTargetStep.id} className="runtime-tool-drawer">
              <summary className="runtime-tool-drawer-summary streaming-placeholder">
                <span className="runtime-tool-drawer-title">{rollTargetStep.title}</span>
                <span className="runtime-tool-drawer-detail">{rollTargetStep.summary}</span>
              </summary>
              <div className="runtime-tool-drawer-body">
                {rollTargetStep.items
                  .filter((item) => Boolean(item.toolName))
                  .map((item) => (
                    <div key={item.id} className="runtime-tool-drawer-item">
                      {toolItemLabel(item)}
                    </div>
                  ))}
              </div>
            </details>
          ) : null}
          {rollingToolItems.length > 0 ? (
            <div className="runtime-tool-roll" aria-label="Recent tool activity">
              {rollingToolItems.map((item, index) => (
                <div
                  key={item.id}
                  className="runtime-tool-roll-item streaming-placeholder"
                  style={{
                    ["--runtime-tool-delay" as string]: `${index * 45}ms`,
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
        </div>
      ) : null}
      {displayNarration ? (
        <span className="runtime-thought-snippet streaming-placeholder">
          {displayNarration}
        </span>
      ) : null}
      <span
        className="streaming-placeholder shimmer-text streaming-thinking-footer runtime-activity-word"
        aria-live="polite"
      >
        {displayWord}
      </span>
    </div>
  );
}
