import { getEnv } from "./env.ts";
import { supabaseAdminFetch } from "./supabase_admin.ts";
import { type DaytonaToolName } from "./cloud_harness_core.ts";

type ApiError = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

export type DaytonaLocalSandboxStatus = "provisioning" | "ready" | "paused" | "stopped" | "error";

type DaytonaSandboxRow = {
  id: string;
  project_id?: string | null;
  provider_sandbox_id: string;
  status: DaytonaLocalSandboxStatus;
  region?: string | null;
};

export type ResolvedDaytonaSandbox = DaytonaSandboxRow & {
  toolbox_proxy_url: string;
};

type DaytonaConfig = {
  api_base_url: string;
  api_key: string;
  org_id: string | null;
  target: string | null;
  snapshot: string | null;
  auto_stop_interval: number;
  auto_archive_interval: number;
  auto_delete_interval: number;
};

type DaytonaSandboxApiDto = {
  id?: string;
  state?: string | null;
  target?: string | null;
};

type DaytonaToolboxProxyUrlDto = {
  url?: string | null;
};

type DaytonaProcessExecuteDto = {
  result?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  exitCode?: number | null;
  code?: number | null;
  message?: unknown;
  error?: unknown;
};

export type DaytonaToolExecutionResult = {
  status: "ok" | "error";
  exitCode: number | null;
  outputText: string;
  errorCode: string | null;
  errorMessage: string | null;
};

type NormalizedExpectedBeforeSha = {
  provided: boolean;
  value: string | null;
};

const DAYTONA_AUTO_STOP_INTERVAL_DEFAULT_MINUTES = 20;
const DAYTONA_AUTO_ARCHIVE_INTERVAL_DEFAULT_MINUTES = 0;
const DAYTONA_AUTO_DELETE_INTERVAL_DEFAULT_MINUTES = -1;

function createApiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): ApiError {
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { status?: unknown }).status === "number",
  );
}

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = String(getEnv(name) ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw createApiError("runner_unavailable", `${name} must be an integer.`, 503);
  }
  return parsed;
}

function normalizeProjectId(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeStoredSandboxStatus(value: unknown): DaytonaLocalSandboxStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (
    status === "ready" ||
    status === "provisioning" ||
    status === "stopped" ||
    status === "paused" ||
    status === "error"
  ) {
    return status;
  }
  return "error";
}

function normalizeRelativeWorkspacePath(raw: unknown): string {
  const candidate = String(raw ?? "").trim().replaceAll("\\", "/");
  if (!candidate) throw createApiError("invalid_tool_args", "Tool path is required.", 400);
  if (candidate.startsWith("/")) {
    throw createApiError("path_outside_workspace", "Absolute paths are not allowed.", 403);
  }
  const parts = candidate.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw createApiError("path_outside_workspace", "Parent directory traversal is not allowed.", 403);
  }
  const segments = parts[0]?.toLowerCase() === "workspace" ? parts.slice(1) : parts;
  if (segments.length === 0) return ".";
  return segments.join("/");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function normalizeDaytonaApiBaseUrl(rawUrl: string): string {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) {
    throw createApiError("runner_unavailable", "Daytona runner is unavailable. Missing DAYTONA_API_URL.", 503);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw createApiError("runner_unavailable", "DAYTONA_API_URL is invalid.", 503);
  }
  const cleanedPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = cleanedPath.length === 0 ? "/api" : cleanedPath;
  return parsed.toString().replace(/\/+$/, "");
}

export function loadDaytonaConfig(): DaytonaConfig {
  const apiKey = String(getEnv("DAYTONA_API_KEY") ?? "").trim();
  if (!apiKey) {
    throw createApiError("runner_unavailable", "Daytona runner is unavailable. Missing DAYTONA_API_KEY.", 503);
  }
  const apiBaseUrl = normalizeDaytonaApiBaseUrl(String(getEnv("DAYTONA_API_URL") ?? ""));
  const orgId = String(getEnv("DAYTONA_ORG_ID") ?? "").trim() || null;
  const target = String(getEnv("DAYTONA_TARGET") ?? "").trim() || null;
  const snapshot = String(getEnv("DAYTONA_SNAPSHOT") ?? "").trim() || null;
  const autoStopInterval = parseIntegerEnv(
    "DAYTONA_AUTO_STOP_INTERVAL_MINUTES",
    DAYTONA_AUTO_STOP_INTERVAL_DEFAULT_MINUTES,
  );
  const autoArchiveInterval = parseIntegerEnv(
    "DAYTONA_AUTO_ARCHIVE_INTERVAL_MINUTES",
    DAYTONA_AUTO_ARCHIVE_INTERVAL_DEFAULT_MINUTES,
  );
  const autoDeleteInterval = parseIntegerEnv(
    "DAYTONA_AUTO_DELETE_INTERVAL_MINUTES",
    DAYTONA_AUTO_DELETE_INTERVAL_DEFAULT_MINUTES,
  );
  if (autoStopInterval < 0) {
    throw createApiError("runner_unavailable", "DAYTONA_AUTO_STOP_INTERVAL_MINUTES must be >= 0.", 503);
  }
  if (autoArchiveInterval < 0) {
    throw createApiError("runner_unavailable", "DAYTONA_AUTO_ARCHIVE_INTERVAL_MINUTES must be >= 0.", 503);
  }
  return {
    api_base_url: apiBaseUrl,
    api_key: apiKey,
    org_id: orgId,
    target,
    snapshot,
    auto_stop_interval: autoStopInterval,
    auto_archive_interval: autoArchiveInterval,
    auto_delete_interval: autoDeleteInterval,
  };
}

