import { internal } from "./_generated/api";
import {
  buildRuntimeTurnContextPacket,
  mapRuntimeWorkspaceTerminalPrompt,
  type RuntimeTurnContextSnapshotV1,
  type RuntimeTurnContextPacket,
} from "../shared/runtimeTurnContextPacket";
import type {
  RuntimeWorkspaceTerminalPrompt,
  ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";
import {
  mergeRuntimeWorkingStateTaskLedger,
  summarizeRuntimeWorkingStateFromEvents,
} from "../shared/runtimeWorkingStateLedger";

type RuntimeStopContext = NonNullable<RuntimeTurnContextPacket["runtimeStop"]>;

export type LoadedRuntimeTurnContext = {
  packet: RuntimeTurnContextPacket;
  threadWorkingState: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals: RuntimeWorkspaceTerminalPrompt[];
};

export type ActiveRuntimeTurnState = {
  runId: string;
  threadId: string;
  projectId: string | null;
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

async function loadProjectBackgroundTerminals(params: {
  ctx: any;
  ownerId: unknown;
  projectId?: string | null;
}): Promise<RuntimeWorkspaceTerminalPrompt[]> {
  const projectId = String(params.projectId ?? "").trim();
  if (!projectId) return [];
  try {
    const terminalSnapshot = await params.ctx.runAction(
      internal.workspaceTerminals.reconcileProjectWorkspaceTerminalsInternal as any,
      {
        ownerId: params.ownerId as any,
        projectId,
      },
    );
    const active = Array.isArray((terminalSnapshot as any)?.active)
      ? (terminalSnapshot as any).active
      : [];
    return active
      .map((terminal: unknown) => mapRuntimeWorkspaceTerminalPrompt(terminal))
      .filter(
        (
          terminal: RuntimeWorkspaceTerminalPrompt | null,
        ): terminal is RuntimeWorkspaceTerminalPrompt => Boolean(terminal),
      );
  } catch {
    return [];
  }
}

async function loadWorkingStateForRun(params: {
  ctx: any;
  ownerId: unknown;
  runId: string;
  latestUserText?: string | null;
  fallbackWorkingState?: ThreadWorkingStatePrompt | null;
  runtimeStop?: RuntimeStopContext | null;
}): Promise<ThreadWorkingStatePrompt | null> {
  try {
    const runEvents = await params.ctx.runQuery(
      internal.threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
      {
        ownerId: params.ownerId as any,
        runId: params.runId,
      },
    );
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

export async function loadRuntimeTurnContextPacketForRun(params: {
  ctx: any;
  ownerId: unknown;
  projectId?: string | null;
  runId?: string | null;
  latestUserText?: string | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  runtimeStop?: RuntimeTurnContextPacket["runtimeStop"];
  summarizeCurrentRunEvents?: boolean;
}): Promise<LoadedRuntimeTurnContext> {
  const runtimeStop = params.runtimeStop ?? null;
  const shouldSummarizeRunEvents =
    Boolean(params.summarizeCurrentRunEvents) &&
    Boolean(String(params.runId ?? "").trim());
  const threadWorkingState =
    shouldSummarizeRunEvents && runtimeStop
      ? await loadWorkingStateForRun({
          ctx: params.ctx,
          ownerId: params.ownerId,
          runId: String(params.runId ?? "").trim(),
          latestUserText: params.latestUserText ?? null,
          fallbackWorkingState: params.threadWorkingState ?? null,
          runtimeStop,
        })
      : params.threadWorkingState ?? null;
  const activeBackgroundTerminals = await loadProjectBackgroundTerminals({
    ctx: params.ctx,
    ownerId: params.ownerId,
    projectId: params.projectId ?? null,
  });
  const packet = buildRuntimeTurnContextPacket({
    latestUserText: params.latestUserText ?? null,
    threadWorkingState,
    activeBackgroundTerminals,
    runtimeStop,
  });
  return {
    packet,
    threadWorkingState,
    activeBackgroundTerminals,
  };
}

export async function loadActiveRuntimeTurnState(params: {
  ctx: any;
  ownerId: unknown;
  threadId: unknown;
}): Promise<ActiveRuntimeTurnState | null> {
  try {
    const state = await params.ctx.runQuery(
      internal.threads.getActiveRuntimeTurnStateInternal as any,
      {
        ownerId: params.ownerId as any,
        threadId: params.threadId as any,
      },
    );
    if (!state || typeof state !== "object") return null;
    const record = state as Record<string, unknown>;
    const runId = String(record.runId ?? "").trim();
    const threadId = String(record.threadId ?? "").trim();
    if (!runId || !threadId || record.status !== "running") return null;
    const pendingUserSteering = Array.isArray(record.pendingUserSteering)
      ? record.pendingUserSteering
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const pending = item as Record<string, unknown>;
            const text = String(pending.text ?? "").trim();
            const receivedAt = Number(pending.receivedAt);
            if (!text || !Number.isFinite(receivedAt)) return null;
            const messageKey = String(pending.messageKey ?? "").trim();
            return {
              text,
              receivedAt: Math.floor(receivedAt),
              ...(messageKey ? { messageKey } : {}),
            };
          })
          .filter(
            (
              item,
            ): item is { text: string; receivedAt: number; messageKey?: string } =>
              Boolean(item),
          )
      : [];
    const activeContextSnapshot =
      record.activeContextSnapshot && typeof record.activeContextSnapshot === "object"
        ? (record.activeContextSnapshot as RuntimeTurnContextSnapshotV1)
        : null;
    const activeContextSnapshotUpdatedAt = Number(record.activeContextSnapshotUpdatedAt);
    const startedAt = Number(record.startedAt);
    const updatedAt = Number(record.updatedAt);
    return {
      runId,
      threadId,
      projectId: String(record.projectId ?? "").trim() || null,
      status: "running",
      pendingUserSteering,
      stopRequestedAt: Number.isFinite(Number(record.stopRequestedAt))
        ? Math.floor(Number(record.stopRequestedAt))
        : null,
      stopReason: String(record.stopReason ?? "").trim() || null,
      activeContextSnapshot,
      activeContextSnapshotUpdatedAt: Number.isFinite(activeContextSnapshotUpdatedAt)
        ? Math.floor(activeContextSnapshotUpdatedAt)
        : null,
      startedAt: Number.isFinite(startedAt) ? Math.floor(startedAt) : 0,
      updatedAt: Number.isFinite(updatedAt) ? Math.floor(updatedAt) : 0,
    };
  } catch {
    return null;
  }
}
