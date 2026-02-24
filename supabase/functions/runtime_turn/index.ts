import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import {
  extractBearerToken,
  isAuthApiError,
  requireVerifiedUserId,
} from "../_shared/auth.ts";
import { getEnv } from "../_shared/env.ts";
import { encodeSse, consumeSseEvents } from "../_shared/sse.ts";
import { getSupabaseAdmin, supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import {
  edgeRateLimitAllowKey,
  evaluatePlatformInferenceEntitlement,
  loadUserBuilderTierForPlatformInference,
} from "../_shared/platform_inference_core.ts";
import { DEFAULT_GUEST_MODEL_ID, isFreeModelId } from "../../../shared/modelCatalog.ts";

type RuntimeTurnInput = {
  thread_id?: string;
  model_id?: string | null;
  surface?: "web" | "desktop" | "mobile";
  requires_tools?: boolean;
  stream?: boolean;
  idempotency_key?: string | null;
  prefer_chatgpt_lane?: boolean;
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  max_tokens?: number | null;
};

type InferenceMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type RuntimeLane = "public" | "daytona" | "chatgpt_desktop" | "platform_fallback";

const CANONICAL_CLOUD_RUN_CONTRACT_NAME = "canonical_cloud_run_v1";
const CANONICAL_CLOUD_RUN_CONTRACT_VERSION = "v1";

type RuntimeExecutionMode = "chat" | "agentic";

type RuntimeRunRow = {
  id: string;
  user_id: string;
  thread_id: string;
  project_id: string | null;
  lane: RuntimeLane;
  model_id: string | null;
  requires_tools: boolean;
  sandbox_id: string | null;
  idempotency_key: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type ThreadOwnershipRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
};

type DaytonaSandboxRow = {
  id: string;
  project_id?: string | null;
  provider_sandbox_id: string;
  status: string;
};

type ResolvedDaytonaSandbox = DaytonaSandboxRow & {
  toolbox_proxy_url: string;
};

type DaytonaConfig = {
  api_base_url: string;
  api_key: string;
  org_id: string | null;
  target: string | null;
  snapshot: string | null;
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
  exitCode?: number | null;
  code?: number | null;
};

type LaneExecutionResult = {
  assistantText: string;
  engineId: string;
  modelId: string;
  lane: RuntimeLane;
  sandboxId: string | null;
};

type DaytonaToolName =
  | "read"
  | "list_dir"
  | "glob"
  | "grep"
  | "sha256"
  | "write"
  | "edit"
  | "bash"
  | "update_plan";

type DaytonaToolCallDecision = {
  type: "tool_call";
  tool_name: DaytonaToolName;
  args?: Record<string, unknown> | null;
  reason?: string | null;
};

type DaytonaAssistantDecision = {
  type: "assistant";
  text: string;
};

type DaytonaAgentDecision = DaytonaToolCallDecision | DaytonaAssistantDecision;

type DaytonaToolPolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  policyBasis: string;
  denialCode: string | null;
  denialMessage: string | null;
};

type DaytonaToolExecutionResult = {
  status: "ok" | "error";
  exitCode: number | null;
  outputText: string;
  errorCode: string | null;
  errorMessage: string | null;
};

type ApiError = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

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

async function readJsonBounded<T>(req: Request, maxChars = 384_000): Promise<T> {
  const text = await req.text();
  if (!text) throw createApiError("invalid_request", "Missing JSON body.", 400);
  if (text.length > maxChars) throw createApiError("request_too_large", "Request body too large.", 413);
  return JSON.parse(text) as T;
}

function sanitizeUuid(value: unknown, fieldName: string): string {
  const trimmed = String(value ?? "").trim();
  if (!UUID_RE.test(trimmed)) {
    throw createApiError("invalid_request", `${fieldName} must be a valid UUID.`, 400);
  }
  return trimmed;
}

function normalizeModelId(value: unknown): string {
  const cleaned = String(value ?? "").trim();
  return cleaned || DEFAULT_GUEST_MODEL_ID;
}

function normalizeInferenceRole(value: unknown): InferenceMessage["role"] | null {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "user" || role === "assistant" || role === "system") return role;
  return null;
}

function extractTextFromContentJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (typeof record.text === "string") return record.text.trim();
        if (typeof record.content === "string") return record.content.trim();
      }
      return value.trim();
    } catch {
      return value.trim();
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (typeof record.content === "string") return record.content.trim();
  }
  return "";
}

function normalizeInferenceMessagesFromInput(input: RuntimeTurnInput): InferenceMessage[] {
  const normalized: InferenceMessage[] = [];
  const inputMessages = Array.isArray(input.messages) ? input.messages : [];
  for (const message of inputMessages) {
    if (!message) continue;
    const role = normalizeInferenceRole(message.role);
    if (!role) continue;
    const content = String(message.content ?? "").trim();
    if (!content) continue;
    normalized.push({ role, content });
  }
  if (normalized.length > 0) return normalized;
  const direct = String(input.message?.text ?? "").trim();
  if (direct) return [{ role: "user", content: direct }];
  return [];
}

function resolveLatestUserText(messages: InferenceMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const content = String(message.content ?? "").trim();
    if (content) return content;
  }
  return "";
}

