type TimeoutRef = { current: number | null };
type ExpiringSessionLike = {
  expires_at: number;
};
function computeRefreshDelayMs(params: {
  expiresAtSec: number;
  nowSec?: number;
  leadSec?: number;
  minSec?: number;
}): number {
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const leadSec = params.leadSec ?? 90;
  const minSec = params.minSec ?? 5;
  if (params.expiresAtSec <= nowSec + leadSec) {
    return 0;
  }
  const refreshAtSec = Math.max(params.expiresAtSec - leadSec, nowSec + minSec);
  return Math.max((refreshAtSec - nowSec) * 1000, 0);
}

export function clearRefreshTimer(timeoutRef: TimeoutRef): void {
  if (timeoutRef.current) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

export function scheduleRefreshTimeout(params: {
  timeoutRef: TimeoutRef;
  delayMs: number;
  triggerRefresh: () => void;
}): void {
  clearRefreshTimer(params.timeoutRef);
  params.timeoutRef.current = window.setTimeout(() => {
    params.triggerRefresh();
  }, Math.max(0, params.delayMs));
}

export function scheduleRefreshTimer(params: {
  timeoutRef: TimeoutRef;
  expiresAtSec: number;
  triggerRefresh: () => void;
}): number {
  const delayMs = computeRefreshDelayMs({ expiresAtSec: params.expiresAtSec });
  scheduleRefreshTimeout({
    timeoutRef: params.timeoutRef,
    delayMs,
    triggerRefresh: params.triggerRefresh,
  });
  return delayMs;
}

export async function refreshSessionIfNearExpiry(params: {
  session: ExpiringSessionLike | null | undefined;
  refreshLocked: () => Promise<unknown>;
  nowSec?: number;
  thresholdSec?: number;
}): Promise<boolean> {
  const session = params.session ?? null;
  if (!session) return false;
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const thresholdSec = params.thresholdSec ?? 60;
  if (session.expires_at > nowSec + thresholdSec) return false;
  await params.refreshLocked();
  return true;
}
