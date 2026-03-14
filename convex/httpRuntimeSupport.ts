import { api, internal } from "./_generated/api";

type InferenceRole = "user" | "assistant" | "system";
type RuntimeSurface = "web" | "mobile";
type GateModelClass = "free_model" | "paid_model";
type RequestedExecutionTarget = "chat" | "daytona_workspace";
type GateCode =
  | "ok"
  | "auth_required"
  | "tier_required"
  | "provider_connection_required"
  | "plan_required"
  | "community_entitlement_required"
  | "community_role_required"
  | "project_required"
  | "runner_unavailable";
type GateCta = "none" | "sign_in" | "upgrade" | "connect_provider" | "join" | "request_access" | "checkout";
type GateLane = "public" | "platform" | "chatgpt" | "daytona_cloud";
type RequestedFundingSource = "demo_public" | "user_key" | "user_chatgpt" | "platform";
type CapabilityFamily = "community_tools" | "web_research" | "workspace_tools";
type ResolvedGateDecision = {
  allowed: boolean;
  code: GateCode;
  cta: GateCta;
  lane: GateLane | null;
  fundingSource: RequestedFundingSource | null;
  entitledCapabilityFamilies: CapabilityFamily[];
};
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};
type RuntimeTurnInputLike = {
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
};
type OpenRouterSuccess = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
};
type OpenRouterFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

export function normalizeMessages(raw: unknown): InferenceMessage[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: InferenceMessage[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const roleRaw = String((entry as Record<string, unknown>).role ?? "")
      .trim()
      .toLowerCase();
    const role: InferenceRole | null =
      roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system" ? (roleRaw as InferenceRole) : null;
    if (!role) continue;
    const content = String((entry as Record<string, unknown>).content ?? "").trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-60);
}

export function normalizeMaxTokens(raw: unknown, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(64, Math.min(4096, Math.floor(value)));
}

export function normalizeSurface(raw: unknown, fallback: RuntimeSurface): RuntimeSurface {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "mobile") return "mobile";
  if (value === "web") return "web";
  return fallback;
}

function normalizeGateCode(raw: unknown, fallback: GateCode): GateCode {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "ok") return "ok";
  if (value === "auth_required") return "auth_required";
  if (value === "tier_required") return "tier_required";
  if (value === "provider_connection_required") return "provider_connection_required";
  if (value === "plan_required") return "plan_required";
  if (value === "community_entitlement_required") return "community_entitlement_required";
  if (value === "community_role_required") return "community_role_required";
  if (value === "project_required") return "project_required";
  if (value === "runner_unavailable") return "runner_unavailable";
  return fallback;
}

function normalizeGateCta(raw: unknown, fallback: GateCta): GateCta {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "none") return "none";
  if (value === "sign_in") return "sign_in";
  if (value === "upgrade") return "upgrade";
  if (value === "connect_provider") return "connect_provider";
  if (value === "join") return "join";
  if (value === "request_access") return "request_access";
  if (value === "checkout") return "checkout";
  return fallback;
}

function normalizeGateLane(raw: unknown): GateLane | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "public") return "public";
  if (value === "platform") return "platform";
  if (value === "chatgpt") return "chatgpt";
  if (value === "daytona_cloud") return "daytona_cloud";
  return null;
}

function normalizeGateFundingSource(raw: unknown): RequestedFundingSource | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "demo_public") return "demo_public";
  if (value === "user_key") return "user_key";
  if (value === "user_chatgpt" || value === "chatgpt") return "user_chatgpt";
  if (value === "platform") return "platform";
  return null;
}

export function parseRequestedFundingSource(
  raw: unknown,
  fallback: RequestedFundingSource,
): RequestedFundingSource {
  const normalized = normalizeGateFundingSource(raw);
  return normalized ?? fallback;
}

export async function hasOpenRouterConnectionForUser(params: {
  ctx: any;
  userId: any;
}): Promise<boolean> {
  const row = await params.ctx.runQuery(internal.providerConnections.getOpenRouterConnectionForUserInternal as any, {
    userId: params.userId,
  });
  return Boolean(row);
}

export async function hasChatgptConnectionForUser(params: {
  ctx: any;
  userId: any;
}): Promise<boolean> {
  const row = await params.ctx.runQuery(internal.providerConnections.getChatgptConnectionForUserInternal as any, {
    userId: params.userId,
  });
  return Boolean(row);
}

