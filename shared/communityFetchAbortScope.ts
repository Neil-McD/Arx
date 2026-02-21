export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "AbortError";
}

export function beginScopedAbortRequest(params: {
  inFlightByKind: Map<string, AbortController>;
  kind: string;
}): AbortController {
  const { inFlightByKind, kind } = params;
  const prev = inFlightByKind.get(kind);
  if (prev) {
    try {
      prev.abort();
    } catch {
      // ignore abort errors
    }
  }
  const controller = new AbortController();
  inFlightByKind.set(kind, controller);
  return controller;
}

export function finishScopedAbortRequest(params: {
  inFlightByKind: Map<string, AbortController>;
  kind: string;
  controller: AbortController;
}): void {
  const { inFlightByKind, kind, controller } = params;
  const active = inFlightByKind.get(kind);
  if (active === controller) {
    inFlightByKind.delete(kind);
  }
}

export function abortAllScopedRequests(inFlightByKind: Map<string, AbortController>): void {
  for (const controller of inFlightByKind.values()) {
    try {
      controller.abort();
    } catch {
      // ignore abort errors
    }
  }
  inFlightByKind.clear();
}