function daytonaHeaders(config: DaytonaConfig, includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.api_key}`,
  };
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (config.org_id) {
    headers["X-Daytona-Organization-ID"] = config.org_id;
  }
  return headers;
}

async function parseResponseBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text.trim()) return { text, json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

function summarizeDaytonaCommand(raw: string): string {
  const firstLine = String(raw ?? "").split("\n")[0] ?? "";
  const compact = firstLine.replace(/\s+/g, " ").trim();
  if (!compact) return "(empty)";
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function truncateOutput(value: string, maxChars: number): string {
  const text = String(value ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeUrlPath(pathname: string): string {
  const cleaned = String(pathname ?? "").trim();
  if (!cleaned || cleaned === "/") return "/";
  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function joinUrlPath(pathname: string, ...segments: string[]): string {
  const base = normalizeUrlPath(pathname).replace(/^\/+|\/+$/g, "");
  const normalizedSegments = segments
    .map((segment) => String(segment ?? "").trim().replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  const parts = [base, ...normalizedSegments].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

function buildToolboxExecuteBaseCandidates(
  toolboxProxyUrl: string,
  sandboxId: string | null | undefined,
): string[] {
  const out: string[] = [];
  const pushUnique = (value: string) => {
    const normalized = value.replace(/\/+$/, "");
    if (!normalized) return;
    if (!out.includes(normalized)) out.push(normalized);
  };

  let parsed: URL;
  try {
    parsed = new URL(String(toolboxProxyUrl ?? "").trim());
  } catch {
    pushUnique(String(toolboxProxyUrl ?? "").trim());
    return out;
  }

  pushUnique(parsed.toString());
  const encodedSandboxId = String(sandboxId ?? "").trim()
    ? encodeURIComponent(String(sandboxId ?? "").trim())
    : null;
  if (!encodedSandboxId) return out;

  const normalizedPath = normalizeUrlPath(parsed.pathname);
  const toolboxIndex = normalizedPath.indexOf("/toolbox");
  const pathCandidates = new Set<string>();

  // Daytona SDK-style base: `${toolboxProxyUrl}/${sandboxId}`
  pathCandidates.add(joinUrlPath(normalizedPath, encodedSandboxId));

  if (toolboxIndex >= 0) {
    const pathPrefix = normalizedPath.slice(0, toolboxIndex);
    pathCandidates.add(joinUrlPath(pathPrefix, "toolbox"));
    pathCandidates.add(joinUrlPath(pathPrefix, "toolbox", encodedSandboxId));
    pathCandidates.add(joinUrlPath(pathPrefix, "toolbox", encodedSandboxId, "toolbox"));
  } else {
    pathCandidates.add(joinUrlPath(normalizedPath, "toolbox"));
    pathCandidates.add(joinUrlPath(normalizedPath, "toolbox", encodedSandboxId));
    pathCandidates.add(joinUrlPath(normalizedPath, "toolbox", encodedSandboxId, "toolbox"));
    pathCandidates.add(joinUrlPath("/", "toolbox", encodedSandboxId));
    pathCandidates.add(joinUrlPath("/", "toolbox", encodedSandboxId, "toolbox"));
  }

  for (const candidatePath of pathCandidates) {
    parsed.pathname = candidatePath;
    pushUnique(parsed.toString());
  }
  return out;
}

function shouldRetryWithAlternateToolboxBase(status: number, text: string): boolean {
  const body = String(text ?? "").toLowerCase();
  if (status === 401 && body.includes("failed to get auth url")) return true;
  if (body.includes("invalid host format")) return true;
  if (body.includes("sandbox id not found")) return true;
  if (status === 404 && body.includes("toolbox")) return true;
  return false;
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function wrapDaytonaCommandForExecution(command: string): string {
  const encodedCommand = toBase64Utf8(command);
  const decodedPipeline = `echo ${shellQuote(encodedCommand)} | base64 -d | sh`;
  return `sh -lc ${shellQuote(decodedPipeline)}`;
}

function readLooseString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

async function daytonaApiRequest<T>(params: {
  config: DaytonaConfig;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown> | null;
}): Promise<T> {
  const response = await fetch(`${params.config.api_base_url}${params.path}`, {
    method: params.method,
    headers: daytonaHeaders(params.config, true),
    ...(params.body ? { body: JSON.stringify(params.body) } : null),
  });
  const { text, json } = await parseResponseBody(response);
  if (!response.ok) {
    throw createApiError(
      "runner_unavailable",
      `Daytona API ${params.method} ${params.path} failed (${response.status}): ${text || response.statusText}`,
      503,
    );
  }
  if (!json || typeof json !== "object") {
    throw createApiError("runner_unavailable", `Daytona API ${params.path} returned invalid JSON.`, 503);
  }
  return json as T;
}

function mapDaytonaStateToLocalStatus(daytonaState: string | null | undefined): DaytonaLocalSandboxStatus {
  const state = String(daytonaState ?? "").trim().toLowerCase();
  if (state === "started") return "ready";
  if (
    state === "creating" ||
    state === "restoring" ||
    state === "starting" ||
    state === "pending_build" ||
    state === "building_snapshot" ||
    state === "pulling_snapshot" ||
    state === "resizing"
  ) {
    return "provisioning";
  }
  if (state === "stopped" || state === "stopping") return "stopped";
  if (state === "archived" || state === "archiving") return "paused";
  return "error";
}

function isDaytonaStartedState(daytonaState: string | null | undefined): boolean {
  return String(daytonaState ?? "").trim().toLowerCase() === "started";
}

function isDaytonaTerminalErrorState(daytonaState: string | null | undefined): boolean {
  const state = String(daytonaState ?? "").trim().toLowerCase();
  return (
    state === "error" ||
    state === "build_failed" ||
    state === "destroyed" ||
    state === "destroying" ||
    state === "unknown"
  );
}

async function fetchDaytonaSandbox(
  config: DaytonaConfig,
  sandboxIdOrName: string,
): Promise<DaytonaSandboxApiDto> {
  return daytonaApiRequest<DaytonaSandboxApiDto>({
    config,
    path: `/sandbox/${encodeURIComponent(sandboxIdOrName)}`,
    method: "GET",
  });
}

async function startDaytonaSandbox(config: DaytonaConfig, sandboxIdOrName: string): Promise<DaytonaSandboxApiDto> {
  return daytonaApiRequest<DaytonaSandboxApiDto>({
    config,
    path: `/sandbox/${encodeURIComponent(sandboxIdOrName)}/start`,
    method: "POST",
    body: {},
  });
}

async function createDaytonaSandbox(config: DaytonaConfig, params: {
  userId: string;
  projectId: string;
}): Promise<DaytonaSandboxApiDto> {
  const payloadBase: Record<string, unknown> = {
    labels: {
      arx_user_id: params.userId,
      arx_project_id: params.projectId,
      arx_source: "runtime_turn",
    },
  };
  if (config.target) payloadBase.target = config.target;
  if (config.snapshot) payloadBase.snapshot = config.snapshot;

  const payloadWithLifecycle: Record<string, unknown> = {
    ...payloadBase,
    auto_stop_interval: config.auto_stop_interval,
    auto_archive_interval: config.auto_archive_interval,
    auto_delete_interval: config.auto_delete_interval,
  };
  try {
    return await daytonaApiRequest<DaytonaSandboxApiDto>({
      config,
      path: "/sandbox",
      method: "POST",
      body: payloadWithLifecycle,
    });
  } catch (error) {
    if (!isApiError(error)) throw error;
    const msg = error.message.toLowerCase();
    const unsupportedLifecycleField =
      msg.includes("auto_stop_interval") ||
      msg.includes("auto_archive_interval") ||
      msg.includes("auto_delete_interval") ||
      msg.includes("unknown field") ||
      msg.includes("additional properties");
    if (!unsupportedLifecycleField) throw error;
    return daytonaApiRequest<DaytonaSandboxApiDto>({
      config,
      path: "/sandbox",
      method: "POST",
      body: payloadBase,
    });
  }
}

async function getDaytonaToolboxProxyUrl(config: DaytonaConfig, sandboxId: string): Promise<string> {
  const payload = await daytonaApiRequest<DaytonaToolboxProxyUrlDto>({
    config,
    path: `/sandbox/${encodeURIComponent(sandboxId)}/toolbox-proxy-url`,
    method: "GET",
  });
  const rawUrl = String(payload.url ?? "").trim();
  if (!rawUrl) throw createApiError("runner_unavailable", "Daytona toolbox proxy URL is missing.", 503);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw createApiError("runner_unavailable", "Daytona toolbox proxy URL is invalid.", 503);
  }

  return parsed.toString().replace(/\/+$/, "");
}

async function waitForDaytonaSandboxReady(config: DaytonaConfig, sandboxId: string): Promise<DaytonaSandboxApiDto> {
  const timeoutMs = 30_000;
  const intervalMs = 1_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const sandbox = await fetchDaytonaSandbox(config, sandboxId);
    if (isDaytonaStartedState(sandbox.state)) return sandbox;
    if (isDaytonaTerminalErrorState(sandbox.state)) {
      throw createApiError(
        "runner_unavailable",
        `Daytona sandbox entered terminal state '${String(sandbox.state ?? "unknown")}'.`,
        503,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw createApiError("runner_unavailable", "Timed out waiting for Daytona sandbox to start.", 503);
}

async function patchDaytonaSandboxRow(params: {
  sandboxId: string;
  userId: string;
  projectId: string;
  providerSandboxId: string;
  status: DaytonaSandboxRow["status"];
  region: string | null;
}): Promise<DaytonaSandboxRow | null> {
  const response = await supabaseAdminFetch(
    `/rest/v1/daytona_sandboxes?id=eq.${encodeURIComponent(params.sandboxId)}&user_id=eq.${encodeURIComponent(
      params.userId,
    )}&project_id=eq.${encodeURIComponent(params.projectId)}&provider=eq.daytona`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        provider_sandbox_id: params.providerSandboxId,
        status: params.status,
        region: params.region,
        last_used_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) {
    throw createApiError("sandbox_upsert_failed", await response.text(), 500);
  }
  const rows = (await response.json()) as DaytonaSandboxRow[];
  const row = rows[0];
  if (!row?.id || !row.provider_sandbox_id) return null;
  return row;
}

export async function setDaytonaSandboxStatus(params: {
  sandboxId: string;
  userId: string;
  projectId: string;
  providerSandboxId: string;
  status: DaytonaLocalSandboxStatus;
  region?: string | null;
}): Promise<void> {
  await patchDaytonaSandboxRow({
    sandboxId: params.sandboxId,
    userId: params.userId,
    projectId: params.projectId,
    providerSandboxId: params.providerSandboxId,
    status: params.status,
    region: params.region ?? null,
  });
}

async function insertDaytonaSandboxRow(params: {
  userId: string;
  projectId: string;
  providerSandboxId: string;
  status: DaytonaSandboxRow["status"];
  region: string | null;
}): Promise<DaytonaSandboxRow> {
  const response = await supabaseAdminFetch("/rest/v1/daytona_sandboxes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: params.userId,
      project_id: params.projectId,
      provider: "daytona",
      provider_sandbox_id: params.providerSandboxId,
      status: params.status,
      region: params.region,
      last_used_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw createApiError("sandbox_upsert_failed", await response.text(), 500);
  }
  const rows = (await response.json()) as DaytonaSandboxRow[];
  const row = rows[0];
  if (!row?.id || !row.provider_sandbox_id) {
    throw createApiError("sandbox_upsert_failed", "Failed to upsert Daytona sandbox row.", 500);
  }
  return row;
}

async function upsertDaytonaSandboxRow(params: {
  existingSandboxId: string | null;
  userId: string;
  projectId: string;
  providerSandboxId: string;
  status: DaytonaSandboxRow["status"];
  region: string | null;
}): Promise<DaytonaSandboxRow> {
  if (params.existingSandboxId) {
    const patched = await patchDaytonaSandboxRow({
      sandboxId: params.existingSandboxId,
      userId: params.userId,
      projectId: params.projectId,
      providerSandboxId: params.providerSandboxId,
      status: params.status,
      region: params.region,
    });
    if (patched) return patched;
  }

  try {
    return await insertDaytonaSandboxRow({
      userId: params.userId,
      projectId: params.projectId,
      providerSandboxId: params.providerSandboxId,
      status: params.status,
      region: params.region,
    });
  } catch (error) {
    const fallbackLookup = await supabaseAdminFetch(
      `/rest/v1/daytona_sandboxes?select=id,project_id,provider_sandbox_id,status&user_id=eq.${encodeURIComponent(
        params.userId,
      )}&project_id=eq.${encodeURIComponent(params.projectId)}&provider=eq.daytona&order=last_used_at.desc&limit=1`,
      { method: "GET" },
    );
    if (!fallbackLookup.ok) throw error;
    const existingRows = (await fallbackLookup.json()) as DaytonaSandboxRow[];
    const existing = existingRows[0];
    if (!existing?.id) throw error;
    const patched = await patchDaytonaSandboxRow({
      sandboxId: existing.id,
      userId: params.userId,
      projectId: params.projectId,
      providerSandboxId: params.providerSandboxId,
      status: params.status,
      region: params.region,
    });
    if (patched) return patched;
    throw error;
  }
}

export async function ensureDaytonaSandbox(params: {
  userId: string;
  projectId: string;
}): Promise<ResolvedDaytonaSandbox> {
  const config = loadDaytonaConfig();
  const projectLookupRes = await supabaseAdminFetch(
    `/rest/v1/daytona_sandboxes?select=id,project_id,provider_sandbox_id,status&user_id=eq.${encodeURIComponent(
      params.userId,
    )}&project_id=eq.${encodeURIComponent(params.projectId)}&provider=eq.daytona&order=last_used_at.desc&limit=1`,
    { method: "GET" },
  );
  if (!projectLookupRes.ok) {
    throw createApiError("sandbox_lookup_failed", await projectLookupRes.text(), 500);
  }
  const existing = ((await projectLookupRes.json()) as DaytonaSandboxRow[])[0] ?? null;

  let sandbox: DaytonaSandboxApiDto;
  if (existing?.provider_sandbox_id) {
    try {
      sandbox = await fetchDaytonaSandbox(config, existing.provider_sandbox_id);
      const state = String(sandbox.state ?? "").trim().toLowerCase();
      if (state === "stopped" || state === "archived") {
        sandbox = await startDaytonaSandbox(config, existing.provider_sandbox_id);
      }
    } catch {
      sandbox = await createDaytonaSandbox(config, params);
    }
  } else {
    sandbox = await createDaytonaSandbox(config, params);
  }

  const providerSandboxId = String(sandbox.id ?? "").trim();
  if (!providerSandboxId) {
    throw createApiError("runner_unavailable", "Daytona sandbox ID is missing from API response.", 503);
  }
  const initialStatus = mapDaytonaStateToLocalStatus(sandbox.state);
  await upsertDaytonaSandboxRow({
    existingSandboxId: existing?.id ?? null,
    userId: params.userId,
    projectId: params.projectId,
    providerSandboxId,
    status: initialStatus,
    region: sandbox.target ? String(sandbox.target) : null,
  });

  try {
    const readySandbox = await waitForDaytonaSandboxReady(config, providerSandboxId);
    const proxyUrl = await getDaytonaToolboxProxyUrl(config, providerSandboxId);
    const upserted = await upsertDaytonaSandboxRow({
      existingSandboxId: existing?.id ?? null,
      userId: params.userId,
      projectId: params.projectId,
      providerSandboxId,
      status: mapDaytonaStateToLocalStatus(readySandbox.state),
      region: readySandbox.target ? String(readySandbox.target) : null,
    });
    return {
      ...upserted,
      toolbox_proxy_url: proxyUrl,
    };
  } catch (error) {
    try {
      await upsertDaytonaSandboxRow({
        existingSandboxId: existing?.id ?? null,
        userId: params.userId,
        projectId: params.projectId,
        providerSandboxId,
        status: "error",
        region: sandbox.target ? String(sandbox.target) : null,
      });
    } catch {
      // Ignore secondary persistence failures while surfacing the original error.
    }
    throw error;
  }
}

export async function syncDaytonaSandboxStatusesForUser(params: {
  userId: string;
}): Promise<{ total: number; updated: number; failed: number }> {
  const config = loadDaytonaConfig();
  const lookup = await supabaseAdminFetch(
    `/rest/v1/daytona_sandboxes?select=id,project_id,provider_sandbox_id,status,region&user_id=eq.${encodeURIComponent(
      params.userId,
    )}&provider=eq.daytona&order=updated_at.desc&limit=200`,
    { method: "GET" },
  );
  if (!lookup.ok) {
    throw createApiError("sandbox_lookup_failed", await lookup.text(), 500);
  }
  const rows = (await lookup.json()) as DaytonaSandboxRow[];
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const sandboxId = String(row.id ?? "").trim();
    const projectId = normalizeProjectId(row.project_id);
    const providerSandboxId = String(row.provider_sandbox_id ?? "").trim();
    if (!sandboxId || !projectId || !providerSandboxId) {
      failed += 1;
      continue;
    }

    const storedStatus = normalizeStoredSandboxStatus(row.status);
    const storedRegion = String(row.region ?? "").trim() || null;
    let nextStatus: DaytonaSandboxRow["status"] = storedStatus;
    let nextRegion: string | null = storedRegion;

    try {
      const sandbox = await fetchDaytonaSandbox(config, providerSandboxId);
      nextStatus = mapDaytonaStateToLocalStatus(sandbox.state);
      nextRegion = sandbox.target ? String(sandbox.target) : null;
    } catch {
      failed += 1;
      continue;
    }

    if (nextStatus === storedStatus && nextRegion === storedRegion) continue;
    try {
      await patchDaytonaSandboxRow({
        sandboxId,
        userId: params.userId,
        projectId,
        providerSandboxId,
        status: nextStatus,
        region: nextRegion,
      });
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    total: rows.length,
    updated,
    failed,
  };
}

export async function executeDaytonaCommand(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  command: string;
  sandboxId?: string | null;
  cwd?: string | null;
  timeoutSeconds?: number | null;
  allowNonZero?: boolean;
}): Promise<{ stdout: string; exitCode: number }> {
  const commandSummary = summarizeDaytonaCommand(params.command);
  const cwdSummary = String(params.cwd ?? ".").trim() || ".";
  const baseCandidates = buildToolboxExecuteBaseCandidates(params.toolboxProxyUrl, params.sandboxId);
  const timeout = typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
    ? Math.max(1, Math.min(120, Math.floor(params.timeoutSeconds)))
    : null;

  const executeVariant = async (
    strategy: "wrapped" | "raw",
    commandForExecution: string,
  ): Promise<{ stdout: string; exitCode: number }> => {
    let lastError: ApiError | null = null;
    for (let index = 0; index < baseCandidates.length; index += 1) {
      const baseUrl = baseCandidates[index];
      const hasNextCandidate = index < baseCandidates.length - 1;
      const payload: Record<string, unknown> = {
        command: commandForExecution,
        ...(params.cwd ? { cwd: params.cwd } : null),
        ...(timeout !== null ? { timeout } : null),
      };
      const response = await fetch(`${baseUrl}/process/execute`, {
        method: "POST",
        headers: daytonaHeaders(params.config, true),
        body: JSON.stringify(payload),
      });
      const { text, json } = await parseResponseBody(response);
      if (!response.ok) {
        const failure = createApiError(
          "runner_unavailable",
          `Daytona toolbox command failed (${response.status}) [strategy=${strategy}, cwd=${cwdSummary}, cmd=${commandSummary}, base=${baseUrl}]: ${
            text || response.statusText
          }`,
          503,
        );
        if (hasNextCandidate && shouldRetryWithAlternateToolboxBase(response.status, text)) {
          lastError = failure;
          continue;
        }
        throw failure;
      }
      const parsed = (json ?? {}) as DaytonaProcessExecuteDto;
      const nestedResult = parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
        ? (parsed.result as Record<string, unknown>)
        : null;
      const exitCodeCandidates = [parsed.exitCode, parsed.code, nestedResult?.exitCode, nestedResult?.code];
      let exitCode = 0;
      for (const candidate of exitCodeCandidates) {
        const parsedCode = Number(candidate);
        if (Number.isFinite(parsedCode)) {
          exitCode = parsedCode;
          break;
        }
      }

      const resultText = readLooseString(parsed.result);
      const nestedResultText = nestedResult
        ? readLooseString(nestedResult.result) ||
          readLooseString(nestedResult.output) ||
          readLooseString(nestedResult.message) ||
          readLooseString(nestedResult.error)
        : "";
      const stdoutText = readLooseString(parsed.stdout) || readLooseString(nestedResult?.stdout);
      const stderrText = readLooseString(parsed.stderr) || readLooseString(nestedResult?.stderr);
      const messageText = readLooseString(parsed.message);
      const errorText = readLooseString(parsed.error) || readLooseString(nestedResult?.error);
      const parsedPreview = (() => {
        try {
          return JSON.stringify(parsed);
        } catch {
          return "";
        }
      })();
      const primaryOutput =
        resultText ||
        stdoutText ||
        nestedResultText ||
        messageText ||
        errorText ||
        text ||
        parsedPreview;
      const stderrOutput = stderrText.trim();

      if (exitCode < 0) {
        const detail = [primaryOutput, stderrOutput].filter((segment) => segment.length > 0).join("\n").trim();
        const failure = createApiError(
          "runner_unavailable",
          `Daytona command failed before shell execution [strategy=${strategy}, cwd=${cwdSummary}, cmd=${commandSummary}]${
            detail ? `: ${truncateOutput(detail, 1200)}` : "."
          }`,
          503,
        );
        if (hasNextCandidate) {
          lastError = failure;
          continue;
        }
        throw failure;
      }

      if (exitCode !== 0 && params.allowNonZero !== true) {
        const detail = [primaryOutput, stderrOutput].filter((segment) => segment.length > 0).join("\n").trim();
        const failure = createApiError(
          "daytona_command_failed",
          `Daytona command failed with exit code ${exitCode} [strategy=${strategy}, cwd=${cwdSummary}, cmd=${commandSummary}]${
            detail ? `: ${truncateOutput(detail, 1200)}` : "."
          }`,
          502,
        );
        throw failure;
      }
      return { stdout: primaryOutput || stderrOutput, exitCode };
    }

    if (lastError) throw lastError;
    throw createApiError(
      "runner_unavailable",
      `Daytona toolbox command failed [strategy=${strategy}, cwd=${cwdSummary}, cmd=${commandSummary}] with no retry candidates.`,
      503,
    );
  };

  const wrappedCommand = wrapDaytonaCommandForExecution(params.command);
  try {
    return await executeVariant("wrapped", wrappedCommand);
  } catch (error) {
    if (isApiError(error) && error.code === "runner_unavailable") {
      return await executeVariant("raw", params.command);
    }
    throw error;
  }
}

export async function ensureDaytonaWorkspaceRoot(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId?: string | null;
}): Promise<void> {
  await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: "mkdir -p workspace",
    timeoutSeconds: 15,
  });
}

function normalizeExpectedBeforeSha(args: Record<string, unknown>): NormalizedExpectedBeforeSha {
  let raw: unknown = undefined;
  if (Object.prototype.hasOwnProperty.call(args, "expected_before_sha256")) {
    raw = args.expected_before_sha256;
  } else if (Object.prototype.hasOwnProperty.call(args, "expectedBeforeSha256")) {
    raw = args.expectedBeforeSha256;
  }
  if (raw === undefined) return { provided: false, value: null };
  if (raw === null) return { provided: true, value: null };
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return { provided: true, value: null };
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw createApiError(
      "invalid_tool_args",
      "expected_before_sha256 must be a 64-char sha256 hex string or null.",
      400,
    );
  }
  return { provided: true, value: normalized };
}

function normalizeOptionalWorkspaceDir(raw: unknown): string {
  const candidate = String(raw ?? "").trim();
  if (!candidate || candidate === ".") return ".";
  return normalizeRelativeWorkspacePath(candidate);
}

async function readWorkspaceFileSha256(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId?: string | null;
  relPath: string;
}): Promise<string | null> {
  const markerMissing = "__ARX_FILE_MISSING__";
  const markerNotFile = "__ARX_NOT_A_FILE__";
  const cmd =
    `FILE=${shellQuote(params.relPath)}; ` +
    `if [ ! -e "$FILE" ]; then echo ${shellQuote(markerMissing)}; exit 0; fi; ` +
    `if [ ! -f "$FILE" ]; then echo ${shellQuote(markerNotFile)}; exit 3; fi; ` +
    `shasum -a 256 "$FILE" | awk '{print $1}'`;
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: cmd,
    cwd: "workspace",
    timeoutSeconds: 15,
    allowNonZero: true,
  });
  const output = result.stdout.trim();
  if (result.exitCode === 3 || output === markerNotFile) {
    throw createApiError("invalid_tool_args", `Path '${params.relPath}' is not a file.`, 400);
  }
  if (output === markerMissing) return null;
  if (!output) return null;
  if (!/^[0-9a-f]{64}$/i.test(output)) {
    throw createApiError("tool_execution_failed", "Unexpected sha256 output.", 502);
  }
  return output.toLowerCase();
}

async function readWorkspaceFileContent(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId?: string | null;
  relPath: string;
}): Promise<string> {
  const markerMissing = "__ARX_FILE_MISSING__";
  const cmd =
    `FILE=${shellQuote(params.relPath)}; ` +
    `if [ ! -f "$FILE" ]; then echo ${shellQuote(markerMissing)}; exit 2; fi; ` +
    `cat "$FILE"`;
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: cmd,
    cwd: "workspace",
    timeoutSeconds: 20,
    allowNonZero: true,
  });
  if (result.exitCode === 2 || result.stdout.trim() === markerMissing) {
    throw createApiError("file_not_found", `File not found: ${params.relPath}`, 404);
  }
  if (result.exitCode !== 0) {
    throw createApiError(
      "tool_execution_failed",
      `Failed to read file '${params.relPath}' (exit ${result.exitCode}).`,
      502,
    );
  }
  return result.stdout;
}

function makeHereDocTag(content: string): string {
  let tag = `ARX_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
  while (content.includes(tag)) {
    tag = `${tag}_X`;
  }
  return tag;
}

