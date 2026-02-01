import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { getEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type PlatformProvider = "openai" | "anthropic" | "google" | "x-ai";
type PlatformModelRef = { provider: PlatformProvider; model: string; ref: string };

type ModelRegistryRow = {
  id: string;
  provider: string;
  provider_model: string | null;
  enabled: boolean;
  platform_enabled: boolean;
  byok_enabled: boolean;
  display_name: string | null;
  sort_order: number | null;
};

type PlatformAgentInferInput = {
  model_id: string;
  request: Record<string, unknown>;
};

function isTruthyEnv(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getBearerToken(req: Request): string {
  const header = (req.headers.get("Authorization") ?? "").trim();
  const [kind, token] = header.split(/\s+/);
  if (!kind || kind.toLowerCase() !== "bearer" || !token) throw new Error("Missing bearer token");
  return token;
}

function getVerifiedJwtSub(token: string): string {
  // `verify_jwt=true` means only verified JWTs reach this function.
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  const payloadJson = new TextDecoder().decode(base64UrlToBytes(parts[1]));
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;
  const sub = String(payload.sub ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(sub)) throw new Error("Invalid JWT subject");
  return sub;
}

function normalizePlatformProvider(input: string): PlatformProvider {
  const raw = (input ?? "").trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "anthropic") return "anthropic";
  if (raw === "google") return "google";
  if (raw === "xai" || raw === "x-ai") return "x-ai";
  throw new Error("Unsupported platform model provider");
}

function parsePlatformModelRef(ref: string): PlatformModelRef {
  const raw = (ref ?? "").trim();
  const idx = raw.indexOf("/");
  if (idx <= 0) throw new Error("Invalid platform model mapping");
  const provider = normalizePlatformProvider(raw.slice(0, idx));
  const model = raw.slice(idx + 1).trim();
  if (!model) throw new Error("Invalid platform model mapping");
  return { provider, model, ref: `${provider}/${model}` };
}

async function loadModelRegistryRow(modelId: string): Promise<ModelRegistryRow | null> {
  const id = (modelId ?? "").trim();
  if (!id) return null;
  const res = await supabaseAdminFetch(
    `/rest/v1/model_registry?select=id,provider,provider_model,enabled,platform_enabled,byok_enabled,display_name,sort_order&id=eq.${encodeURIComponent(
      id,
    )}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<Partial<ModelRegistryRow>>;
  const row = rows[0];
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    provider: String(row.provider ?? "").trim(),
    provider_model: typeof row.provider_model === "string" ? row.provider_model : null,
    enabled: row.enabled !== false,
    platform_enabled: row.platform_enabled !== false,
    byok_enabled: row.byok_enabled !== false,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : null,
  };
}

let cachedPlatformModelMap: { raw: string; parsed: Record<string, string> } | null = null;

function loadPlatformModelMap(): Record<string, string> {
  const raw = getEnv("PLATFORM_MODEL_MAP_JSON");
  if (!raw) return {};
  if (cachedPlatformModelMap?.raw === raw) return cachedPlatformModelMap.parsed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid PLATFORM_MODEL_MAP_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid PLATFORM_MODEL_MAP_JSON");
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const id = String(key ?? "").trim();
    const ref = value.trim();
    if (!id || !ref) continue;
    out[id] = ref;
  }
  cachedPlatformModelMap = { raw, parsed: out };
  return out;
}

function resolvePlatformModelForAlias(aliasModelId: string): PlatformModelRef {
  const map = loadPlatformModelMap();
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (!cleanedAlias) throw new Error("model_id is required");
  if (Object.keys(map).length > 0) {
    const raw = map[cleanedAlias];
    if (!raw) throw new Error(`Platform model not configured for '${cleanedAlias}'`);
    return parsePlatformModelRef(raw);
  }
  throw new Error("Missing PLATFORM_MODEL_MAP_JSON");
}

async function resolvePlatformModelForAliasOrRegistry(aliasModelId: string): Promise<PlatformModelRef> {
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (!cleanedAlias) throw new Error("model_id is required");

  const row = await loadModelRegistryRow(cleanedAlias);
  if (row) {
    if (!row.enabled || !row.platform_enabled) {
      throw new Error("platform_inference_not_allowed");
    }
    const provider = normalizePlatformProvider(row.provider);
    const providerModel = String(row.provider_model ?? "").trim();
    if (providerModel) return { provider, model: providerModel, ref: `${provider}/${providerModel}` };
    // Transition fallback: allow legacy env mapping until provider_model is populated.
  }

  return resolvePlatformModelForAlias(cleanedAlias);
}

async function readJsonBounded<T>(req: Request, maxChars = 512_000): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
}

async function edgeRateLimitAllowKey(params: { key: string; windowSeconds: number; limit: number }): Promise<boolean> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/edge_rate_limit_allow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_key: params.key,
      p_window_seconds: params.windowSeconds,
      p_limit: params.limit,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as unknown;
  if (typeof data === "boolean") return data;
  return Boolean(data);
}

async function loadUserBuilderTier(userId: string): Promise<"free" | "builder" | "pro"> {
  const res = await supabaseAdminFetch(
    `/rest/v1/profiles?select=builder_tier&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return "free";
  const rows = (await res.json()) as Array<{ builder_tier?: unknown }>;
  const raw = String(rows[0]?.builder_tier ?? "free").trim().toLowerCase();
  return raw === "pro" || raw === "builder" ? raw : "free";
}

async function consumePlatformInferenceStandard(userId: string, units = 1): Promise<number> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/consume_platform_inference_standard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_units: units }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as unknown;
  const remaining = Number(data);
  if (!Number.isFinite(remaining) || remaining < 0) return 0;
  return Math.floor(remaining);
}

