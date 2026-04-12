import {
  DEFAULT_DAYTONA_SANDBOX_CPU,
  DEFAULT_DAYTONA_SANDBOX_DISK_GIB,
  DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB,
  normalizePositiveInteger,
} from "../shared/workspaceCredits";
import { formatLogPreview, logStructuredError } from "./errorLogging";

export type DaytonaConfig = {
  apiBaseUrl: string;
  apiKey: string;
  orgId: string | null;
  target: string | null;
  snapshot: string | null;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
  autoStopInterval: number;
  autoDeleteInterval: number;
};

export type DaytonaSandboxApiDto = {
  id?: string | null;
  state?: string | null;
  target?: string | null;
  labels?: Record<string, unknown> | null;
  cpu?: unknown;
  memory?: unknown;
  disk?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

export type DaytonaToolboxProxyUrlDto = {
  url?: string | null;
};

type DaytonaSignedPreviewUrlDto = {
  url?: string | null;
  token?: string | null;
};

type DaytonaPreviewUrlDto = {
  url?: string | null;
  token?: string | null;
};

export const DAYTONA_WORKSPACE_ROOT = "/home/daytona/workspace";

const DAYTONA_AUTO_STOP_INTERVAL_DEFAULT_MINUTES = 1;
const DAYTONA_AUTO_DELETE_INTERVAL_DEFAULT_MINUTES = 0;

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  return normalizePositiveInteger(raw, fallback, 0);
}

function normalizeDaytonaApiBaseUrl(rawUrl: string): string | null {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const cleanedPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = cleanedPath.length === 0 ? "/api" : cleanedPath;
  return parsed.toString().replace(/\/+$/, "");
}

export function loadDaytonaConfig():
  | { ok: true; config: DaytonaConfig }
  | { ok: false; code: string; message: string } {
  const apiKey = readEnv("DAYTONA_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      code: "runner_unavailable",
      message: "Daytona runner is unavailable. Missing DAYTONA_API_KEY.",
    };
  }
  const apiBaseUrl = normalizeDaytonaApiBaseUrl(readEnv("DAYTONA_API_URL"));
  if (!apiBaseUrl) {
    return {
      ok: false,
      code: "runner_unavailable",
      message:
        "Daytona runner is unavailable. DAYTONA_API_URL is missing or invalid.",
    };
  }
  return {
    ok: true,
    config: {
      apiBaseUrl,
      apiKey,
      orgId: readEnv("DAYTONA_ORG_ID") || null,
      target: readEnv("DAYTONA_TARGET") || null,
      snapshot: readEnv("DAYTONA_SNAPSHOT") || null,
      sandboxCpu: normalizePositiveInteger(
        readEnv("DAYTONA_SANDBOX_CPU"),
        DEFAULT_DAYTONA_SANDBOX_CPU,
      ),
      sandboxMemoryGiB: normalizePositiveInteger(
        readEnv("DAYTONA_SANDBOX_MEMORY_GIB"),
        DEFAULT_DAYTONA_SANDBOX_MEMORY_GIB,
      ),
      sandboxDiskGiB: normalizePositiveInteger(
        readEnv("DAYTONA_SANDBOX_DISK_GIB"),
        DEFAULT_DAYTONA_SANDBOX_DISK_GIB,
      ),
      autoStopInterval: parseIntegerEnv(
        "DAYTONA_AUTO_STOP_INTERVAL_MINUTES",
        DAYTONA_AUTO_STOP_INTERVAL_DEFAULT_MINUTES,
      ),
      autoDeleteInterval: parseIntegerEnv(
        "DAYTONA_AUTO_DELETE_INTERVAL_MINUTES",
        DAYTONA_AUTO_DELETE_INTERVAL_DEFAULT_MINUTES,
      ),
    },
  };
}

export function daytonaHeaders(
  config: DaytonaConfig,
  includeJsonContentType = true,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (includeJsonContentType) headers["Content-Type"] = "application/json";
  if (config.orgId) headers["X-Daytona-Organization-ID"] = config.orgId;
  return headers;
}