function resolveRuntimeLane(params: {
  isFreeModel: boolean;
  requiresTools: boolean;
  platformEntitled: boolean;
  platformDisabled: boolean;
  preferChatgptLane: boolean;
  surface: string;
  modelId: string;
}): RuntimeLane {
  if (
    !params.requiresTools &&
    params.surface === "desktop" &&
    params.preferChatgptLane &&
    params.modelId.toLowerCase().startsWith("gpt-") &&
    !params.modelId.toLowerCase().startsWith("gpt-oss-")
  ) {
    return "chatgpt_desktop";
  }
  if (params.requiresTools) {
    if (!params.platformEntitled) {
      throw createApiError(
        "platform_inference_not_allowed",
        "Arx platform inference is not included in your plan.",
        403,
      );
    }
    return "daytona";
  }
  if (params.isFreeModel) return "public";
  if (params.platformDisabled) {
    throw createApiError(
      "platform_inference_disabled",
      "Arx platform inference is disabled.",
      403,
    );
  }
  if (params.platformEntitled) return "platform_fallback";
  throw createApiError(
    "platform_inference_not_allowed",
    "Arx platform inference is not included in your plan.",
    403,
  );
}

async function loadThreadOwnership(threadId: string): Promise<ThreadOwnershipRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&select=id,owner_id,project_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw createApiError("thread_lookup_failed", await res.text(), 500);
  const rows = (await res.json()) as Array<Partial<ThreadOwnershipRow>>;
  const row = rows[0];
  if (!row?.id || !row?.owner_id) return null;
  return { id: row.id, owner_id: row.owner_id, project_id: typeof row.project_id === "string" ? row.project_id : null };
}

function normalizeProjectId(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function resolveExecutionMode(requiresTools: boolean): RuntimeExecutionMode {
  return requiresTools ? "agentic" : "chat";
}

function normalizeToolName(value: unknown): DaytonaToolName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "read" ||
    normalized === "list_dir" ||
    normalized === "glob" ||
    normalized === "grep" ||
    normalized === "sha256" ||
    normalized === "write" ||
    normalized === "edit" ||
    normalized === "bash" ||
    normalized === "update_plan"
  ) {
    return normalized;
  }
  return null;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline <= 0) return trimmed;
  const closingFence = trimmed.lastIndexOf("```");
  if (closingFence <= firstNewline) return trimmed;
  return trimmed.slice(firstNewline + 1, closingFence).trim();
}

function parseDaytonaAgentDecision(rawText: string): DaytonaAgentDecision | null {
  const stripped = stripCodeFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const type = String(record.type ?? "").trim().toLowerCase();
  if (type === "assistant") {
    const text = String(record.text ?? "").trim();
    if (!text) return null;
    return { type: "assistant", text };
  }
  if (type === "tool_call") {
    const toolName = normalizeToolName(record.tool_name);
    if (!toolName) return null;
    const args = record.args && typeof record.args === "object" && !Array.isArray(record.args)
      ? (record.args as Record<string, unknown>)
      : {};
    const reason = String(record.reason ?? "").trim() || null;
    return {
      type: "tool_call",
      tool_name: toolName,
      args,
      reason,
    };
  }
  return null;
}

function buildDaytonaAgentSystemPrompt(params: {
  projectId: string;
  sandboxId: string;
  maxIterations: number;
}): string {
  return [
    "You are the Arx cloud coding agent running inside a Daytona sandbox.",
    "Return only strict JSON (no prose, no markdown).",
    "Allowed JSON outputs:",
    '1) {"type":"assistant","text":"..."}',
    '2) {"type":"tool_call","tool_name":"read|list_dir|glob|grep|sha256|write|edit|bash|update_plan","args":{...},"reason":"..."}',
    "Rules:",
    "- At most one tool_call per response.",
    "- Prefer read/list_dir/glob/grep/sha256 before any risky operation.",
    "- Keep paths relative to workspace root and never use absolute paths.",
    "- If a tool result indicates denial/error, adapt and continue without repeating the same failing call.",
    `- You have a max of ${params.maxIterations} tool iterations this run.`,
    `Context: project_id=${params.projectId}, sandbox_id=${params.sandboxId}`,
  ].join("\n");
}