async function writeWorkspaceFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId?: string | null;
  relPath: string;
  content: string;
  expectedBeforeSha: NormalizedExpectedBeforeSha;
}): Promise<DaytonaToolExecutionResult> {
  const currentSha = await readWorkspaceFileSha256({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    relPath: params.relPath,
  });

  if (params.expectedBeforeSha.provided) {
    if (params.expectedBeforeSha.value === null) {
      if (currentSha !== null) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "expected_before_mismatch",
          errorMessage: "Expected file to not exist before write.",
        };
      }
    } else if (currentSha !== params.expectedBeforeSha.value) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "expected_before_mismatch",
        errorMessage: "expected_before_sha256 mismatch.",
      };
    }
  }

  const hereDocTag = makeHereDocTag(params.content);
  const cmd = [
    `FILE=${shellQuote(params.relPath)}`,
    'mkdir -p "$(dirname "$FILE")"',
    `cat <<'${hereDocTag}' > "$FILE"`,
    params.content,
    hereDocTag,
    `shasum -a 256 "$FILE" | awk '{print $1}'`,
  ].join("\n");
  const writeResult = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: cmd,
    cwd: "workspace",
    timeoutSeconds: 45,
    allowNonZero: true,
  });
  const nextSha = writeResult.stdout.trim();
  return {
    status: writeResult.exitCode === 0 ? "ok" : "error",
    exitCode: writeResult.exitCode,
    outputText: writeResult.exitCode === 0
      ? [`wrote:${params.relPath}`, `sha256:${nextSha}`].join("\n")
      : writeResult.stdout.trim(),
    errorCode: writeResult.exitCode === 0 ? null : "tool_execution_failed",
    errorMessage: writeResult.exitCode === 0 ? null : `write failed with exit code ${writeResult.exitCode}`,
  };
}