async function parseDaytonaResponseBody(
  response: Response,
): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text.trim()) return { text, json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

async function daytonaApiRequest<T>(params: {
  config: DaytonaConfig;
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown> | null;
}): Promise<
  | { ok: true; payload: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  let response: Response;
  try {
    response = await fetch(`${params.config.apiBaseUrl}${params.path}`, {
      method: params.method,
      headers: daytonaHeaders(params.config, true),
      ...(params.body ? { body: JSON.stringify(params.body) } : null),
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message:
        error instanceof Error ? error.message : "Daytona API request failed.",
    };
  }
  const { text, json } = await parseDaytonaResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: `Daytona API ${params.method} ${params.path} failed (${response.status}).`,
      details: {
        response_text: text.slice(0, 2000),
      },
    };
  }
  if (!json || typeof json !== "object") {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: `Daytona API ${params.path} returned invalid JSON.`,
    };
  }
  return { ok: true, payload: json as T };
}

function normalizeDaytonaSandboxListPayload(
  payload: unknown,
): DaytonaSandboxApiDto[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is DaytonaSandboxApiDto => !!row && typeof row === "object",
    );
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["sandboxes", "items", "data", "rows"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (row): row is DaytonaSandboxApiDto => !!row && typeof row === "object",
      );
    }
  }
  return [];
}

function isDaytonaStartedState(
  daytonaState: string | null | undefined,
): boolean {
  return (
    String(daytonaState ?? "")
      .trim()
      .toLowerCase() === "started"
  );
}

function isDaytonaStoppedState(
  daytonaState: string | null | undefined,
): boolean {
  return (
    String(daytonaState ?? "")
      .trim()
      .toLowerCase() === "stopped"
  );
}

function isDaytonaTerminalErrorState(
  daytonaState: string | null | undefined,
): boolean {
  const state = String(daytonaState ?? "")
    .trim()
    .toLowerCase();
  return (
    state === "error" ||
    state === "build_failed" ||
    state === "destroyed" ||
    state === "destroying" ||
    state === "unknown"
  );
}

export async function createDaytonaSandbox(params: {
  config: DaytonaConfig;
  userId: string;
  projectId: string;
  runId?: string | null;
  sourceLabel?: string | null;
  projectVolumeId?: string | null;
}): Promise<
  | {
      ok: true;
      sandbox: DaytonaSandboxApiDto;
      lifecycleMode: "native_stop_delete" | "manual_delete_fallback";
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  // Runtime workspace sandboxes intentionally use Daytona's snapshot/default-snapshot
  // creation path for alpha. The active runner rejects explicit Sandbox resources on
  // this create contract, so plans should choose a sandbox profile upstream rather than
  // leaking raw cpu/memory/disk knobs into every POST /sandbox request.
  const labels: Record<string, unknown> = {
    arx_user_id: params.userId,
    arx_project_id: params.projectId,
    arx_source:
      String(params.sourceLabel ?? "").trim() || "convex_runtime_turn",
  };
  const runId = String(params.runId ?? "").trim();
  if (runId) {
    labels.arx_run_id = runId;
  }
  const requiredPayload: Record<string, unknown> = {
    labels,
  };
  const payloadBase: Record<string, unknown> = {
    ...requiredPayload,
    ephemeral: true,
  };
  if (params.config.target) payloadBase.target = params.config.target;
  if (params.config.snapshot) payloadBase.snapshot = params.config.snapshot;
  if (params.projectVolumeId) {
    payloadBase.volumes = [
      { volumeId: params.projectVolumeId, mountPath: DAYTONA_WORKSPACE_ROOT },
    ];
  }
  const payloadWithLifecycle = {
    ...payloadBase,
    autoStopInterval: params.config.autoStopInterval,
    autoDeleteInterval: params.config.autoDeleteInterval,
  };
  const createPrimary = await daytonaApiRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: "/sandbox",
    method: "POST",
    body: payloadWithLifecycle,
  });
  if (createPrimary.ok) {
    return {
      ok: true,
      sandbox: createPrimary.payload,
      lifecycleMode: "native_stop_delete",
    };
  }
  const detailsText = String(
    createPrimary.details?.response_text ?? "",
  ).toLowerCase();
  const unsupportedOptionalField =
    detailsText.includes("autostopinterval") ||
    detailsText.includes("autodeleteinterval") ||
    detailsText.includes("auto_stop_interval") ||
    detailsText.includes("auto_delete_interval") ||
    detailsText.includes("ephemeral") ||
    detailsText.includes("unknown field") ||
    detailsText.includes("additional properties");
  if (!unsupportedOptionalField) {
    logStructuredError("daytona_sandbox_create_failed", {
      error: new Error(createPrimary.message),
      status: createPrimary.status,
      responseText: formatLogPreview(
        createPrimary.details?.response_text,
        4000,
      ),
      payloadKeys: Object.keys(payloadWithLifecycle),
      hasVolume: Boolean(params.projectVolumeId),
      hasTarget: Boolean(params.config.target),
      snapshotConfigured: Boolean(params.config.snapshot),
    });
    return createPrimary;
  }
  const fallbackCreate = await daytonaApiRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: "/sandbox",
    method: "POST",
    body: requiredPayload,
  });
  if (!fallbackCreate.ok) {
    logStructuredError("daytona_sandbox_create_fallback_failed", {
      error: new Error(fallbackCreate.message),
      status: fallbackCreate.status,
      responseText: formatLogPreview(
        fallbackCreate.details?.response_text,
        4000,
      ),
      payloadKeys: Object.keys(requiredPayload),
      hasVolume: false,
      hasTarget: false,
      snapshotConfigured: Boolean(params.config.snapshot),
    });
    return fallbackCreate;
  }
  return {
    ok: true,
    sandbox: fallbackCreate.payload,
    lifecycleMode: "manual_delete_fallback",
  };
}