function normalizeRelativeWorkspacePath(raw: unknown): string {
  const candidate = String(raw ?? "").trim().replaceAll("\\", "/");
  if (!candidate) throw createApiError("invalid_tool_args", "Tool path is required.", 400);
  if (candidate.startsWith("/")) {
    throw createApiError("path_outside_workspace", "Absolute paths are not allowed.", 403);
  }
  const segments = candidate.split("/").filter((part) => part.length > 0 && part !== ".");
  if (segments.length === 0) {
    throw createApiError("invalid_tool_args", "Tool path is required.", 400);
  }
  if (segments.some((part) => part === "..")) {
    throw createApiError("path_outside_workspace", "Parent directory traversal is not allowed.", 403);
  }
  return segments.join("/");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  return Array.from(view).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeToolCallKey(params: {
  toolName: DaytonaToolName;
  args: Record<string, unknown>;
  projectId: string;
}): Promise<string> {
  const canonicalArgs = JSON.stringify(params.args, Object.keys(params.args).sort());
  return sha256Hex(`${params.projectId}:${params.toolName}:${canonicalArgs}`);
}

function resolveDaytonaToolPolicy(toolName: DaytonaToolName): DaytonaToolPolicyDecision {
  if (
    toolName === "read" ||
    toolName === "list_dir" ||
    toolName === "glob" ||
    toolName === "grep" ||
    toolName === "sha256"
  ) {
    return {
      allowed: true,
      requiresApproval: false,
      policyBasis: "cloud_policy_v1:readonly_auto_allow",
      denialCode: null,
      denialMessage: null,
    };
  }
  return {
    allowed: false,
    requiresApproval: true,
    policyBasis: "cloud_policy_v1:write_tools_disabled",
    denialCode: "tool_not_enabled_for_cloud_daytona_v1",
    denialMessage: "This tool is not enabled for cloud Daytona yet.",
  };
}

async function ensureDefaultCloudProjectId(userId: string): Promise<string> {
  const ownerFilter = `owner_id=eq.${encodeURIComponent(userId)}`;
  const generalLookup = await supabaseAdminFetch(
    `/rest/v1/cloud_projects?select=id,status&${ownerFilter}&slug=eq.general&order=updated_at.desc&limit=1`,
    { method: "GET" },
  );
  if (!generalLookup.ok) {
    throw createApiError("project_lookup_failed", await generalLookup.text(), 500);
  }
  const generalRows = (await generalLookup.json()) as Array<{ id?: string | null; status?: string | null }>;
  const general = generalRows[0] ?? null;
  const generalId = normalizeProjectId(general?.id);
  if (generalId) {
    const status = String(general?.status ?? "").trim().toLowerCase();
    if (status !== "active") {
      const reactivate = await supabaseAdminFetch(
        `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(generalId)}&${ownerFilter}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ status: "active" }),
        },
      );
      if (!reactivate.ok) {
        throw createApiError("project_lookup_failed", await reactivate.text(), 500);
      }
      const reactivated = (await reactivate.json()) as Array<{ id?: string | null }>;
      const reactivatedId = normalizeProjectId(reactivated[0]?.id);
      if (reactivatedId) return reactivatedId;
      throw createApiError("project_lookup_failed", "Failed to reactivate default project.", 500);
    }
    return generalId;
  }

  const activeLookup = await supabaseAdminFetch(
    `/rest/v1/cloud_projects?select=id&${ownerFilter}&status=eq.active&order=updated_at.desc&limit=1`,
    { method: "GET" },
  );
  if (!activeLookup.ok) {
    throw createApiError("project_lookup_failed", await activeLookup.text(), 500);
  }
  const activeRows = (await activeLookup.json()) as Array<{ id?: string | null }>;
  const activeId = normalizeProjectId(activeRows[0]?.id);
  if (activeId) return activeId;

  const createDefault = await supabaseAdminFetch("/rest/v1/cloud_projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      owner_id: userId,
      name: "General",
      slug: "general",
      status: "active",
    }),
  });
  if (createDefault.ok) {
    const createdRows = (await createDefault.json()) as Array<{ id?: string | null }>;
    const createdId = normalizeProjectId(createdRows[0]?.id);
    if (createdId) return createdId;
    throw createApiError("project_lookup_failed", "Default cloud project payload is missing id.", 500);
  }

  const raceLookup = await supabaseAdminFetch(
    `/rest/v1/cloud_projects?select=id,status&${ownerFilter}&slug=eq.general&order=updated_at.desc&limit=1`,
    { method: "GET" },
  );
  if (!raceLookup.ok) {
    throw createApiError("project_lookup_failed", await raceLookup.text(), 500);
  }
  const raceRows = (await raceLookup.json()) as Array<{ id?: string | null; status?: string | null }>;
  const raceProjectId = normalizeProjectId(raceRows[0]?.id);
  if (raceProjectId) {
    const raceStatus = String(raceRows[0]?.status ?? "").trim().toLowerCase();
    if (raceStatus !== "active") {
      const reactivateRace = await supabaseAdminFetch(
        `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(raceProjectId)}&${ownerFilter}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ status: "active" }),
        },
      );
      if (!reactivateRace.ok) {
        throw createApiError("project_lookup_failed", await reactivateRace.text(), 500);
      }
    }
    return raceProjectId;
  }

  throw createApiError(
    "project_required",
    "No active cloud project is available for tool execution.",
    409,
  );
}

async function bindThreadProjectId(threadId: string, userId: string, projectId: string): Promise<void> {
  const response = await supabaseAdminFetch(
    `/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(userId)}&project_id=is.null`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        project_id: projectId,
      }),
    },
  );
  if (!response.ok) {
    throw createApiError("thread_project_bind_failed", await response.text(), 500);
  }
}

type RecentMessageRow = {
  role?: string | null;
  content_json?: unknown;
  seq?: number | null;
};

async function loadRecentThreadMessages(threadId: string): Promise<InferenceMessage[]> {
  const response = await supabaseAdminFetch(
    `/rest/v1/messages?select=role,content_json,seq&thread_id=eq.${encodeURIComponent(threadId)}&order=seq.desc&limit=40`,
    { method: "GET" },
  );
  if (!response.ok) {
    throw createApiError("thread_messages_lookup_failed", await response.text(), 500);
  }
  const rowsDesc = (await response.json()) as RecentMessageRow[];
  const messages: InferenceMessage[] = [];
  for (const row of [...rowsDesc].reverse()) {
    const role = normalizeInferenceRole(row?.role);
    if (!role) continue;
    const content = extractTextFromContentJson(row?.content_json).trim();
    if (!content) continue;
    messages.push({ role, content });
  }
  return messages;
}