export async function resolveGateDecisionForAuthenticatedActor(params: {
  ctx: any;
  authSubject: string;
  surface: RuntimeSurface;
  modelClass: GateModelClass;
  requestedExecutionTarget: RequestedExecutionTarget;
  requestedFundingSource: RequestedFundingSource;
  hasUserKeyConnection?: boolean;
  hasUserChatgptConnection?: boolean;
}): Promise<ResolvedGateDecision> {
  const raw = (await params.ctx.runQuery(api.gates.resolveGateDecision as any, {
    authState: "authenticated",
    authSubject: params.authSubject,
    surface: params.surface,
    executionMode: "cloud",
    modelClass: params.modelClass,
    requestedExecutionTarget: params.requestedExecutionTarget,
    requestedFundingSource: params.requestedFundingSource,
    hasUserKeyConnection: Boolean(params.hasUserKeyConnection),
    hasUserChatGptConnection: Boolean(params.hasUserChatgptConnection),
  })) as Record<string, unknown> | null;

  const allowed = raw?.allowed === true;
  const code = normalizeGateCode(raw?.code, allowed ? "ok" : "tier_required");
  const cta = normalizeGateCta(raw?.cta, allowed ? "none" : "upgrade");
  return {
    allowed,
    code,
    cta,
    lane: normalizeGateLane(raw?.lane),
    fundingSource: normalizeGateFundingSource(raw?.fundingSource),
    entitledCapabilityFamilies: Array.isArray(raw?.entitledCapabilityFamilies)
      ? raw.entitledCapabilityFamilies
          .map((value) => String(value ?? "").trim())
          .filter(
            (value, index, list): value is CapabilityFamily =>
              (value === "community_tools" ||
                value === "web_research" ||
                value === "workspace_tools") &&
              list.indexOf(value) === index,
          )
      : [],
  };
}

export function mapGateLaneToRuntimeLane(params: {
  requiresWorkspaceTools: boolean;
  lane: GateLane | null;
}): "public" | "platform" | "daytona" | "chatgpt" {
  if (params.lane === "public") return "public";
  if (params.lane === "platform") return "platform";
  if (params.lane === "chatgpt") return "chatgpt";
  if (params.lane === "daytona_cloud") return "daytona";
  return params.requiresWorkspaceTools ? "daytona" : "platform";
}

export function gateDeniedResponse(
  jsonResponse: (req: Request, status: number, payload: unknown) => Response,
  req: Request,
  params: {
    decision: ResolvedGateDecision;
    requiresWorkspaceTools: boolean;
    requestedModelId: string | null;
  },
): Response {
  if (params.decision.code === "auth_required") {
    return jsonResponse(req, 401, {
      ok: false,
      code: "auth_required",
      error: "auth_required",
      message: "Authentication is required.",
      gate_code: params.decision.code,
      cta: params.decision.cta,
      lane: params.decision.lane,
      model_id: params.requestedModelId,
    });
  }

  if (params.decision.code === "tier_required" || params.decision.code === "plan_required") {
    const message =
      params.requiresWorkspaceTools
        ? "Paid tier required for Daytona workspace execution."
        : "Paid tier required for platform inference.";
    return jsonResponse(req, 403, {
      ok: false,
      code: "platform_inference_not_allowed",
      error: "platform_inference_not_allowed",
      message,
      gate_code: params.decision.code,
      cta: params.decision.cta,
      lane: params.decision.lane,
      model_id: params.requestedModelId,
    });
  }

  if (params.decision.code === "provider_connection_required") {
    return jsonResponse(req, 403, {
      ok: false,
      code: "provider_connection_required",
      error: "provider_connection_required",
      message: "Connect a provider to use this model.",
      gate_code: params.decision.code,
      cta: params.decision.cta,
      lane: params.decision.lane,
      model_id: params.requestedModelId,
    });
  }

  const status = params.decision.code === "runner_unavailable" ? 503 : 403;
  const code = params.decision.code;
  return jsonResponse(req, status, {
    ok: false,
    code,
    error: code,
    message: "Request is not allowed.",
    gate_code: params.decision.code,
    cta: params.decision.cta,
    lane: params.decision.lane,
    model_id: params.requestedModelId,
  });
}

