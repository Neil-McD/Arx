import type { RuntimeWorkspaceSession } from "./workspaceRuntimeSession.ts";

export function isWorkspaceCreditBudgetExpired(
  session: RuntimeWorkspaceSession | null | undefined,
): boolean {
  const expiresAt = Number(session?.creditBudgetExpiresAt ?? 0);
  return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt;
}

export function buildWorkspaceCreditBudgetSignal(
  session: RuntimeWorkspaceSession,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; cleanup: () => void } {
  const expiresAt = Number(session.creditBudgetExpiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { signal: parentSignal, cleanup: () => {} };
  }
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const controller = new AbortController();
  let settled = false;
  const cleanupFns: Array<() => void> = [];
  const abort = () => {
    if (settled) return;
    settled = true;
    controller.abort();
  };
  const timeout = setTimeout(abort, remainingMs);
  cleanupFns.push(() => clearTimeout(timeout));
  if (parentSignal) {
    if (parentSignal.aborted) {
      abort();
    } else {
      const onAbort = () => abort();
      parentSignal.addEventListener("abort", onAbort, { once: true });
      cleanupFns.push(() => parentSignal.removeEventListener("abort", onAbort));
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      settled = true;
      for (const cleanup of cleanupFns) cleanup();
    },
  };
}