async function findExistingRun(userId: string, threadId: string, idempotencyKey: string): Promise<RuntimeRunRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/runtime_runs?select=id,user_id,thread_id,project_id,lane,model_id,requires_tools,sandbox_id,idempotency_key,status,error_code,error_message,created_at,started_at,finished_at&user_id=eq.${encodeURIComponent(
      userId,
    )}&thread_id=eq.${encodeURIComponent(threadId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw createApiError("run_lookup_failed", await res.text(), 500);
  const rows = (await res.json()) as RuntimeRunRow[];
  return rows[0] ?? null;
}

async function createRuntimeRun(params: {
  userId: string;
  threadId: string;
  projectId: string | null;
  lane: RuntimeLane;
  modelId: string;
  requiresTools: boolean;
  idempotencyKey: string;
  sandboxId: string | null;
  surface: string;
}): Promise<RuntimeRunRow> {
  const res = await supabaseAdminFetch("/rest/v1/runtime_runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: params.userId,
      thread_id: params.threadId,
      project_id: params.projectId,
      lane: params.lane,
      model_id: params.modelId,
      requires_tools: params.requiresTools,
      sandbox_id: params.sandboxId,
      idempotency_key: params.idempotencyKey,
      status: "running",
      started_at: new Date().toISOString(),
      metadata: {
        surface: params.surface,
      },
    }),
  });
  if (!res.ok) throw createApiError("run_create_failed", await res.text(), 500);
  const rows = (await res.json()) as RuntimeRunRow[];
  const row = rows[0];
  if (!row) throw createApiError("run_create_failed", "Failed to create runtime run.", 500);
  return row;
}

async function appendRuntimeRunEvent(runId: string, seq: number, eventType: string, payload: Record<string, unknown>) {
  const res = await supabaseAdminFetch("/rest/v1/runtime_run_events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      run_id: runId,
      seq,
      event_type: eventType,
      payload,
    }),
  });
  if (!res.ok) throw createApiError("run_event_append_failed", await res.text(), 500);
}

async function patchRuntimeRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/runtime_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw createApiError("run_update_failed", await res.text(), 500);
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