export function parseOpenRouterError(rawBody: string): { message: string; code: string } {
  const raw = (rawBody ?? "").trim();
  if (!raw) return { message: "", code: "" };
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown; code?: unknown } | string;
      message?: unknown;
      code?: unknown;
    };
    const nestedMessage =
      parsed?.error && typeof parsed.error === "object" && typeof parsed.error.message === "string"
        ? parsed.error.message.trim()
        : "";
    const nestedCode =
      parsed?.error && typeof parsed.error === "object" && (typeof parsed.error.code === "string" || typeof parsed.error.code === "number")
        ? String(parsed.error.code)
        : "";
    const topMessage = typeof parsed?.message === "string" ? parsed.message.trim() : "";
    const topCode = typeof parsed?.code === "string" || typeof parsed?.code === "number" ? String(parsed.code) : "";
    const inlineError = typeof parsed?.error === "string" ? parsed.error.trim() : "";
    return {
      message: nestedMessage || topMessage || inlineError || raw,
      code: nestedCode || topCode,
    };
  } catch {
    return { message: raw, code: "" };
  }
}

export async function runOpenRouterCompletion(params: {
  req: Request;
  modelRef: string;
  messages: InferenceMessage[];
  maxTokens: number;
  apiKeyOverride?: string | null;
}): Promise<OpenRouterSuccess | OpenRouterFailure> {
  const apiKey = String(params.apiKeyOverride ?? "").trim() || readEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "platform_inference_misconfigured",
      message: params.apiKeyOverride ? "User provider key is unavailable." : "OPENROUTER_API_KEY is not configured.",
    };
  }

  const referer = readEnv("ARX_OPENROUTER_REFERER") || "https://arx.app";
  const requestBody: Record<string, unknown> = {
    model: params.modelRef,
    messages: params.messages,
    max_tokens: params.maxTokens,
    stream: false,
  };
  if (params.modelRef.toLowerCase().includes(":free")) {
    requestBody.provider = { data_collection: "allow" };
  }

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "Arx",
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "platform_inference_unavailable",
      message: "Inference provider is temporarily unavailable.",
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    const parsed = parseOpenRouterError(raw);
    const messageLower = String(parsed.message ?? "").toLowerCase();
    const isFreeModel = params.modelRef.toLowerCase().includes(":free");
    let code = parsed.code || "platform_inference_error";
    let message = parsed.message || `OpenRouter error (${response.status})`;
    if (response.status === 429) {
      code = "rate_limited";
      message = isFreeModel
        ? "Free model is temporarily saturated. Retry in a moment."
        : "Provider is rate limiting requests. Retry in a moment.";
    } else if (
      response.status === 402 ||
      messageLower.includes("quota") ||
      messageLower.includes("credit") ||
      messageLower.includes("insufficient")
    ) {
      code = "platform_inference_quota_exceeded";
    } else if (response.status === 401 || response.status === 403) {
      code = "platform_inference_misconfigured";
    }
    return {
      ok: false,
      status: response.status,
      code,
      message,
    };
  }

  try {
    const parsed = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    const content = String(parsed?.choices?.[0]?.message?.content ?? "").trim();
    const promptTokens = Number(parsed?.usage?.prompt_tokens);
    const completionTokens = Number(parsed?.usage?.completion_tokens);
    return {
      content,
      promptTokens: Number.isFinite(promptTokens) ? Math.floor(promptTokens) : null,
      completionTokens: Number.isFinite(completionTokens) ? Math.floor(completionTokens) : null,
    };
  } catch {
    return {
      ok: false,
      status: 502,
      code: "platform_inference_error",
      message: "OpenRouter returned invalid JSON.",
    };
  }
}

export function asRuntimeMessages(input: RuntimeTurnInputLike): InferenceMessage[] {
  const fromList = normalizeMessages(input.messages);
  if (fromList.length > 0) return fromList;
  const text = String(input.message?.text ?? "").trim();
  if (!text) return [];
  return [{ role: "user", content: text }];
}

export function extractTextFromContentJson(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
    return String(text ?? "").trim();
  }
  return "";
}

export function extractInferenceSourceFromContentJson(
  value: unknown,
  fallback: "free" | "platform" | "user_key",
): "free" | "platform" | "user_key" {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const meta = record.meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const raw = String((meta as Record<string, unknown>).inference_source ?? "").trim().toLowerCase();
      if (raw === "free" || raw === "platform" || raw === "user_key") return raw;
    }
  }
  return fallback;
}