export async function listDaytonaSandboxes(params: {
  config: DaytonaConfig;
}): Promise<
  | { ok: true; sandboxes: DaytonaSandboxApiDto[] }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const res = await daytonaApiRequest<unknown>({
    config: params.config,
    path: "/sandbox",
    method: "GET",
  });
  if (!res.ok) return res;
  return {
    ok: true,
    sandboxes: normalizeDaytonaSandboxListPayload(res.payload),
  };
}

export async function stopDaytonaSandbox(params: {
  config: DaytonaConfig;
  sandboxId: string;
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
  const res = await daytonaApiRequest<Record<string, unknown>>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}/stop`,
    method: "POST",
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function deleteDaytonaSandbox(params: {
  config: DaytonaConfig;
  sandboxId: string;
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
  const res = await daytonaApiRequest<Record<string, unknown>>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}`,
    method: "DELETE",
  });
  if (!res.ok) {
    const detailsText = String(res.details?.response_text ?? "").toLowerCase();
    if (detailsText.includes("not found")) return { ok: true };
    return res;
  }
  return { ok: true };
}

export async function waitForDaytonaSandboxReady(params: {
  config: DaytonaConfig;
  sandboxId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<
  | { ok: true; sandbox: DaytonaSandboxApiDto }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const timeoutMs = Math.max(1000, Math.floor(params.timeoutMs ?? 30_000));
  const intervalMs = Math.max(250, Math.floor(params.intervalMs ?? 1000));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const lookup = await daytonaApiRequest<DaytonaSandboxApiDto>({
      config: params.config,
      path: `/sandbox/${encodeURIComponent(params.sandboxId)}`,
      method: "GET",
    });
    if (!lookup.ok) return lookup;
    if (isDaytonaStartedState(lookup.payload.state))
      return { ok: true, sandbox: lookup.payload };
    if (isDaytonaTerminalErrorState(lookup.payload.state)) {
      return {
        ok: false,
        status: 503,
        code: "runner_unavailable",
        message: `Daytona sandbox entered terminal state '${String(lookup.payload.state ?? "unknown")}'.`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Timed out waiting for Daytona sandbox readiness.",
  };
}

export async function waitForDaytonaSandboxStopped(params: {
  config: DaytonaConfig;
  sandboxId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<
  | { ok: true; sandbox: DaytonaSandboxApiDto | null }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const timeoutMs = Math.max(1000, Math.floor(params.timeoutMs ?? 30_000));
  const intervalMs = Math.max(250, Math.floor(params.intervalMs ?? 1000));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const lookup = await daytonaApiRequest<DaytonaSandboxApiDto>({
      config: params.config,
      path: `/sandbox/${encodeURIComponent(params.sandboxId)}`,
      method: "GET",
    });
    if (!lookup.ok) {
      const detailsText = String(
        lookup.details?.response_text ?? "",
      ).toLowerCase();
      if (detailsText.includes("not found")) {
        return { ok: true, sandbox: null };
      }
      return lookup;
    }
    if (isDaytonaStoppedState(lookup.payload.state)) {
      return { ok: true, sandbox: lookup.payload };
    }
    if (isDaytonaTerminalErrorState(lookup.payload.state)) {
      return {
        ok: false,
        status: 503,
        code: "runner_unavailable",
        message: `Daytona sandbox entered terminal state '${String(lookup.payload.state ?? "unknown")}' while stopping.`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Timed out waiting for Daytona sandbox stop.",
  };
}

export async function getDaytonaToolboxProxyUrl(params: {
  config: DaytonaConfig;
  sandboxId: string;
}): Promise<
  | { ok: true; toolboxProxyUrl: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const res = await daytonaApiRequest<DaytonaToolboxProxyUrlDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}/toolbox-proxy-url`,
    method: "GET",
  });
  if (!res.ok) return res;
  const rawUrl = String(res.payload.url ?? "").trim();
  if (!rawUrl) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona toolbox proxy URL is missing.",
    };
  }
  try {
    const parsed = new URL(rawUrl);
    return { ok: true, toolboxProxyUrl: parsed.toString().replace(/\/+$/, "") };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona toolbox proxy URL is invalid.",
    };
  }
}

export async function getDaytonaSignedPreviewUrl(params: {
  config: DaytonaConfig;
  sandboxId: string;
  port: number;
  expiresInSeconds?: number;
}): Promise<
  | { ok: true; url: string; token: string | null }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const sandboxId = String(params.sandboxId ?? "").trim();
  const port = Math.floor(Number(params.port));
  if (!sandboxId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_request",
      message: "Preview request is missing sandbox ID.",
    };
  }
  if (!Number.isFinite(port) || port < 3000 || port > 9999) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_request",
      message: "Preview port must be between 3000 and 9999.",
    };
  }
  const expiresInSeconds = Math.max(
    1,
    Math.min(
      86_400,
      Math.floor(Number(params.expiresInSeconds ?? 3600) || 3600),
    ),
  );
  const res = await daytonaApiRequest<DaytonaSignedPreviewUrlDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(sandboxId)}/ports/${port}/signed-preview-url?expiresInSeconds=${expiresInSeconds}`,
    method: "GET",
  });
  if (!res.ok) return res;
  const rawUrl = String(res.payload.url ?? "").trim();
  if (!rawUrl) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona signed preview URL is missing.",
    };
  }
  return {
    ok: true,
    url: rawUrl,
    token: String(res.payload.token ?? "").trim() || null,
  };
}

export async function getDaytonaPreviewUrl(params: {
  config: DaytonaConfig;
  sandboxId: string;
  port: number;
}): Promise<
  | { ok: true; url: string; token: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const sandboxId = String(params.sandboxId ?? "").trim();
  const port = Math.floor(Number(params.port));
  if (!sandboxId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_request",
      message: "Preview request is missing sandbox ID.",
    };
  }
  if (!Number.isFinite(port) || port < 3000 || port > 9999) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_request",
      message: "Preview port must be between 3000 and 9999.",
    };
  }
  const res = await daytonaApiRequest<DaytonaPreviewUrlDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(sandboxId)}/ports/${port}/preview-url`,
    method: "GET",
  });
  if (!res.ok) return res;
  const rawUrl = String(res.payload.url ?? "").trim();
  const rawToken = String(res.payload.token ?? "").trim();
  if (!rawUrl || !rawToken) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona preview URL is missing auth details.",
    };
  }
  return {
    ok: true,
    url: rawUrl,
    token: rawToken,
  };
}
