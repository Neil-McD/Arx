import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import {
  buildAgentActivityTimeline,
  type AgentActivityStep,
} from "../../../../shared/runtimeActivityTimeline";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  approveCloudCommunityResourceBuilderChangeset,
  applyCloudCommunityResourceBuilderChangeset,
  getCloudCommunityResourceBuilderChangesetStatus,
  rejectCloudCommunityResourceBuilderChangeset,
} from "../../../../shared/cloudCommunityAdminGateway";
import { dispatchCommunityResourcesMutated } from "../../../../shared/communityResourceMutationEvents";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";
import {
  buildRuntimeLiveTimeline,
  type RuntimeLiveTimelineEntry,
  type RuntimeTimelineToolCall,
  type RuntimeTimelineToolGroup,
} from "../../../../shared/runtimeTimelineUi";

const CHANGESET_CARD_LIMIT = 2;

type ResourceChangesetPreviewItem = {
  id: string;
  marker: string;
  title: string;
  preview: string | null;
};

type ResourceChangesetCardModel = {
  id: string;
  communityId: string;
  changesetId: string;
  summary: string;
  operationCount: number;
  warningCount: number;
  previewItems: ResourceChangesetPreviewItem[];
  seq: number;
};

type ResourceChangesetActionState =
  | "idle"
  | "applying"
  | "applied"
  | "rejecting"
  | "rejected"
  | "error";

type ResourceChangesetServerStatus =
  | "staged"
  | "approved"
  | "applied"
  | "rejected"
  | "failed"
  | "expired";

function parseEventTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function asResourceChangesetServerStatus(value: unknown): ResourceChangesetServerStatus | null {
  const status = asString(value);
  return status === "staged" ||
    status === "approved" ||
    status === "applied" ||
    status === "rejected" ||
    status === "failed" ||
    status === "expired"
    ? status
    : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseToolOutputRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  return (
    parseJsonRecord(payload.output) ??
    parseJsonRecord(payload.output_preview) ??
    asRecord(payload.details)
  );
}

function normalizePreviewItems(value: unknown): ResourceChangesetPreviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((raw, index) => {
    const row = asRecord(raw);
    if (!row) return [];
    const title = asString(row.title);
    if (!title) return [];
    const marker = asString(row.marker) || "+";
    const preview = asString(row.preview);
    return [
      {
        id: `${index}:${marker}:${title}`,
        marker,
        title,
        preview: preview || null,
      },
    ];
  });
}

function extractTerminalChangesetIds(
  events: ThreadStreamingRuntimeEvent[],
): Set<string> {
  const terminal = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload || payload.success !== true) continue;
    const toolName = asString(payload.tool_name);
    if (toolName !== "community_resource_builder_apply_changeset") continue;
    const output = parseToolOutputRecord(payload);
    const changesetId = asString(output?.changeset_id);
    if (changesetId) terminal.add(changesetId);
  }
  return terminal;
}

function extractResourceChangesetCards(
  events: ThreadStreamingRuntimeEvent[],
): ResourceChangesetCardModel[] {
  const terminalChangesetIds = extractTerminalChangesetIds(events);
  const cards = new Map<string, ResourceChangesetCardModel>();
  for (const event of events) {
    if (event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload || payload.success !== true) continue;
    const toolName = asString(payload.tool_name);
    if (toolName !== "community_resource_builder_stage_changeset") continue;
    const output = parseToolOutputRecord(payload);
    if (asString(output?.kind) !== "community_resource_builder_changeset_staged") {
      continue;
    }
    const changesetId = asString(output?.changeset_id);
    const communityId = asString(output?.community_id);
    if (!changesetId || !communityId || terminalChangesetIds.has(changesetId)) {
      continue;
    }
    cards.set(changesetId, {
      id: changesetId,
      communityId,
      changesetId,
      summary: asString(output?.summary) || "Resource changes proposed.",
      operationCount: asNumber(output?.operation_count ?? output?.preview_total_count),
      warningCount: asNumber(output?.warning_count),
      previewItems: normalizePreviewItems(output?.preview_items),
      seq: event.seq,
    });
  }
  return [...cards.values()]
    .sort((a, b) => a.seq - b.seq)
    .slice(-CHANGESET_CARD_LIMIT);
}

