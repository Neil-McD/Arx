export type DaytonaConfig = {
  apiBaseUrl: string;
  apiKey: string;
  orgId: string | null;
  target: string | null;
  snapshot: string | null;
  autoStopInterval: number;
  autoDeleteInterval: number;
};

export type DaytonaSandboxApiDto = {
  id?: string | null;
  state?: string | null;
  target?: string | null;
};

export type DaytonaToolboxProxyUrlDto = {
  url?: string | null;
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
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
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

export function loadDaytonaConfig(): { ok: true; config: DaytonaConfig } | { ok: false; code: string; message: string } {
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
      message: "Daytona runner is unavailable. DAYTONA_API_URL is missing or invalid.",
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

export function daytonaHeaders(config: DaytonaConfig, includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (includeJsonContentType) headers["Content-Type"] = "application/json";
  if (config.orgId) headers["X-Daytona-Organization-ID"] = config.orgId;
  return headers;
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
      message: error instanceof Error ? error.message : "Daytona API request failed.",
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

function isDaytonaStartedState(daytonaState: string | null | undefined): boolean {
  return String(daytonaState ?? "").trim().toLowerCase() === "started";
}

function isDaytonaTerminalErrorState(daytonaState: string | null | undefined): boolean {
  const state = String(daytonaState ?? "").trim().toLowerCase();
  return state === "error" || state === "build_failed" || state === "destroyed" || state === "destroying" || state === "unknown";
}

export async function createDaytonaSandbox(params: {
  config: DaytonaConfig;
  userId: string;
  projectId: string;
  runId: string;
  projectVolumeId?: string | null;
}): Promise<
  | { ok: true; sandbox: DaytonaSandboxApiDto; lifecycleMode: "native_stop_delete" | "manual_delete_fallback" }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const payloadBase: Record<string, unknown> = {
    labels: {
      arx_user_id: params.userId,
      arx_project_id: params.projectId,
      arx_run_id: params.runId,
      arx_source: "convex_runtime_turn",
    },
    ephemeral: true,
  };
  if (params.config.target) payloadBase.target = params.config.target;
  if (params.config.snapshot) payloadBase.snapshot = params.config.snapshot;
  if (params.projectVolumeId) {
    payloadBase.volumes = [{ volumeId: params.projectVolumeId, mountPath: DAYTONA_WORKSPACE_ROOT }];
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
  const detailsText = String(createPrimary.details?.response_text ?? "").toLowerCase();
  const unsupportedLifecycleField =
    detailsText.includes("autostopinterval") ||
    detailsText.includes("autodeleteinterval") ||
    detailsText.includes("auto_stop_interval") ||
    detailsText.includes("auto_delete_interval") ||
    detailsText.includes("ephemeral") ||
    detailsText.includes("unknown field") ||
    detailsText.includes("additional properties");
  if (!unsupportedLifecycleField) return createPrimary;
  const fallbackCreate = await daytonaApiRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: "/sandbox",
    method: "POST",
    body: payloadBase,
  });
  if (!fallbackCreate.ok) return fallbackCreate;
  return {
    ok: true,
    sandbox: fallbackCreate.payload,
    lifecycleMode: "manual_delete_fallback",
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
  if (!res.ok) return res;
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
    if (isDaytonaStartedState(lookup.payload.state)) return { ok: true, sandbox: lookup.payload };
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
