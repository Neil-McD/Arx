type TimeoutRef = { current: number | null };
type SupabaseRefreshableSession = {
  expires_at: number;
  refresh_token: string;
};
type SessionRef<TSession> = {
  current: TSession | null;
};

export function computeSupabaseRefreshDelayMs(params: {
  expiresAtSec: number;
  nowSec?: number;
  leadSec?: number;
  minSec?: number;
}): number {
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const leadSec = params.leadSec ?? 90;
  const minSec = params.minSec ?? 5;
  const refreshAtSec = Math.max(params.expiresAtSec - leadSec, nowSec + minSec);
  return Math.max((refreshAtSec - nowSec) * 1000, 0);
}

export function clearSupabaseRefreshTimer(timeoutRef: TimeoutRef): void {
  if (timeoutRef.current) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

export function scheduleSupabaseRefreshTimeout(params: {
  timeoutRef: TimeoutRef;
  delayMs: number;
  triggerRefresh: () => void;
}): void {
  clearSupabaseRefreshTimer(params.timeoutRef);
  params.timeoutRef.current = window.setTimeout(() => {
    params.triggerRefresh();
  }, Math.max(0, params.delayMs));
}

export function scheduleSupabaseRefreshTimer(params: {
  timeoutRef: TimeoutRef;
  expiresAtSec: number;
  triggerRefresh: () => void;
}): number {
  const delayMs = computeSupabaseRefreshDelayMs({ expiresAtSec: params.expiresAtSec });
  scheduleSupabaseRefreshTimeout({
    timeoutRef: params.timeoutRef,
    delayMs,
    triggerRefresh: params.triggerRefresh,
  });
  return delayMs;
}

export async function refreshSupabaseSessionIfNearExpiry(params: {
  session: SupabaseRefreshableSession | null | undefined;
  refreshLocked: (refreshToken: string) => Promise<unknown>;
  nowSec?: number;
  thresholdSec?: number;
}): Promise<boolean> {
  const session = params.session ?? null;
  if (!session) return false;
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const thresholdSec = params.thresholdSec ?? 60;
  if (session.expires_at > nowSec + thresholdSec) return false;
  await params.refreshLocked(session.refresh_token);
  return true;
}

export function bindSupabaseFocusRefresh<TSession extends SupabaseRefreshableSession>(params: {
  sessionRef: SessionRef<TSession>;
  refreshLocked: (refreshToken: string) => Promise<unknown>;
  onFocusWithSession: (session: TSession) => void;
  thresholdSec?: number;
}): () => void {
  const onFocus = () => {
    const current = params.sessionRef.current;
    if (!current) return;
    void refreshSupabaseSessionIfNearExpiry({
      session: current,
      refreshLocked: params.refreshLocked,
      thresholdSec: params.thresholdSec ?? 60,
    });
    params.onFocusWithSession(current);
  };
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}
