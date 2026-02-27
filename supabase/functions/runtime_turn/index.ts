import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import {
  extractBearerToken,
  isAuthApiError,
  requireVerifiedUserId,
} from "../_shared/auth.ts";
import { encodeSse } from "../_shared/sse.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import {
  edgeRateLimitAllowKey,
  evaluatePlatformInferenceEntitlement,
  loadUserBuilderTierForPlatformInference,
} from "../_shared/platform_inference_core.ts";
import {
  normalizeCloudApprovalMode,
  type CloudApprovalMode,
} from "../_shared/cloud_harness_core.ts";
import {
  ensureDaytonaSandbox,
  setDaytonaSandboxStatus,
  type DaytonaLocalSandboxStatus,
  type ResolvedDaytonaSandbox,
} from "../_shared/daytona_cloud_adapter.ts";
import { executeDaytonaLane } from "../_shared/daytona_cloud_lane.ts";
import {
  createRuntimeRunStore,
  type RuntimeLane,
} from "../_shared/runtime_run_store.ts";
import {
  executePlatformFallbackLane,
  executePublicLane,
  type InferenceMessage,
} from "../_shared/runtime_inference_lanes.ts";
import { DEFAULT_GUEST_MODEL_ID, isFreeModelId } from "../../../shared/modelCatalog.ts";

type RuntimeTurnInput = {
  action?: "turn" | "tool_decision";
  thread_id?: string;
  run_id?: string;
  tool_call_id?: string;
  approved?: boolean;
  note?: string | null;
  model_id?: string | null;
  surface?: "web" | "desktop" | "mobile";
  requires_tools?: boolean;
  approval_mode?: CloudApprovalMode;
  stream?: boolean;
  idempotency_key?: string | null;
  prefer_chatgpt_lane?: boolean;
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  max_tokens?: number | null;
};

const CANONICAL_CLOUD_RUN_CONTRACT_NAME = "canonical_cloud_run_v1";
const CANONICAL_CLOUD_RUN_CONTRACT_VERSION = "v1";

type RuntimeExecutionMode = "chat" | "agentic";

type ThreadOwnershipRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  community_id: string | null;
};

type LaneExecutionResult = {
  assistantText: string;
  engineId: string;
  modelId: string;
  lane: RuntimeLane;
  sandboxId: string | null;
};

type ApiError = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const TOOL_DECISION_NOTE_MAX_CHARS = 4_000;

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

function sanitizeToolCallId(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw createApiError("invalid_request", "tool_call_id is required.", 400);
  }
  if (trimmed.length > 256) {
    throw createApiError("invalid_request", "tool_call_id is too long.", 400);
  }
  return trimmed;
}

function normalizeDecisionNote(value: unknown): string | null {
  const note = String(value ?? "").trim();
  if (!note) return null;
  if (note.length > TOOL_DECISION_NOTE_MAX_CHARS) {
    throw createApiError(
      "invalid_request",
      `note must be <= ${TOOL_DECISION_NOTE_MAX_CHARS} characters.`,
      400,
    );
  }
  return note;
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
        "PolyNet platform inference is not included in your plan.",
        403,
      );
    }
    return "daytona";
  }
  if (params.isFreeModel) return "public";
  if (params.platformDisabled) {
    throw createApiError(
      "platform_inference_disabled",
      "PolyNet platform inference is disabled.",
      403,
    );
  }
  if (params.platformEntitled) return "platform_fallback";
  throw createApiError(
    "platform_inference_not_allowed",
    "PolyNet platform inference is not included in your plan.",
    403,
  );
}

async function loadThreadOwnership(threadId: string): Promise<ThreadOwnershipRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&select=id,owner_id,project_id,community_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw createApiError("thread_lookup_failed", await res.text(), 500);
  const rows = (await res.json()) as Array<Partial<ThreadOwnershipRow>>;
  const row = rows[0];
  if (!row?.id || !row?.owner_id) return null;
  return {
    id: row.id,
    owner_id: row.owner_id,
    project_id: typeof row.project_id === "string" ? row.project_id : null,
    community_id: typeof row.community_id === "string" ? row.community_id : null,
  };
}