function loadDaytonaConfig(): DaytonaConfig {
  const apiKey = String(getEnv("DAYTONA_API_KEY") ?? "").trim();
  if (!apiKey) {
    throw createApiError("runner_unavailable", "Daytona runner is unavailable. Missing DAYTONA_API_KEY.", 503);
  }
  const apiBaseUrl = normalizeDaytonaApiBaseUrl(String(getEnv("DAYTONA_API_URL") ?? ""));
  const orgId = String(getEnv("DAYTONA_ORG_ID") ?? "").trim() || null;
  const target = String(getEnv("DAYTONA_TARGET") ?? "").trim() || null;
  const snapshot = String(getEnv("DAYTONA_SNAPSHOT") ?? "").trim() || null;
  return {
    api_base_url: apiBaseUrl,
    api_key: apiKey,
    org_id: orgId,
    target,
    snapshot,
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

function mapDaytonaStateToLocalStatus(daytonaState: string | null | undefined): DaytonaSandboxRow["status"] {
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
  const payload: Record<string, unknown> = {
    labels: {
      arx_user_id: params.userId,
      arx_project_id: params.projectId,
      arx_source: "runtime_turn",
    },
  };
  if (config.target) payload.target = config.target;
  if (config.snapshot) payload.snapshot = config.snapshot;
  return daytonaApiRequest<DaytonaSandboxApiDto>({
    config,
    path: "/sandbox",
    method: "POST",
    body: payload,
  });
}

async function getDaytonaToolboxProxyUrl(config: DaytonaConfig, sandboxId: string): Promise<string> {
  const payload = await daytonaApiRequest<DaytonaToolboxProxyUrlDto>({
    config,
    path: `/sandbox/${encodeURIComponent(sandboxId)}/toolbox-proxy-url`,
    method: "GET",
  });
  const url = String(payload.url ?? "").trim();
  if (!url) throw createApiError("runner_unavailable", "Daytona toolbox proxy URL is missing.", 503);
  return url.replace(/\/+$/, "");
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

async function ensureDaytonaSandbox(params: {
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
}

async function executeDaytonaCommand(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  command: string;
  cwd?: string | null;
  timeoutSeconds?: number | null;
  allowNonZero?: boolean;
}): Promise<{ stdout: string; exitCode: number }> {
  const payload: Record<string, unknown> = {
    command: params.command,
    ...(params.cwd ? { cwd: params.cwd } : null),
    ...(typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
      ? { timeout: Math.max(1, Math.min(120, Math.floor(params.timeoutSeconds))) }
      : null),
  };
  const response = await fetch(`${params.toolboxProxyUrl}/process/execute`, {
    method: "POST",
    headers: daytonaHeaders(params.config, true),
    body: JSON.stringify(payload),
  });
  const { text, json } = await parseResponseBody(response);
  if (!response.ok) {
    throw createApiError(
      "runner_unavailable",
      `Daytona toolbox command failed (${response.status}): ${text || response.statusText}`,
      503,
    );
  }
  const parsed = (json ?? {}) as DaytonaProcessExecuteDto;
  const exitCodeRaw = parsed.exitCode ?? parsed.code;
  const exitCode = Number.isFinite(Number(exitCodeRaw)) ? Number(exitCodeRaw) : 0;
  const stdout = typeof parsed.result === "string" ? parsed.result : String(parsed.result ?? "");
  if (exitCode !== 0 && params.allowNonZero !== true) {
    throw createApiError(
      "daytona_command_failed",
      `Daytona command failed with exit code ${exitCode}.`,
      502,
    );
  }
  return { stdout, exitCode };
}

async function executePublicLane(params: { modelId: string; messages: InferenceMessage[] }): Promise<LaneExecutionResult> {
  const admin = getSupabaseAdmin();
  const response = await fetch(`${admin.url}/functions/v1/public_turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: params.modelId,
      stream: false,
      messages: params.messages,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw createApiError("public_turn_failed", bodyText || "Public turn failed.", response.status);
  }
  const payload = JSON.parse(bodyText) as {
    ok?: boolean;
    content?: unknown;
    model_id?: unknown;
    engine_id?: unknown;
    error?: unknown;
    message?: unknown;
  };
  if (!payload?.ok) {
    throw createApiError(
      "public_turn_failed",
      String(payload?.message ?? payload?.error ?? "Public turn failed."),
      502,
    );
  }
  const assistantText = String(payload.content ?? "").trim();
  if (!assistantText) throw createApiError("empty_response", "Model returned an empty response.", 502);
  return {
    assistantText,
    engineId: String(payload.engine_id ?? "public_turn"),
    modelId: String(payload.model_id ?? params.modelId),
    lane: "public",
    sandboxId: null,
  };
}

function extractPlatformDeltaFromSseData(rawData: string): string {
  const trimmed = String(rawData ?? "").trim();
  if (!trimmed || trimmed === "[DONE]") return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const choice0 = Array.isArray(parsed.choices) ? (parsed.choices[0] as Record<string, unknown> | undefined) : undefined;
    const delta = choice0 && typeof choice0.delta === "object" && choice0.delta
      ? (choice0.delta as Record<string, unknown>)
      : null;
    const deltaContent = typeof delta?.content === "string" ? delta.content : "";
    if (deltaContent) return deltaContent;
    const text = typeof choice0?.text === "string" ? choice0.text : "";
    if (text) return text;
    const message = choice0 && typeof choice0.message === "object" && choice0.message
      ? (choice0.message as Record<string, unknown>)
      : null;
    const messageContent = typeof message?.content === "string" ? message.content : "";
    if (messageContent) return messageContent;
    const anthropicDelta = parsed.delta && typeof parsed.delta === "object"
      ? (parsed.delta as Record<string, unknown>)
      : null;
    const anthropicText = typeof anthropicDelta?.text === "string" ? anthropicDelta.text : "";
    if (anthropicText) return anthropicText;
    return "";
  } catch {
    return "";
  }
}

async function executePlatformFallbackLane(params: {
  request: Request;
  modelId: string;
  messages: InferenceMessage[];
  maxTokens: number | null;
}): Promise<LaneExecutionResult> {
  const admin = getSupabaseAdmin();
  const token = extractBearerToken(params.request);
  const response = await fetch(`${admin.url}/functions/v1/platform_agent_infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_id: params.modelId,
      request: {
        model: params.modelId,
        messages: params.messages,
        stream: true,
        ...(typeof params.maxTokens === "number" && Number.isFinite(params.maxTokens)
          ? { max_tokens: params.maxTokens }
          : null),
      },
    }),
  });
  if (!response.ok) {
    const body = (await response.text()).trim();
    throw createApiError(
      "platform_fallback_failed",
      body || "Platform inference failed.",
      response.status,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw createApiError("platform_fallback_failed", "Missing platform stream.", 502);
  }

  let fullContent = "";
  await consumeSseEvents({
    reader,
    onData: (raw) => {
      const delta = extractPlatformDeltaFromSseData(raw);
      if (delta) fullContent += delta;
      return false;
    },
  });
  const assistantText = fullContent.trim();
  if (!assistantText) {
    throw createApiError("empty_response", "Platform model returned an empty response.", 502);
  }
  return {
    assistantText,
    engineId: "platform_agent_infer",
    modelId: params.modelId,
    lane: "platform_fallback",
    sandboxId: null,
  };
}

async function executeDaytonaTool(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  toolName: DaytonaToolName;
  args: Record<string, unknown>;
}): Promise<DaytonaToolExecutionResult> {
  try {
    if (params.toolName === "read") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const offsetRaw = Number(params.args.offset ?? 0);
      const limitRaw = Number(params.args.limit ?? 200);
      const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(400, Math.floor(limitRaw))) : 200;
      const start = offset + 1;
      const end = offset + limit;
      const cmd =
        `set -euo pipefail; FILE=${shellQuote(relPath)}; ` +
        `if [ ! -f "$FILE" ]; then echo "file_not_found:$FILE"; exit 2; fi; ` +
        `nl -ba "$FILE" | sed -n '${start},${end}p'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
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
        ? "set -euo pipefail; ls -la"
        : `set -euo pipefail; ls -la ${shellQuote(relPath)}`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
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
        errorMessage: result.exitCode === 0 ? null : `list_dir failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "glob") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const pattern = String(params.args.pat ?? params.args.pattern ?? "").trim();
      if (!pattern) throw createApiError("invalid_tool_args", "glob requires pat/pattern.", 400);
      const cmd = relPath === "."
        ? `set -euo pipefail; find . -path ${shellQuote(pattern)} | sed 's#^\\./##'`
        : `set -euo pipefail; cd ${shellQuote(relPath)} && find . -path ${shellQuote(pattern)} | sed 's#^\\./##'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
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
      const cmd = `set -euo pipefail; rg -n --no-heading --color=never ${
        include ? `-g ${shellQuote(include)} ` : ""
      }-- ${shellQuote(pattern)} ${shellQuote(relPath)}`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
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
      const cmd = `set -euo pipefail; shasum -a 256 ${shellQuote(relPath)} | awk '{print $1}'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
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
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "tool_not_enabled_for_cloud_daytona_v1",
      errorMessage: "This tool is not enabled for cloud Daytona yet.",
    };
  } catch (error) {
    const apiError = isApiError(error)
      ? error
      : createApiError("tool_execution_failed", error instanceof Error ? error.message : String(error), 500);
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: apiError.code,
      errorMessage: apiError.message,
    };
  }
}

