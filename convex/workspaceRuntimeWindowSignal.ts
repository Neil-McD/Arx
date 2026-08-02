import type { RuntimeWorkspaceSession } from "./workspaceRuntimeSession.ts";

export const WORKSPACE_RUNTIME_WINDOW_EXPIRED_CODE = "workspace_runtime_window_expired";

export class WorkspaceRuntimeWindowExpiredError extends Error {
  readonly code = WORKSPACE_RUNTIME_WINDOW_EXPIRED_CODE;

  constructor(message = "This workspace runtime window expired.") {
    super(message);
    this.name = "WorkspaceRuntimeWindowExpiredError";
  }
}

export function isWorkspaceRuntimeWindowExpired(
  session: RuntimeWorkspaceSession | null | undefined,
): boolean {
  const expiresAt = Number(session?.creditBudgetExpiresAt ?? 0);
  return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt;
}

export function buildWorkspaceRuntimeWindowSignal(
  session: RuntimeWorkspaceSession,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; cleanup: () => void } {
  const expiresAt = Number(session.creditBudgetExpiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { signal: parentSignal, cleanup: () => {} };
  }
  const controller = new AbortController();
  let settled = false;
  const cleanupFns: Array<() => void> = [];
  const abort = (reason?: unknown) => {
    if (settled) return;
    settled = true;
    controller.abort(reason ?? new WorkspaceRuntimeWindowExpiredError());
  };
  const timeout = setTimeout(
    () => abort(new WorkspaceRuntimeWindowExpiredError()),
    Math.max(0, expiresAt - Date.now()),
  );
  cleanupFns.push(() => clearTimeout(timeout));
  if (parentSignal) {
    if (parentSignal.aborted) {
      abort(parentSignal.reason);
    } else {
      const onAbort = () => abort(parentSignal.reason);
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
