import { useMemo } from "react";
import {
  buildAgentActivityTimeline,
  type AgentActivityItem,
  type AgentActivityStep,
} from "../../../../shared/runtimeActivityTimeline";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";

const TOOL_ROLL_LIMIT = 3;
const DRAWER_STEP_LIMIT = 5;

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

  if (!showActiveIndicators) return null;

  return (
    <div className="runtime-live-timeline" aria-live="polite">
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
      <span className="streaming-placeholder shimmer-text streaming-thinking-footer runtime-activity-word">
        {displayWord}
      </span>
    </div>
  );
}