function ResourceChangesetApprovalCard(props: {
  card: ResourceChangesetCardModel;
  session: AuthSessionLike;
}): JSX.Element {
  const [actionState, setActionState] = useState<ResourceChangesetActionState>("idle");
  const [serverStatus, setServerStatus] = useState<ResourceChangesetServerStatus | null>(null);
  const [approvedByCurrentUser, setApprovedByCurrentUser] = useState(false);
  const [verifiedApply, setVerifiedApply] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isBusy = actionState === "applying" || actionState === "rejecting";
  const isDone =
    actionState === "applied" ||
    actionState === "rejected" ||
    serverStatus === "applied" ||
    serverStatus === "rejected" ||
    serverStatus === "failed" ||
    serverStatus === "expired";
  const canApply = !(serverStatus === "approved" && !approvedByCurrentUser);

  useEffect(() => {
    if (!props.session) return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getCloudCommunityResourceBuilderChangesetStatus<unknown, Record<string, unknown>>({
          session: props.session,
          communityId: props.card.communityId,
          changesetId: props.card.changesetId,
        });
        if (cancelled) return;
        const status = asResourceChangesetServerStatus(payload?.status);
        if (status) {
          setServerStatus(status);
          setApprovedByCurrentUser(payload?.approved_by_current_user === true);
          if (status === "applied") {
            setActionState("applied");
            setVerifiedApply(true);
          }
          if (status === "rejected") setActionState("rejected");
          if (status === "approved" && payload?.approved_by_current_user !== true) {
            setErrorMessage("This changeset was approved by another manager.");
          }
          if (status === "failed") {
            setActionState("error");
            setErrorMessage("This proposed changeset failed.");
          }
          if (status === "expired") {
            setActionState("error");
            setErrorMessage("This proposed changeset expired.");
          }
        }
      } catch {
        if (!cancelled) setServerStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.card.changesetId, props.card.communityId, props.session]);

  async function applyChangeset(): Promise<void> {
    if (!props.session || isBusy || isDone || !canApply) return;
    setActionState("applying");
    setVerifiedApply(false);
    setErrorMessage(null);
    try {
      if (serverStatus !== "approved") {
        await approveCloudCommunityResourceBuilderChangeset({
          session: props.session,
          communityId: props.card.communityId,
          changesetId: props.card.changesetId,
        });
        setServerStatus("approved");
        setApprovedByCurrentUser(true);
      }
      await applyCloudCommunityResourceBuilderChangeset({
        session: props.session,
        communityId: props.card.communityId,
        changesetId: props.card.changesetId,
      });
      setApprovedByCurrentUser(true);
      try {
        const payload = await getCloudCommunityResourceBuilderChangesetStatus<unknown, Record<string, unknown>>({
          session: props.session,
          communityId: props.card.communityId,
          changesetId: props.card.changesetId,
        });
        const status = asResourceChangesetServerStatus(payload?.status);
        if (status) setServerStatus(status);
        if (status === "applied") {
          setVerifiedApply(true);
          dispatchCommunityResourcesMutated({
            communityId: props.card.communityId,
            changesetId: props.card.changesetId,
            source: "resource_changeset_approval_card",
          });
        } else {
          setErrorMessage("Applied, but resource refresh could not be verified.");
        }
      } catch {
        setServerStatus("applied");
        setErrorMessage("Applied, but resource refresh could not be verified.");
      }
      setActionState("applied");
    } catch (error) {
      setActionState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not apply changes.");
    }
  }

  async function rejectChangeset(): Promise<void> {
    if (!props.session || isBusy || isDone) return;
    setActionState("rejecting");
    setVerifiedApply(false);
    setErrorMessage(null);
    try {
      await rejectCloudCommunityResourceBuilderChangeset({
        session: props.session,
        communityId: props.card.communityId,
        changesetId: props.card.changesetId,
        reason: "Rejected from resource changeset approval card.",
      });
      setServerStatus("rejected");
      setActionState("rejected");
    } catch (error) {
      setActionState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not reject changes.");
    }
  }

  const metaParts = [
    `${props.card.operationCount || props.card.previewItems.length} changes`,
    props.card.warningCount > 0 ? `${props.card.warningCount} warnings` : null,
  ].filter(Boolean);

  return (
    <section className="resource-changeset-card" aria-label="Resource changes proposed">
      <div className="resource-changeset-card-header">
        <div className="resource-changeset-card-title-block">
          <div className="resource-changeset-card-title">Resource changes proposed</div>
          <div className="resource-changeset-card-summary">{props.card.summary}</div>
        </div>
        <div className="resource-changeset-card-actions">
          <button
            type="button"
            className="resource-changeset-icon-action approve"
            aria-label="Apply resource changes"
            title="Apply"
            disabled={isBusy || isDone || !canApply}
            onClick={() => {
              void applyChangeset();
            }}
          >
            <Check size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="resource-changeset-icon-action reject"
            aria-label="Reject resource changes"
            title="Reject"
            disabled={isBusy || isDone}
            onClick={() => {
              void rejectChangeset();
            }}
          >
            <X size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
      {props.card.previewItems.length > 0 ? (
        <div className="resource-changeset-preview-list">
          {props.card.previewItems.map((item) => (
            <div key={item.id} className="resource-changeset-preview-row">
              <span className="resource-changeset-preview-marker">{item.marker}</span>
              <span className="resource-changeset-preview-copy">
                <span className="resource-changeset-preview-title">{item.title}</span>
                {item.preview ? (
                  <span className="resource-changeset-preview-text">{item.preview}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="resource-changeset-card-meta">
        {actionState === "applying" ? "Applying..." : null}
        {actionState === "rejecting" ? "Rejecting..." : null}
        {actionState === "applied" ? (verifiedApply ? "Applied / Verified" : "Applied") : null}
        {actionState === "rejected" ? "Rejected" : null}
        {actionState === "idle" || actionState === "error" ? metaParts.join(" / ") : null}
      </div>
      {errorMessage ? (
        <div className="resource-changeset-card-error" role="alert">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
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

function hasReasoningEntries(entries: RuntimeLiveTimelineEntry[]): boolean {
  return entries.some((entry) => entry.kind === "reasoning" && entry.text.trim());
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
  const narration = useMemo(
    () => narrationForStep(latestWorkStep(steps)),
    [steps],
  );
  const liveTimelineEntries = useMemo(
    () => buildRuntimeLiveTimeline(props.events),
    [props.events],
  );
  const hasModelReasoning = useMemo(
    () => hasReasoningEntries(liveTimelineEntries),
    [liveTimelineEntries],
  );
  const changesetCards = useMemo(
    () => extractResourceChangesetCards(props.events),
    [props.events],
  );
  const fallbackThoughtText = hasModelReasoning ? "" : narration ?? "";
  const displayFallbackThoughtText = useSmoothStreamingText(fallbackThoughtText, {
    active: showActiveIndicators && Boolean(fallbackThoughtText),
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
  const showThinkingFooter = showActiveIndicators && runTiming.finishedAtMs === null;
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
      <div className="resource-changeset-card-stack">
        {changesetCards.map((card) => (
          <ResourceChangesetApprovalCard
            key={card.id}
            card={card}
            session={props.session}
          />
        ))}
      </div>
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
      {displayFallbackThoughtText ? (
        <span className="runtime-thought-snippet runtime-thought-snippet-fallback">
          {displayFallbackThoughtText}
        </span>
      ) : null}
      {liveTimelineEntries.length > 0 ? (
        <div className="runtime-trace-flow">
          {liveTimelineEntries.map((entry) =>
            entry.kind === "reasoning" ? (
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