export async function executeDaytonaTool(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId?: string | null;
  toolName: DaytonaToolName;
  args: Record<string, unknown>;
}): Promise<DaytonaToolExecutionResult> {
  try {
    await ensureDaytonaWorkspaceRoot({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
    });
    if (params.toolName === "read") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const offsetRaw = Number(params.args.offset ?? 0);
      const limitRaw = Number(params.args.limit ?? 200);
      const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(400, Math.floor(limitRaw))) : 200;
      const start = offset + 1;
      const end = offset + limit;
      const cmd =
        `FILE=${shellQuote(relPath)}; ` +
        `if [ ! -f "$FILE" ]; then echo "file_not_found:$FILE"; exit 2; fi; ` +
        `nl -ba "$FILE" | sed -n '${start},${end}p'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: "workspace",
        timeoutSeconds: 25,
        allowNonZero: true,
      });
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `read failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "list_dir") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const cmd = relPath === "."
        ? "ls -la"
        : `ls -la ${shellQuote(relPath)}`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: "workspace",
        timeoutSeconds: 25,
        allowNonZero: true,
      });
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0
          ? null
          : `list_dir failed with exit code ${result.exitCode}${
            result.stdout.trim() ? `: ${truncateOutput(result.stdout.trim(), 320)}` : ""
          }`,
      };
    }
    if (params.toolName === "glob") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const pattern = String(params.args.pat ?? params.args.pattern ?? "").trim();
      if (!pattern) throw createApiError("invalid_tool_args", "glob requires pat/pattern.", 400);
      const cmd = relPath === "."
        ? `find . -path ${shellQuote(pattern)} | sed 's#^\\./##'`
        : `cd ${shellQuote(relPath)} && find . -path ${shellQuote(pattern)} | sed 's#^\\./##'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: "workspace",
        timeoutSeconds: 25,
        allowNonZero: true,
      });
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `glob failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "grep") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const pattern = String(params.args.pat ?? params.args.pattern ?? "").trim();
      if (!pattern) throw createApiError("invalid_tool_args", "grep requires pat/pattern.", 400);
      const include = String(params.args.include ?? "").trim();
      const cmd = `rg -n --no-heading --color=never ${
        include ? `-g ${shellQuote(include)} ` : ""
      }-- ${shellQuote(pattern)} ${shellQuote(relPath)}`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: "workspace",
        timeoutSeconds: 30,
        allowNonZero: true,
      });
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `grep failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "sha256") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const cmd = `shasum -a 256 ${shellQuote(relPath)} | awk '{print $1}'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: "workspace",
        timeoutSeconds: 20,
        allowNonZero: true,
      });
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `sha256 failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "write") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const content = String(params.args.content ?? "");
      return writeWorkspaceFile({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
        content,
        expectedBeforeSha: normalizeExpectedBeforeSha(params.args),
      });
    }
    if (params.toolName === "edit") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const oldText = String(params.args.old ?? "");
      if (!oldText) {
        throw createApiError("invalid_tool_args", "edit requires non-empty 'old'.", 400);
      }
      const newText = String(params.args.new ?? "");
      const replaceAll = params.args.all === true;
      const fileBefore = await readWorkspaceFileContent({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
      });
      const currentSha = await readWorkspaceFileSha256({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
      });
      if (!currentSha) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "file_not_found",
          errorMessage: `File not found: ${relPath}`,
        };
      }
      const currentExpected = normalizeExpectedBeforeSha(params.args);
      if (
        currentExpected.provided &&
        currentExpected.value !== null &&
        currentExpected.value !== currentSha
      ) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "expected_before_mismatch",
          errorMessage: "expected_before_sha256 mismatch.",
        };
      }
      const replacementCount = replaceAll
        ? fileBefore.split(oldText).length - 1
        : fileBefore.includes(oldText)
          ? 1
          : 0;
      if (replacementCount < 1) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "edit_target_not_found",
          errorMessage: "Could not find requested text to edit.",
        };
      }
      const fileAfter = replaceAll
        ? fileBefore.split(oldText).join(newText)
        : fileBefore.replace(oldText, newText);
      const writeResult = await writeWorkspaceFile({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
        content: fileAfter,
        expectedBeforeSha: currentExpected.provided
          ? currentExpected
          : { provided: true, value: currentSha },
      });
      if (writeResult.status !== "ok") return writeResult;
      return {
        status: "ok",
        exitCode: 0,
        outputText: [
          `edited:${relPath}`,
          `replacements:${replacementCount}`,
          writeResult.outputText,
        ]
          .filter((line) => line.length > 0)
          .join("\n"),
        errorCode: null,
        errorMessage: null,
      };
    }
    if (params.toolName === "bash") {
      const command = String(params.args.cmd ?? params.args.command ?? "").trim();
      if (!command) throw createApiError("invalid_tool_args", "bash requires cmd.", 400);
      const timeoutRaw = Number(params.args.timeout_seconds ?? params.args.timeout ?? 45);
      const timeoutSeconds = Number.isFinite(timeoutRaw)
        ? Math.max(1, Math.min(120, Math.floor(timeoutRaw)))
        : 45;
      const cwd = normalizeOptionalWorkspaceDir(params.args.cwd);
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command,
        cwd,
        timeoutSeconds,
        allowNonZero: true,
      });
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `bash failed with exit code ${result.exitCode}`,
      };
    }
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "tool_not_enabled_for_cloud_daytona_v1",
      errorMessage: "Tool is not enabled for cloud Daytona.",
    };
  } catch (error) {
    const apiError = isApiError(error)
      ? error
      : createApiError("tool_execution_failed", error instanceof Error ? error.message : String(error), 500);
    return {
      status: "error",
      exitCode: null,
      outputText: apiError.message,
      errorCode: apiError.code,
      errorMessage: apiError.message,
    };
  }
}
