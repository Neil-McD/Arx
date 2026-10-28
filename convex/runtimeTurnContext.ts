import { internal } from "./_generated/api";
import {
  buildRuntimeRecentToolAttemptsFromEvents,
  buildRuntimeTurnContextPacket,
  type RuntimeRecentToolAttemptPrompt,
  type RuntimeTurnContextSnapshotV1,
  type RuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket";
import type { RuntimeContextRunEvent } from "../shared/runtimeContextFragments";
import type { ThreadWorkingStatePrompt } from "../shared/runtimePrompt";
import type { RuntimeTurnEnvelopeV1 } from "../shared/runtimeTurnEnvelope";
import {
  mergeRuntimeWorkingStateTaskLedger,
  summarizeRuntimeWorkingStateFromEvents,
} from "../shared/runtimeWorkingStateLedger";

type RuntimeStopContext = NonNullable<RuntimeTurnContextPacket["runtimeStop"]>;

export type LoadedRuntimeTurnContext = {
  packet: RuntimeTurnContextPacket;
  threadWorkingState: ThreadWorkingStatePrompt | null;
};

export type ActiveRuntimeTurnState = {
  runId: string;
  threadId: string;
  status: "running";
  pendingUserSteering: Array<{
    text: string;
    receivedAt: number;
    messageKey?: string;
  }>;
  stopRequestedAt: number | null;
  stopReason: string | null;
  activeContextSnapshot: RuntimeTurnContextSnapshotV1 | null;
  activeContextSnapshotUpdatedAt: number | null;
  startedAt: number;
  updatedAt: number;
};

async function loadWorkingStateForRun(params: {
  ctx: any;
  ownerId: unknown;
  runId: string;
  latestUserText?: string | null;
  fallbackWorkingState?: ThreadWorkingStatePrompt | null;
  runtimeStop?: RuntimeStopContext | null;
  events?: RuntimeContextRunEvent[] | null;
}): Promise<ThreadWorkingStatePrompt | null> {
  try {
    const runEvents =
      params.events ??
      (await params.ctx.runQuery(
        internal.threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
        {
          ownerId: params.ownerId as any,
          runId: params.runId,
        },
      ));
    const currentWorkingState = summarizeRuntimeWorkingStateFromEvents({
      latestUserText: params.latestUserText ?? null,
      runStatus: params.runtimeStop?.status ?? "ok",
      runReason: params.runtimeStop?.reason ?? null,
      runErrorMessage: params.runtimeStop?.errorMessage ?? null,
      events: Array.isArray(runEvents) ? runEvents : [],
      nowMs: Date.now(),
    });
    if (!params.runtimeStop) {
      currentWorkingState.status = "in_progress";
      currentWorkingState.currentStep = "Run is in progress.";
      currentWorkingState.lastResult = "Run is in progress.";
      currentWorkingState.blocker = undefined;
      currentWorkingState.openIssue = undefined;
      currentWorkingState.nextAction = undefined;
    }
    return mergeRuntimeWorkingStateTaskLedger({
      previous: params.fallbackWorkingState,
      current: currentWorkingState,
    });
  } catch {
    return params.fallbackWorkingState ?? null;
  }
}

async function loadRuntimeRunEventsForContext(params: {
  ctx: any;
  ownerId: unknown;
  runId?: string | null;
}): Promise<RuntimeContextRunEvent[]> {
  const runId = String(params.runId ?? "").trim();
  if (!runId) return [];
  try {
    const rows = await params.ctx.runQuery(
      internal.threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
      {
        ownerId: params.ownerId as any,
        runId,
      },
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((row: unknown) => {
      const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        seq: typeof record.seq === "number" ? record.seq : null,
        eventType: String(record.eventType ?? ""),
        eventKey: typeof record.eventKey === "string" ? record.eventKey : null,
        payload: record.payload,
        createdAt: typeof record.createdAt === "number" ? record.createdAt : null,
      };
    }).filter((event) => event.eventType);
  } catch {
    return [];
  }
}

async function loadRecentToolAttempts(params: {
  ctx: any;
  ownerId: unknown;
  threadId?: unknown;
  runId?: string | null;
}): Promise<RuntimeRecentToolAttemptPrompt[]> {
  try {
    const threadId = String(params.threadId ?? "").trim();
    const runId = String(params.runId ?? "").trim();
    const events = threadId
      ? await params.ctx.runQuery(
          internal.threads.listRecentRuntimeToolFinishedEventsByOwnerThreadIdInternal as any,
          {
            ownerId: params.ownerId as any,
            threadId: params.threadId as any,
            currentRunId: runId || undefined,
            limit: 40,
          },
        )
      : runId
        ? await params.ctx.runQuery(
            internal.threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
            {
              ownerId: params.ownerId as any,
              runId,
            },
          )
        : [];
    return buildRuntimeRecentToolAttemptsFromEvents({
      events: Array.isArray(events) ? events : [],
      limit: 8,
    });
  } catch {
    return [];
  }
}

export async function loadRuntimeTurnContextPacketForRun(params: {
  ctx: any;
  ownerId: unknown;
  threadId?: unknown;
  runId?: string | null;
  latestUserText?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  runtimeStop?: RuntimeTurnContextPacket["runtimeStop"];
  summarizeCurrentRunEvents?: boolean;
}): Promise<LoadedRuntimeTurnContext> {
  const runtimeStop = params.runtimeStop ?? null;
  const currentRunId = String(params.runId ?? "").trim();
  const runtimeRunEvents = await loadRuntimeRunEventsForContext({
    ctx: params.ctx,
    ownerId: params.ownerId,
    runId: currentRunId || null,
  });
  const shouldSummarizeRunEvents =
    Boolean(params.summarizeCurrentRunEvents) &&
    Boolean(currentRunId);
  const threadWorkingState =
    shouldSummarizeRunEvents && runtimeStop
      ? await loadWorkingStateForRun({
          ctx: params.ctx,
          ownerId: params.ownerId,
          runId: currentRunId,
          latestUserText: params.latestUserText ?? null,
          fallbackWorkingState: params.threadWorkingState ?? null,
          runtimeStop,
          events: runtimeRunEvents,
        })
      : params.threadWorkingState ?? null;
  const recentToolAttempts = await loadRecentToolAttempts({
    ctx: params.ctx,
    ownerId: params.ownerId,
    threadId: params.threadId,
    runId: params.runId ?? null,
  });
  const packet = buildRuntimeTurnContextPacket({
    latestUserText: params.latestUserText ?? null,
    runtimeTurnEnvelope: params.runtimeTurnEnvelope ?? null,
    threadWorkingState,
    recentToolAttempts,
    runtimeRunEvents,
    runtimeStop,
  });
  return {
    packet,
    threadWorkingState,
  };
}
