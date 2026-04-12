import { internal } from "./_generated/api";

export const USER_CANCELLED_RUNTIME_CODE = "user_cancelled";
const USER_CANCELLED_RUNTIME_MESSAGE = "Run cancelled by user.";
const DEFAULT_RUNTIME_CANCELLATION_POLL_INTERVAL_MS = 750;

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

export async function isRuntimeRunCancelled(params: {
  ctx: any;
  ownerId: any;
  runId: string;
}): Promise<boolean> {
  const runId = String(params.runId ?? "").trim();
  if (!runId) return false;
  const row = await params.ctx.runQuery(
    internal.threads.getRuntimeRunByOwnerRunIdInternal as any,
    {
      ownerId: params.ownerId,
      runId,
    },
  );
  return String((row as { status?: unknown } | null)?.status ?? "").trim() === "cancelled";
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

export async function runAbortableWithRuntimeCancellation<T>(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  operation: (signal: AbortSignal) => Promise<T>;
  pollIntervalMs?: number;
}): Promise<T> {
  await throwIfRuntimeRunCancelled(params);
  const abortController = new AbortController();
  let pollInFlight = false;
  const pollIntervalMs = Math.max(
    100,
    Math.floor(params.pollIntervalMs ?? DEFAULT_RUNTIME_CANCELLATION_POLL_INTERVAL_MS),
  );
  const intervalId = setInterval(() => {
    if (abortController.signal.aborted || pollInFlight) return;
    pollInFlight = true;
    void isRuntimeRunCancelled(params)
      .then((cancelled) => {
        if (cancelled && !abortController.signal.aborted) {
          abortController.abort(new RuntimeRunCancelledError());
        }
      })
      .catch(() => {
        // Ignore polling failures; the next explicit checkpoint will still guard persistence.
      })
      .finally(() => {
        pollInFlight = false;
      });
  }, pollIntervalMs);

  try {
    const result = await params.operation(abortController.signal);
    await throwIfRuntimeRunCancelled(params);
    return result;
  } catch (error) {
    if (abortController.signal.aborted) {
      await throwIfRuntimeRunCancelled(params);
    }
    throw error;
  } finally {
    clearInterval(intervalId);
  }
}
