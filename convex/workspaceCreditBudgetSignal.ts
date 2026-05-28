import type { RuntimeWorkspaceSession } from "./workspaceRuntimeSession.ts";

export const WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE = "workspace_credits_exhausted";

export class WorkspaceCreditBudgetExpiredError extends Error {
  readonly code = WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE;

  constructor(message = "This workspace tool budget expired.") {
    super(message);
    this.name = "WorkspaceCreditBudgetExpiredError";
  }
}

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
  const abort = (reason?: unknown) => {
    if (settled) return;
    settled = true;
    controller.abort(reason ?? new WorkspaceCreditBudgetExpiredError());
  };
  const timeout = setTimeout(
    () => abort(new WorkspaceCreditBudgetExpiredError()),
    remainingMs,
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