async function executeDaytonaLane(params: {
  request: Request;
  modelId: string;
  messages: InferenceMessage[];
  maxTokens: number | null;
  projectId: string;
  sandbox: ResolvedDaytonaSandbox;
  appendRunEvent: (eventType: string, payload: Record<string, unknown>) => Promise<void>;
}): Promise<LaneExecutionResult> {
  const config = loadDaytonaConfig();
  const probe = await executeDaytonaCommand({
    config,
    toolboxProxyUrl: params.sandbox.toolbox_proxy_url,
    command: "pwd",
    cwd: "workspace",
    timeoutSeconds: 10,
  });
  await params.appendRunEvent("daytona_probe_finished", {
    contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
    contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
    project_id: params.projectId,
    sandbox_id: params.sandbox.id,
    provider_sandbox_id: params.sandbox.provider_sandbox_id,
    exit_code: probe.exitCode,
    stdout_preview: probe.stdout.slice(0, 200),
  });
  const maxIterations = 8;
  const transcript: InferenceMessage[] = [
    {
      role: "system",
      content: buildDaytonaAgentSystemPrompt({
        projectId: params.projectId,
        sandboxId: params.sandbox.id,
        maxIterations,
      }),
    },
    ...params.messages.map((message) => ({ role: message.role, content: message.content })),
  ];

  const callInference = async (): Promise<LaneExecutionResult> => {
    if (isFreeModelId(params.modelId)) {
      return executePublicLane({
        modelId: params.modelId,
        messages: transcript,
      });
    }
    return executePlatformFallbackLane({
      request: params.request,
      modelId: params.modelId,
      messages: transcript,
      maxTokens: params.maxTokens,
    });
  };

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const infer = await callInference();
    const rawAssistantText = infer.assistantText.trim();
    if (!rawAssistantText) {
      throw createApiError("empty_response", "Daytona lane model returned an empty response.", 502);
    }
    const decision = parseDaytonaAgentDecision(rawAssistantText);
    if (!decision) {
      return {
        assistantText: rawAssistantText,
        engineId: `daytona/${infer.engineId}`,
        modelId: infer.modelId,
        lane: "daytona",
        sandboxId: params.sandbox.id,
      };
    }

    if (decision.type === "assistant") {
      return {
        assistantText: decision.text,
        engineId: `daytona/${infer.engineId}`,
        modelId: infer.modelId,
        lane: "daytona",
        sandboxId: params.sandbox.id,
      };
    }

    const toolCallId = crypto.randomUUID();
    const normalizedArgs = decision.args ?? {};
    const toolCallKey = await makeToolCallKey({
      toolName: decision.tool_name,
      args: normalizedArgs,
      projectId: params.projectId,
    });
    const policy = resolveDaytonaToolPolicy(decision.tool_name);

    await params.appendRunEvent("tool_call_requested", {
      contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
      contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
      tool_call_id: toolCallId,
      tool_call_key: toolCallKey,
      tool_name: decision.tool_name,
      args: normalizedArgs,
      requires_approval: policy.requiresApproval,
      policy_basis: policy.policyBasis,
      reason: decision.reason ?? null,
      iteration,
    });

    if (!policy.allowed) {
      await params.appendRunEvent("tool_call_denied", {
        contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
        contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
        tool_call_id: toolCallId,
        approved: false,
        approved_by: "policy",
        code: policy.denialCode,
        message: policy.denialMessage,
      });
      transcript.push({
        role: "assistant",
        content: rawAssistantText,
      });
      transcript.push({
        role: "system",
        content: [
          "TOOL_RESULT",
          `tool_name=${decision.tool_name}`,
          `status=denied`,
          `code=${policy.denialCode ?? "tool_denied"}`,
          `message=${policy.denialMessage ?? "Tool call denied by cloud policy."}`,
        ].join("\n"),
      });
      continue;
    }

    await params.appendRunEvent("tool_call_approved", {
      contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
      contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
      tool_call_id: toolCallId,
      approved: true,
      approved_by: "policy",
      note: "Auto-approved by cloud read-only tool policy.",
    });

    await params.appendRunEvent("tool_call_started", {
      contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
      contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
      tool_call_id: toolCallId,
      attempt: 1,
      cwd: "workspace",
      workspace_scope_id: params.projectId,
      sandbox: {
        sandbox_id: params.sandbox.id,
        provider_sandbox_id: params.sandbox.provider_sandbox_id,
      },
    });

    const toolResult = await executeDaytonaTool({
      config,
      toolboxProxyUrl: params.sandbox.toolbox_proxy_url,
      toolName: decision.tool_name,
      args: normalizedArgs,
    });

    await params.appendRunEvent("tool_call_finished", {
      contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
      contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
      tool_call_id: toolCallId,
      attempt: 1,
      status: toolResult.status,
      exit_code: toolResult.exitCode,
      error_code: toolResult.errorCode,
      error_message: toolResult.errorMessage,
      output_preview: toolResult.outputText.slice(0, 2_000),
    });

    transcript.push({
      role: "assistant",
      content: rawAssistantText,
    });
    transcript.push({
      role: "system",
      content: [
        "TOOL_RESULT",
        `tool_name=${decision.tool_name}`,
        `status=${toolResult.status}`,
        `exit_code=${toolResult.exitCode ?? ""}`,
        toolResult.errorCode ? `error_code=${toolResult.errorCode}` : "",
        toolResult.errorMessage ? `error_message=${toolResult.errorMessage}` : "",
        "output:",
        toolResult.outputText || "(empty)",
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    });
  }

  throw createApiError(
    "run_loop_limit_exceeded",
    `Daytona run exceeded max tool iterations (${maxIterations}).`,
    502,
  );
}