function clampMaxTokens(input: unknown, cap: number): number {
  const raw = Number(input);
  const requested = Number.isFinite(raw) ? Math.floor(raw) : cap;
  return Math.max(64, Math.min(cap, requested));
}

function platformOpenAiCompatibleBaseUrl(provider: PlatformProvider): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "google") return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (provider === "x-ai") return "https://api.x.ai/v1";
  return null;
}

function platformProviderEnvKey(provider: PlatformProvider): string {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "google") return "GOOGLE_API_KEY";
  return "XAI_API_KEY";
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const token = getBearerToken(req);
    const userId = getVerifiedJwtSub(token);

    const platformEnabledRaw = getEnv("ARX_PLATFORM_INFERENCE_ENABLED") || getEnv("OPENROUTER_PLATFORM_ENABLED");
    // Kill switch only: if unset, treat platform inference as enabled for paid tiers.
    const platformEnabled = platformEnabledRaw ? isTruthyEnv(platformEnabledRaw) : true;
    if (!platformEnabled) {
      return jsonResponse(
        {
          ok: false,
          error: "platform_inference_disabled",
          code: "platform_inference_disabled",
          message: "Arx platform inference is disabled.",
        },
        { status: 403, headers },
      );
    }

    const builderTier = await loadUserBuilderTier(userId);
    if (builderTier === "free") {
      return jsonResponse(
        {
          ok: false,
          error: "platform_inference_not_allowed",
          code: "platform_inference_not_allowed",
          message: "Arx platform inference is not included in your plan.",
        },
        { status: 403, headers },
      );
    }

    const input = await readJsonBounded<PlatformAgentInferInput>(req);
    const aliasModelId = String(input?.model_id ?? "").trim();
    if (!aliasModelId) throw new Error("model_id_required");

    const requestObj = input?.request;
    if (!requestObj || typeof requestObj !== "object" || Array.isArray(requestObj)) {
      throw new Error("invalid_request");
    }

    const userRlAllowed = await edgeRateLimitAllowKey({
      key: `platform_agent_infer:user:${userId}`,
      windowSeconds: 60,
      limit: 60,
    });
    if (!userRlAllowed) throw new Error("rate_limited");

    const ipRlAllowed = await edgeRateLimitAllow({
      req,
      key: "platform_agent_infer",
      windowSeconds: 60,
      limit: 240,
    });
    if (!ipRlAllowed) throw new Error("rate_limited");

    let platformModel: PlatformModelRef;
    try {
      platformModel = await resolvePlatformModelForAliasOrRegistry(aliasModelId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("platform_inference_not_allowed")) {
        return jsonResponse(
          {
            ok: false,
            error: "platform_inference_not_allowed",
            code: "platform_inference_not_allowed",
            model_id: aliasModelId,
          },
          { status: 403, headers },
        );
      }
      return jsonResponse(
        {
          ok: false,
          error: "platform_inference_misconfigured",
          code: "platform_inference_misconfigured",
          model_id: aliasModelId,
          message,
        },
        { status: 503, headers },
      );
    }

    const providerEnvKey = platformProviderEnvKey(platformModel.provider);
    const platformProviderKey = getEnv(providerEnvKey);
    if (!platformProviderKey) {
      return jsonResponse(
        {
          ok: false,
          error: "platform_inference_misconfigured",
          code: "platform_inference_misconfigured",
          provider: platformModel.provider,
          model_id: aliasModelId,
          message: `Missing env var: ${providerEnvKey}`,
        },
        { status: 503, headers },
      );
    }

    // Charge quota per model call (1 unit). The desktop agent loop may call repeatedly.
    let platformRemaining: number | null = null;
    try {
      platformRemaining = await consumePlatformInferenceStandard(userId, 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Must be stable for desktop to detect platform quota exhaustion.
      if (message.toLowerCase().includes("platform_inference_quota_exceeded")) {
        return jsonResponse(
          {
            ok: false,
            error: "platform_inference_quota_exceeded",
            code: "platform_inference_quota_exceeded",
            provider: platformModel.provider,
            model_id: aliasModelId,
            message: "You've used your Arx AI quota for this month.",
          },
          { status: 403, headers },
        );
      }
      if (message.toLowerCase().includes("platform_inference_not_allowed")) {
        return jsonResponse(
          {
            ok: false,
            error: "platform_inference_not_allowed",
            code: "platform_inference_not_allowed",
            provider: platformModel.provider,
            model_id: aliasModelId,
          },
          { status: 403, headers },
        );
      }
      throw error;
    }

    const platformMaxTokensRaw =
      getEnv("ARX_PLATFORM_INFERENCE_MAX_TOKENS") || getEnv("OPENROUTER_PLATFORM_MAX_TOKENS");
    const platformMaxTokens = Number.isFinite(Number(platformMaxTokensRaw))
      ? Math.max(64, Math.min(1024, Math.floor(Number(platformMaxTokensRaw))))
      : 512;

    // Copy request so we can override model + clamp tokens without mutating caller-owned objects.
    const request: Record<string, unknown> = { ...(requestObj as Record<string, unknown>) };
    request.model = platformModel.model;
    request.stream = true;
    const requestedMax =
      request.max_completion_tokens ?? request.max_tokens ?? (request as Record<string, unknown>).max_output_tokens;
    const clamped = clampMaxTokens(requestedMax, platformMaxTokens);
    if (platformModel.provider === "openai") {
      delete request.max_tokens;
      delete request.max_output_tokens;
      request.max_completion_tokens = clamped;
    } else {
      delete request.max_completion_tokens;
      delete request.max_output_tokens;
      request.max_tokens = clamped;
    }

    const acceptHeaders = {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    };

    if (platformModel.provider !== "anthropic") {
      const base = platformOpenAiCompatibleBaseUrl(platformModel.provider);
      if (!base) throw new Error("unsupported_provider");
      const url = `${base.replace(/\/+$/, "")}/chat/completions`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${platformProviderKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(request),
      });
      if (!upstream.ok) {
        const body = await upstream.text();
        return jsonResponse(
          { ok: false, error: `Platform model error ${upstream.status}: ${body}` },
          { status: upstream.status, headers },
        );
      }
      if (!upstream.body) throw new Error("Missing model stream");
      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...acceptHeaders,
          "Content-Type": upstream.headers.get("content-type") ?? acceptHeaders["Content-Type"],
          ...(platformRemaining !== null ? { "x-arx-platform-standard-remaining": String(platformRemaining) } : null),
        },
      });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "x-api-key": platformProviderKey,
        "anthropic-version": getEnv("ANTHROPIC_VERSION") || "2023-06-01",
      },
      body: JSON.stringify(request),
    });
    if (!upstream.ok) {
      const body = await upstream.text();
      return jsonResponse({ ok: false, error: `Anthropic error ${upstream.status}: ${body}` }, { status: upstream.status, headers });
    }
    if (!upstream.body) throw new Error("Missing model stream");
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...acceptHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? acceptHeaders["Content-Type"],
        ...(platformRemaining !== null ? { "x-arx-platform-standard-remaining": String(platformRemaining) } : null),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("rate_limited")) {
      return jsonResponse(
        { ok: false, error: "rate_limited", code: "rate_limited", message: "Too many requests. Try again soon." },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