function normalizeProjectId(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function resolveExecutionMode(requiresTools: boolean): RuntimeExecutionMode {
  return requiresTools ? "agentic" : "chat";
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

const runtimeRunStore = createRuntimeRunStore((code, message, status) =>
  createApiError(code, message, status)
);

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
    const userAccessToken = extractBearerToken(req);
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
    const action = String(input.action ?? "turn").trim().toLowerCase();
    if (action === "tool_decision") {
      const runId = sanitizeUuid(input.run_id, "run_id");
      const toolCallId = sanitizeToolCallId(input.tool_call_id);
      if (typeof input.approved !== "boolean") {
        throw createApiError("invalid_request", "approved must be true or false.", 400);
      }
      const approved = input.approved === true;
      const note = normalizeDecisionNote(input.note);
      const run = await runtimeRunStore.loadRuntimeRunByIdForUser(runId, userId);
      if (!run) {
        return jsonResponse({ ok: false, error: "run_not_found" }, { status: 404, headers });
      }
      if (run.lane !== "daytona") {
        return jsonResponse(
          {
            ok: false,
            error: "invalid_run_lane",
            code: "invalid_run_lane",
            message: "Tool decisions are only supported for Daytona runs.",
          },
          { status: 409, headers },
        );
      }
      if (
        run.status !== "awaiting_approval" &&
        run.status !== "running" &&
        run.status !== "resuming"
      ) {
        return jsonResponse(
          {
            ok: false,
            error: "invalid_run_state",
            code: "invalid_run_state",
            message: `Run is in terminal state '${run.status}'.`,
          },
          { status: 409, headers },
        );
      }
      await runtimeRunStore.upsertRuntimeToolDecision({
        runId,
        userId,
        toolCallId,
        approved,
        note,
      });
      if (run.status === "awaiting_approval") {
        await runtimeRunStore.patchRuntimeRun(runId, {
          status: "resuming",
          error_code: null,
          error_message: null,
        });
      }
      return jsonResponse(
        {
          ok: true,
          action: "tool_decision",
          run_id: runId,
          tool_call_id: toolCallId,
          approved,
        },
        { status: 200, headers },
      );
    }
    if (action !== "turn") {
      throw createApiError("invalid_request", "action must be 'turn' or 'tool_decision'.", 400);
    }
    const threadId = sanitizeUuid(input.thread_id, "thread_id");
    const modelId = normalizeModelId(input.model_id);
    const requiresTools = input.requires_tools === true;
    const wantsStream = input.stream !== false;
    const surface = String(input.surface ?? "web").trim().toLowerCase() || "web";
    const preferChatgptLane = input.prefer_chatgpt_lane === true;
    const approvalMode = normalizeCloudApprovalMode(input.approval_mode);
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

    const existingRun = await runtimeRunStore.findExistingRun(userId, threadId, idempotencyKey);
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

    const patchDaytonaSandboxStatus = async (status: DaytonaLocalSandboxStatus): Promise<void> => {
      if (lane !== "daytona") return;
      if (!resolvedSandbox) return;
      if (!threadProjectId) return;
      try {
        await setDaytonaSandboxStatus({
          sandboxId: resolvedSandbox.id,
          userId,
          projectId: threadProjectId,
          providerSandboxId: resolvedSandbox.provider_sandbox_id,
          status,
          region: resolvedSandbox.region ?? null,
        });
      } catch {
        // Best effort only; run execution must continue even if status patching fails.
      }
    };

    const run = await runtimeRunStore.createRuntimeRun({
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
      await runtimeRunStore.appendRuntimeRunEvent(run.id, eventSeq, eventType, payload);
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
      approval_mode: approvalMode,
      sandbox_id: sandboxId,
      surface,
    });

    let streamEmitter: ((event: string, data: Record<string, unknown>) => void) | null = null;
    const daytonaInferenceMaxTokens = typeof input.max_tokens === "number" ? input.max_tokens : null;
    const callDaytonaInference = async (transcript: InferenceMessage[], activeModelId: string) => {
      if (isFreeModelId(activeModelId)) {
        const publicLaneResult = await executePublicLane({
          modelId: activeModelId,
          messages: transcript,
          createApiError,
        });
        return {
          assistantText: publicLaneResult.assistantText,
          engineId: publicLaneResult.engineId,
          modelId: publicLaneResult.modelId,
        };
      }
      const fallbackLaneResult = await executePlatformFallbackLane({
        request: req,
        modelId: activeModelId,
        messages: transcript,
        maxTokens: daytonaInferenceMaxTokens,
        createApiError,
      });
      return {
        assistantText: fallbackLaneResult.assistantText,
        engineId: fallbackLaneResult.engineId,
        modelId: fallbackLaneResult.modelId,
      };
    };
    const executeLane = async (): Promise<LaneExecutionResult> => {
      if (lane === "public") {
        return executePublicLane({ modelId, messages: inferenceMessages, createApiError });
      }
      if (lane === "platform_fallback") {
        return executePlatformFallbackLane({
          request: req,
          modelId,
          messages: inferenceMessages,
          maxTokens: daytonaInferenceMaxTokens,
          createApiError,
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
        runId: run.id,
        modelId,
        messages: inferenceMessages,
        projectId: threadProjectId,
        userId,
        userAccessToken,
        communityId: thread.community_id,
        approvalMode,
        sandbox: resolvedSandbox,
        contractName: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
        contractVersion: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
        appendRunEvent: appendEvent,
        emitStreamEvent: streamEmitter ?? undefined,
        patchSandboxStatus: patchDaytonaSandboxStatus,
        callInference: callDaytonaInference,
        patchRuntimeRun: runtimeRunStore.patchRuntimeRun,
        waitForRuntimeToolDecision: runtimeRunStore.waitForRuntimeToolDecision,
        createApiError,
      });
    };

    if (!wantsStream) {
      try {
        const result = await executeLane();
        await appendEvent("run_finished", {
          contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
          contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
          execution_mode: executionMode,
          lane: result.lane,
          project_id: threadProjectId,
          approval_mode: approvalMode,
          status: "ok",
          reason: null,
          model_id: result.modelId,
          engine_id: result.engineId,
          content_chars: result.assistantText.length,
        });
        await runtimeRunStore.patchRuntimeRun(run.id, {
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
        await appendEvent("run_finished", {
          contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
          contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
          execution_mode: executionMode,
          lane,
          project_id: threadProjectId,
          approval_mode: approvalMode,
          status: "error",
          reason: apiError.code,
          code: apiError.code,
          message: apiError.message,
          ...(apiError.details ? { details: apiError.details } : null),
        });
        await runtimeRunStore.patchRuntimeRun(run.id, {
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
          streamEmitter = (event, data) => emit(event, data);
          emit("start", {
            run_id: run.id,
            contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
            contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
            execution_mode: executionMode,
            lane,
            project_id: threadProjectId,
            approval_mode: approvalMode,
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
          await appendEvent("run_finished", {
            contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
            contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
            execution_mode: executionMode,
            lane: result.lane,
            project_id: threadProjectId,
            approval_mode: approvalMode,
            status: "ok",
            reason: null,
            model_id: result.modelId,
            engine_id: result.engineId,
            content_chars: result.assistantText.length,
          });
          await runtimeRunStore.patchRuntimeRun(run.id, {
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
            approval_mode: approvalMode,
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
            approval_mode: approvalMode,
            code: apiError.code,
            message: apiError.message,
            retryable: apiError.status >= 500,
          });
          try {
              await appendEvent("run_finished", {
                contract_name: CANONICAL_CLOUD_RUN_CONTRACT_NAME,
                contract_version: CANONICAL_CLOUD_RUN_CONTRACT_VERSION,
                execution_mode: executionMode,
                lane,
                project_id: threadProjectId,
                approval_mode: approvalMode,
                status: "error",
                reason: apiError.code,
                code: apiError.code,
                message: apiError.message,
                ...(apiError.details ? { details: apiError.details } : null),
            });
            await runtimeRunStore.patchRuntimeRun(run.id, {
              status: "failed",
              error_code: apiError.code,
              error_message: apiError.message,
              finished_at: new Date().toISOString(),
            });
          } catch {
            // Ignore secondary write failures while closing stream.
          }
        } finally {
          streamEmitter = null;
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