function buildStreamHeaders(baseHeaders: Record<string, string>): Headers {
  return new Headers({
    ...baseHeaders,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
}

Deno.serve(async (req: Request) => {
  const cors = withStrictCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  }
  if (!cors.allowed) {
    return jsonResponse({ ok: false, error: "cors_origin_not_allowed" }, { status: 403, headers: cors.headers });
  }
  const headers = cors.headers;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const userId = await requireVerifiedUserId(req);
    const [ipAllowed, userAllowed] = await Promise.all([
      edgeRateLimitAllow({ req, key: "runtime_turn", windowSeconds: 60, limit: 120 }),
      edgeRateLimitAllowKey({ key: `runtime_turn:user:${userId}`, windowSeconds: 60, limit: 60 }),
    ]);
    if (!ipAllowed || !userAllowed) {
      return jsonResponse(
        { ok: false, error: "rate_limited", code: "rate_limited", message: "Too many requests. Try again soon." },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }

    const input = await readJsonBounded<RuntimeTurnInput>(req);
    const threadId = sanitizeUuid(input.thread_id, "thread_id");
    const modelId = normalizeModelId(input.model_id);
    const requiresTools = input.requires_tools === true;
    const wantsStream = input.stream !== false;
    const surface = String(input.surface ?? "web").trim().toLowerCase() || "web";
    const preferChatgptLane = input.prefer_chatgpt_lane === true;
    const idempotencyKey = String(input.idempotency_key ?? "").trim() || crypto.randomUUID();
    const executionMode = resolveExecutionMode(requiresTools);

    const thread = await loadThreadOwnership(threadId);
    if (!thread) {
      return jsonResponse({ ok: false, error: "thread_not_found" }, { status: 404, headers });
    }
    if (thread.owner_id !== userId) {
      return jsonResponse({ ok: false, error: "forbidden_thread_access" }, { status: 403, headers });
    }
    let threadProjectId = normalizeProjectId(thread.project_id);

    let inferenceMessages = normalizeInferenceMessagesFromInput(input);
    if (inferenceMessages.length === 0) {
      inferenceMessages = await loadRecentThreadMessages(threadId);
    }
    if (inferenceMessages.length === 0) {
      throw createApiError("invalid_request", "Missing user message.", 400);
    }
    if (!resolveLatestUserText(inferenceMessages)) {
      throw createApiError("invalid_request", "Missing user message.", 400);
    }

    const existingRun = await findExistingRun(userId, threadId, idempotencyKey);
    if (existingRun) {
      if (!wantsStream) {
        return jsonResponse(
          {
            ok: true,
            deduped: true,
            run_id: existingRun.id,
            status: existingRun.status,
            lane: existingRun.lane,
            project_id: existingRun.project_id,
            model_id: existingRun.model_id,
          },
          { status: 200, headers },
        );
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encodeSse("start", {
              run_id: existingRun.id,
              lane: existingRun.lane,
              project_id: existingRun.project_id,
              model_id: existingRun.model_id,
              deduped: true,
            }),
          );
          controller.enqueue(
            encodeSse("done", {
              ok: true,
              run_id: existingRun.id,
              lane: existingRun.lane,
              project_id: existingRun.project_id,
              model_id: existingRun.model_id,
              deduped: true,
              status: existingRun.status,
            }),
          );
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: buildStreamHeaders(headers) });
    }

    const isFreeModel = isFreeModelId(modelId);
    const tier = await loadUserBuilderTierForPlatformInference(userId);
    const entitlement = evaluatePlatformInferenceEntitlement(tier);
    const lane = resolveRuntimeLane({
      isFreeModel,
      requiresTools,
      platformEntitled: entitlement.allowed,
      platformDisabled: entitlement.reason === "platform_inference_disabled",
      preferChatgptLane,
      surface,
      modelId,
    });
    if (lane === "daytona" && !threadProjectId) {
      threadProjectId = await ensureDefaultCloudProjectId(userId);
      await bindThreadProjectId(threadId, userId, threadProjectId);
    }

    let sandboxId: string | null = null;
    let resolvedSandbox: ResolvedDaytonaSandbox | null = null;
    if (lane === "daytona") {
      if (!threadProjectId) {
        throw createApiError("project_required", "Tool turns require a project-bound thread.", 409);
      }
      const sandbox = await ensureDaytonaSandbox({ userId, projectId: threadProjectId });
      sandboxId = sandbox.id;
      resolvedSandbox = sandbox;
    }

    const run = await createRuntimeRun({
      userId,
      threadId,
      projectId: threadProjectId,
      lane,
      modelId,
      requiresTools,
      idempotencyKey,
      sandboxId,
      surface,
    });
    let eventSeq = 1;
    const appendEvent = async (eventType: string, payload: Record<string, unknown>) => {
      await appendRuntimeRunEvent(run.id, eventSeq, eventType, payload);
      eventSeq += 1;
    };
    await appendEvent("run_started", {
      contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
      contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
      execution_mode: executionMode,
      lane,
      project_id: threadProjectId,
      model_id: modelId,
      requires_tools: requiresTools,
      sandbox_id: sandboxId,
      surface,
    });

    const executeLane = async (): Promise<LaneExecutionResult> => {
      if (lane === "public") {
        return executePublicLane({ modelId, messages: inferenceMessages });
      }
      if (lane === "platform_fallback") {
        return executePlatformFallbackLane({
          request: req,
          modelId,
          messages: inferenceMessages,
          maxTokens: typeof input.max_tokens === "number" ? input.max_tokens : null,
        });
      }
      if (lane === "chatgpt_desktop") {
        throw createApiError(
          "runner_unavailable",
          "chatgpt_desktop lane must execute from desktop runtime.",
          409,
        );
      }
      if (!resolvedSandbox) {
        throw createApiError("runner_unavailable", "Daytona sandbox is unavailable for this run.", 503);
      }
      if (!threadProjectId) {
        throw createApiError("project_required", "Tool turns require a project-bound thread.", 409);
      }
      return executeDaytonaLane({
        request: req,
        modelId,
        messages: inferenceMessages,
        maxTokens: typeof input.max_tokens === "number" ? input.max_tokens : null,
        projectId: threadProjectId,
        sandbox: resolvedSandbox,
        appendRunEvent: appendEvent,
      });
    };

    if (!wantsStream) {
      try {
        const result = await executeLane();
        await appendEvent("run_completed", {
          contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
          contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
          execution_mode: executionMode,
          lane: result.lane,
          project_id: threadProjectId,
          model_id: result.modelId,
          engine_id: result.engineId,
          content_chars: result.assistantText.length,
        });
        await patchRuntimeRun(run.id, {
          status: "completed",
          finished_at: new Date().toISOString(),
          model_id: result.modelId,
        });
        return jsonResponse(
          {
            ok: true,
            run_id: run.id,
            lane: result.lane,
            model_id: result.modelId,
            engine_id: result.engineId,
            content: result.assistantText,
            sandbox_id: result.sandboxId,
          },
          { status: 200, headers },
        );
      } catch (error) {
        const apiError = isApiError(error)
          ? error
          : createApiError("runtime_turn_failed", error instanceof Error ? error.message : String(error), 500);
        await appendEvent("run_failed", {
          contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
          contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
          execution_mode: executionMode,
          lane,
          project_id: threadProjectId,
          code: apiError.code,
          message: apiError.message,
          ...(apiError.details ? { details: apiError.details } : null),
        });
        await patchRuntimeRun(run.id, {
          status: "failed",
          error_code: apiError.code,
          error_message: apiError.message,
          finished_at: new Date().toISOString(),
        });
        return jsonResponse(
          { ok: false, error: apiError.code, code: apiError.code, message: apiError.message },
          { status: apiError.status, headers },
        );
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(encodeSse(event, data));
        try {
          emit("start", {
            run_id: run.id,
            contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
            contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
            execution_mode: executionMode,
            lane,
            project_id: threadProjectId,
            model_id: modelId,
            sandbox_id: sandboxId,
          });
          const result = await executeLane();
          emit("delta", {
            run_id: run.id,
            delta: result.assistantText,
            full_content: result.assistantText,
            lane: result.lane,
          });
          await appendEvent("run_completed", {
            contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
            contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
            execution_mode: executionMode,
            lane: result.lane,
            project_id: threadProjectId,
            model_id: result.modelId,
            engine_id: result.engineId,
            content_chars: result.assistantText.length,
          });
          await patchRuntimeRun(run.id, {
            status: "completed",
            finished_at: new Date().toISOString(),
            model_id: result.modelId,
          });
          emit("done", {
            ok: true,
            run_id: run.id,
            contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
            contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
            execution_mode: executionMode,
            lane: result.lane,
            project_id: threadProjectId,
            model_id: result.modelId,
            engine_id: result.engineId,
            full_content: result.assistantText,
            sandbox_id: result.sandboxId,
          });
        } catch (error) {
          const apiError = isApiError(error)
            ? error
            : createApiError("runtime_turn_failed", error instanceof Error ? error.message : String(error), 500);
          emit("error", {
            ok: false,
            run_id: run.id,
            contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
            contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
            execution_mode: executionMode,
            lane,
            project_id: threadProjectId,
            code: apiError.code,
            message: apiError.message,
            retryable: apiError.status >= 500,
          });
          try {
              await appendEvent("run_failed", {
                contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
                contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
                execution_mode: executionMode,
                lane,
                project_id: threadProjectId,
                code: apiError.code,
                message: apiError.message,
                ...(apiError.details ? { details: apiError.details } : null),
            });
            await patchRuntimeRun(run.id, {
              status: "failed",
              error_code: apiError.code,
              error_message: apiError.message,
              finished_at: new Date().toISOString(),
            });
          } catch {
            // Ignore secondary write failures while closing stream.
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: buildStreamHeaders(headers),
    });
  } catch (error) {
    if (isAuthApiError(error)) {
      return jsonResponse(
        { ok: false, error: error.code, code: error.code, message: error.message },
        { status: error.status, headers },
      );
    }
    const apiError = isApiError(error)
      ? error
      : createApiError("runtime_turn_failed", error instanceof Error ? error.message : String(error), 400);
    return jsonResponse(
      {
        ok: false,
        error: apiError.code,
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details ? { details: apiError.details } : null),
      },
      { status: apiError.status, headers },
    );
  }
});
