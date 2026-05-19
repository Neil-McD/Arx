import { daytonaHeaders, type DaytonaConfig } from "./daytonaSandboxClient";
import {
  buildDaytonaToolboxBaseCandidates,
  shouldRetryWithAlternateToolboxBase,
} from "./daytonaToolboxExecutor";
import { normalizeDaytonaProcessSessionCommandLogsPayload } from "../shared/daytonaProcessSessionLogs.ts";

type DaytonaProcessSessionCommandDto = {
  id?: unknown;
  cmdId?: unknown;
  commandId?: unknown;
  command?: unknown;
  exitCode?: unknown;
  status?: unknown;
};

export type DaytonaProcessSessionDto = {
  sessionId?: unknown;
  id?: unknown;
  commands?: unknown;
};

type DaytonaProcessSessionLogsDto = {
  stdout?: unknown;
  stderr?: unknown;
  output?: unknown;
  logs?: unknown;
  data?: unknown;
  result?: unknown;
  text?: unknown;
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

function toStringValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function toExitCode(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function normalizeCommandStatus(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  return normalized || null;
}

function isCommandStatusActive(status: string | null): boolean {
  return (
    status === "created" ||
    status === "queued" ||
    status === "pending" ||
    status === "starting" ||
    status === "started" ||
    status === "running" ||
    status === "in-progress"
  );
}

function isCommandStatusTerminal(status: string | null): boolean {
  return (
    status === "done" ||
    status === "complete" ||
    status === "completed" ||
    status === "exited" ||
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  );
}

function normalizeSessionListPayload(payload: unknown): DaytonaProcessSessionDto[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is DaytonaProcessSessionDto => !!row && typeof row === "object");
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["sessions", "items", "data", "rows"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((row): row is DaytonaProcessSessionDto => !!row && typeof row === "object");
    }
  }
  return [];
}

function normalizeSessionCommandList(value: unknown): DaytonaProcessSessionCommandDto[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is DaytonaProcessSessionCommandDto => !!row && typeof row === "object",
  );
}

function readCommandId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return (
    toStringValue(record.cmdId) ??
    toStringValue(record.commandId) ??
    toStringValue(record.id)
  );
}

async function daytonaProcessSessionRequest<TPayload>(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: Record<string, unknown> | null;
  timeoutMs?: number;
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
    const abortTimeout = setTimeout(() => {
      abortController.abort(new Error(`Daytona process session request timed out after ${timeoutMs}ms.`));
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
          code: response.status === 404 ? "terminal_not_found" : "runner_unavailable",
          message: `Daytona process session request failed (${response.status}).`,
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
        code: isAbortError(error) ? "daytona_process_session_timeout" : "runner_unavailable",
        message:
          isAbortError(error)
            ? `Daytona process session request timed out after ${Math.floor(timeoutMs / 1000)}s.`
            : error instanceof Error
              ? error.message
              : "Failed to call Daytona process session endpoint.",
        details: {
          base_url: baseUrl,
          timeout_ms: timeoutMs,
        },
      };
    } finally {
      clearTimeout(abortTimeout);
    }
  }

  if (lastFailure) return { ok: false, ...lastFailure };
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Daytona process session request failed with no usable execution endpoint.",
  };
}

export async function createDaytonaProcessSession(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  sessionId: string;
}): Promise<
  | { ok: true; sessionId: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<DaytonaProcessSessionDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "POST",
    path: "/process/session",
    body: {
      sessionId: params.sessionId,
    },
  });
  if (!response.ok) return response;
  return {
    ok: true,
    sessionId:
      toStringValue(response.payload?.sessionId) ??
      toStringValue(response.payload?.id) ??
      params.sessionId,
  };
}

export async function listDaytonaProcessSessions(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
}): Promise<
  | { ok: true; sessions: DaytonaProcessSessionDto[] }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<unknown>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: "/process/session",
  });
  if (!response.ok) return response;
  return {
    ok: true,
    sessions: normalizeSessionListPayload(response.payload),
  };
}

export async function getDaytonaProcessSession(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  sessionId: string;
}): Promise<
  | { ok: true; session: DaytonaProcessSessionDto }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<DaytonaProcessSessionDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: `/process/session/${encodeURIComponent(params.sessionId)}`,
  });
  if (!response.ok) return response;
  return {
    ok: true,
    session: (response.payload ?? {}) as DaytonaProcessSessionDto,
  };
}

export async function executeDaytonaProcessSessionCommand(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  sessionId: string;
  command: string;
  cwd?: string;
  runAsync?: boolean;
}): Promise<
  | {
      ok: true;
      commandId: string;
      exitCode: number | null;
      outputText: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<Record<string, unknown>>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "POST",
    path: `/process/session/${encodeURIComponent(params.sessionId)}/exec`,
    body: {
      command: params.command,
      runAsync: params.runAsync !== false,
      ...(params.cwd ? { cwd: params.cwd } : null),
    },
  });
  if (!response.ok) return response;
  const payload = response.payload ?? {};
  const commandId = readCommandId(payload);
  if (!commandId) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona session command ID is missing from execute response.",
    };
  }
  return {
    ok: true,
    commandId,
    exitCode: toExitCode((payload as Record<string, unknown>).exitCode),
    outputText:
      toStringValue((payload as Record<string, unknown>).output) ??
      toStringValue((payload as Record<string, unknown>).stdout) ??
      toStringValue((payload as Record<string, unknown>).result) ??
      "",
  };
}

export async function sendDaytonaProcessSessionCommandInput(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  sessionId: string;
  commandId: string;
  data: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<Record<string, unknown>>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "POST",
    path: `/process/session/${encodeURIComponent(params.sessionId)}/command/${encodeURIComponent(params.commandId)}/input`,
    body: {
      data: params.data,
    },
  });
  if (!response.ok) return response;
  return { ok: true };
}

export async function getDaytonaProcessSessionCommandLogs(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  sessionId: string;
  commandId: string;
}): Promise<
  | { ok: true; stdout: string; stderr: string; output: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<DaytonaProcessSessionLogsDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "GET",
    path: `/process/session/${encodeURIComponent(params.sessionId)}/command/${encodeURIComponent(params.commandId)}/logs`,
  });
  if (!response.ok) return response;
  const { stdout, stderr, output } =
    normalizeDaytonaProcessSessionCommandLogsPayload(
      response.payload,
      response.text,
    );
  return {
    ok: true,
    stdout,
    stderr,
    output,
  };
}

export async function deleteDaytonaProcessSession(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  sessionId: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const response = await daytonaProcessSessionRequest<Record<string, unknown>>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    method: "DELETE",
    path: `/process/session/${encodeURIComponent(params.sessionId)}`,
  });
  if (!response.ok && response.code !== "terminal_not_found") return response;
  return { ok: true };
}

export function findDaytonaProcessSessionCommand(
  session: DaytonaProcessSessionDto,
  commandId: string,
): DaytonaProcessSessionCommandDto | null {
  const commands = normalizeSessionCommandList(session.commands);
  const exact = commands.find((command) => readCommandId(command) === commandId);
  return exact ?? commands[commands.length - 1] ?? null;
}

export function readDaytonaProcessSessionCommandExitCode(
  command: DaytonaProcessSessionCommandDto | null,
): number | null {
  if (!command) return null;
  const status = normalizeCommandStatus(command.status);
  if (isCommandStatusActive(status)) {
    return null;
  }
  const exitCode = toExitCode(command.exitCode);
  if (exitCode === 254 && !isCommandStatusTerminal(status)) {
    return null;
  }
  return exitCode;
}
