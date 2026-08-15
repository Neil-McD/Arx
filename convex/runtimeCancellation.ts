import { internal } from "./_generated/api";

export const USER_CANCELLED_RUNTIME_CODE = "user_cancelled";
export const RUNTIME_RUN_NOT_ACTIVE_CODE = "runtime_run_not_active";
const USER_CANCELLED_RUNTIME_MESSAGE = "Run cancelled by user.";
const RUNTIME_RUN_NOT_ACTIVE_MESSAGE = "This runtime run is no longer active.";
const DEFAULT_RUNTIME_CANCELLATION_POLL_INTERVAL_MS = 750;
const DEFAULT_RUNTIME_HEARTBEAT_INTERVAL_MS = 60_000;

type RuntimeRunExecutionStatus =
  | "running"
  | "ok"
  | "error"
  | "cancelled"
  | "missing"
  | "invalid";

export class RuntimeRunCancelledError extends Error {
  readonly code = USER_CANCELLED_RUNTIME_CODE;

  constructor(message = USER_CANCELLED_RUNTIME_MESSAGE) {
    super(message);
    this.name = "RuntimeRunCancelledError";
  }
}

export function isRuntimeRunCancelledError(error: unknown): error is RuntimeRunCancelledError {
  return error instanceof RuntimeRunCancelledError;
}

export class RuntimeRunInactiveError extends Error {
  readonly code = RUNTIME_RUN_NOT_ACTIVE_CODE;
  readonly runStatus: RuntimeRunExecutionStatus;

  constructor(runStatus: RuntimeRunExecutionStatus) {
    super(RUNTIME_RUN_NOT_ACTIVE_MESSAGE);
    this.name = "RuntimeRunInactiveError";
    this.runStatus = runStatus;
  }
}

export function isRuntimeRunInactiveError(error: unknown): error is RuntimeRunInactiveError {
  return error instanceof RuntimeRunInactiveError;
}

export function isRuntimeRunStoppedError(
  error: unknown,
): error is RuntimeRunCancelledError | RuntimeRunInactiveError {
  return isRuntimeRunCancelledError(error) || isRuntimeRunInactiveError(error);
}

async function getRuntimeRunExecutionStatus(params: {
  ctx: any;
  ownerId: any;
  runId: string;
}): Promise<RuntimeRunExecutionStatus> {
  const runId = String(params.runId ?? "").trim();
  if (!runId) return "missing";
  const row = await params.ctx.runQuery(
    internal.threads.getRuntimeRunByOwnerRunIdInternal as any,
    {
      ownerId: params.ownerId,
      runId,
    },
  );
  if (!row) return "missing";
  const status = String((row as { status?: unknown }).status ?? "").trim();
  if (
    status === "running" ||
    status === "ok" ||
    status === "error" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "invalid";
}

export async function isRuntimeRunCancelled(params: {
  ctx: any;
  ownerId: any;
  runId: string;
}): Promise<boolean> {
  return (await getRuntimeRunExecutionStatus(params)) === "cancelled";
}

export async function throwIfRuntimeRunCancelled(params: {
  ctx: any;
  ownerId: any;
  runId: string;
}): Promise<void> {
  if (await isRuntimeRunCancelled(params)) {
    throw new RuntimeRunCancelledError();
  }
}

export async function throwIfRuntimeRunCannotContinue(params: {
  ctx: any;
  ownerId: any;
  runId: string;
}): Promise<void> {
  const status = await getRuntimeRunExecutionStatus(params);
  if (status === "running") return;
  if (status === "cancelled") throw new RuntimeRunCancelledError();
  throw new RuntimeRunInactiveError(status);
}

export async function runAbortableWithRuntimeCancellation<T>(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  operation: (signal: AbortSignal) => Promise<T>;
  touchHeartbeat?: () => Promise<void>;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
}): Promise<T> {
  await throwIfRuntimeRunCannotContinue(params);
  if (params.touchHeartbeat) {
    try {
      await params.touchHeartbeat();
    } catch {
      // Heartbeats are liveness hints. The active-run status remains authoritative.
    }
    await throwIfRuntimeRunCannotContinue(params);
  }
  const abortController = new AbortController();
  let pollInFlight = false;
  let stoppedError: RuntimeRunCancelledError | RuntimeRunInactiveError | null = null;
  const pollIntervalMs = Math.max(
    100,
    Math.floor(params.pollIntervalMs ?? DEFAULT_RUNTIME_CANCELLATION_POLL_INTERVAL_MS),
  );
  const heartbeatIntervalMs = Math.max(
    pollIntervalMs,
    Math.floor(params.heartbeatIntervalMs ?? DEFAULT_RUNTIME_HEARTBEAT_INTERVAL_MS),
  );
  let nextHeartbeatAt = Date.now() + heartbeatIntervalMs;
  const intervalId = setInterval(() => {
    if (abortController.signal.aborted || pollInFlight) return;
    pollInFlight = true;
    void (async () => {
      if (params.touchHeartbeat && Date.now() >= nextHeartbeatAt) {
        nextHeartbeatAt = Date.now() + heartbeatIntervalMs;
        try {
          await params.touchHeartbeat();
        } catch {
          // A later status poll still enforces the durable run authority.
        }
      }
      try {
        await throwIfRuntimeRunCannotContinue(params);
      } catch (error) {
        if (!isRuntimeRunStoppedError(error)) throw error;
        stoppedError = error;
        if (!abortController.signal.aborted) abortController.abort(error);
      }
    })()
      .catch(() => {
        // Ignore polling failures; the next explicit checkpoint will still guard persistence.
      })
      .finally(() => {
        pollInFlight = false;
      });
  }, pollIntervalMs);

  try {
    const result = await params.operation(abortController.signal);
    if (stoppedError) throw stoppedError;
    await throwIfRuntimeRunCannotContinue(params);
    return result;
  } catch (error) {
    if (stoppedError) throw stoppedError;
    if (abortController.signal.aborted) await throwIfRuntimeRunCannotContinue(params);
    throw error;
  } finally {
    clearInterval(intervalId);
  }
}
