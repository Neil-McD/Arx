import {
  daytonaHeaders,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import {
  buildDaytonaToolboxBaseCandidates,
  shouldRetryWithAlternateToolboxBase,
} from "./daytonaToolboxExecutor";

type DaytonaComputerUseStatusDto = {
  status?: unknown;
};

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return error instanceof Error && error.name === "AbortError";
}

async function parseDaytonaResponseBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text.trim()) return { text, json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

export async function daytonaComputerUseRequest<TPayload>(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown> | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; payload: TPayload | null; text: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const baseCandidates = buildDaytonaToolboxBaseCandidates(params.toolboxProxyUrl, params.sandboxId);
  const timeoutMs = Math.max(1_000, Math.floor(params.timeoutMs ?? 30_000));
  let lastFailure: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null = null;

  for (let index = 0; index < baseCandidates.length; index += 1) {
    const baseUrl = baseCandidates[index];
    const hasNext = index < baseCandidates.length - 1;
    const abortController = new AbortController();
    const relayAbortFromCaller = () => {
      abortController.abort(
        params.signal?.reason instanceof Error
          ? params.signal.reason
          : new Error("Daytona computer use request aborted."),
      );
    };
    if (params.signal?.aborted) {
      relayAbortFromCaller();
    } else if (params.signal) {
      params.signal.addEventListener("abort", relayAbortFromCaller, { once: true });
    }
    const abortTimeout = setTimeout(() => {
      abortController.abort(new Error(`Daytona computer use request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${params.path}`, {
        method: params.method,
        headers: daytonaHeaders(params.config, true),
        signal: abortController.signal,
        ...(params.body ? { body: JSON.stringify(params.body) } : null),
      });
      const { text, json } = await parseDaytonaResponseBody(response);
      if (!response.ok) {
        const failure = {
          status: response.status,
          code: response.status === 404 ? "computer_use_unavailable" : "runner_unavailable",
          message: `Daytona computer use request failed (${response.status}).`,
          details: {
            response_text: text.slice(0, 2000),
            base_url: baseUrl,
          },
        };
        if (hasNext && shouldRetryWithAlternateToolboxBase(response.status, text)) {
          lastFailure = failure;
          continue;
        }
        return { ok: false, ...failure };
      }
      return {
        ok: true,
        payload: (json as TPayload | null) ?? null,
        text,
      };
    } catch (error) {
      lastFailure = {
        status: 503,
        code: isAbortError(error) ? "daytona_computer_use_timeout" : "runner_unavailable",
        message:
          isAbortError(error)
            ? `Daytona computer use request timed out after ${Math.floor(timeoutMs / 1000)}s.`
            : error instanceof Error
              ? error.message
              : "Failed to call Daytona computer use endpoint.",
        details: {
          base_url: baseUrl,
          timeout_ms: timeoutMs,
        },
      };
    } finally {
      if (params.signal) {
        params.signal.removeEventListener("abort", relayAbortFromCaller);
      }
      clearTimeout(abortTimeout);
    }
  }

  if (lastFailure) return { ok: false, ...lastFailure };
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Daytona computer use request failed with no usable endpoint.",
  };
}

export async function ensureComputerUseStarted(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> }
> {
  const status = await daytonaComputerUseRequest<DaytonaComputerUseStatusDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: "/computeruse/process-status",
    signal: params.signal,
  });
  if (status.ok && String(status.payload?.status ?? "").trim().toLowerCase() === "running") {
    return { ok: true };
  }
  const started = await daytonaComputerUseRequest({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "POST",
    path: "/computeruse/start",
    signal: params.signal,
  });
  if (!started.ok) return started;
  return { ok: true };
}

export async function getDaytonaComputerUseStatus(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; status: string }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> }
> {
  const status = await daytonaComputerUseRequest<DaytonaComputerUseStatusDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: "/computeruse/status",
    signal: params.signal,
  });
  if (!status.ok) return status;
  return {
    ok: true,
    status: String(status.payload?.status ?? "").trim().toLowerCase(),
  };
}
