export const RUNTIME_CANCELLATION_RETRY_DELAYS_MS = [0, 100, 250, 500, 1_000] as const;

export async function cancelRuntimeRunWithBoundedRetry(params: {
  cancel: () => Promise<boolean>;
  delaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
}): Promise<boolean> {
  const delaysMs = params.delaysMs ?? RUNTIME_CANCELLATION_RETRY_DELAYS_MS;
  const wait = params.wait ?? ((delayMs: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)));

  for (const delayMs of delaysMs) {
    if (delayMs > 0) await wait(delayMs);
    try {
      if (await params.cancel()) return true;
    } catch {
      // A transient startup or transport failure is retried within the same
      // bounded window. Stop remains best-effort after the final attempt.
    }
  }
  return false;
}
