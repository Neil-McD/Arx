import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { requireVerifiedUserId } from "../_shared/auth.ts";
import { getEnv, isTruthyEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { type PlatformModelRef } from "../_shared/platform_model_routing.ts";
import {
  clampMaxTokens,
  consumePlatformInferenceStandard,
  edgeRateLimitAllowKey,
  platformOpenAiCompatibleBaseUrl,
  platformProviderEnvKey,
  resolvePlatformModelForAliasOrRegistry,
} from "../_shared/platform_inference_core.ts";

type PlatformAgentInferInput = {
  model_id: string;
  request: Record<string, unknown>;
};

async function readJsonBounded<T>(req: Request, maxChars = 512_000): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
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

Deno.serve(async (req: Request) => {
  const cors = withStrictCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  }
  if (!cors.allowed) {
    return jsonResponse({ ok: false, error: "cors_origin_not_allowed" }, { status: 403, headers: cors.headers });
  }
  const headers = cors.headers;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const requestStartedAt = performance.now();
    const inputStartedAt = performance.now();
    const inputPromise = readJsonBounded<PlatformAgentInferInput>(req).then((value) => ({
      value,
      ms: Math.round(performance.now() - inputStartedAt),
    }));

    const authStartedAt = performance.now();
    const userId = await requireVerifiedUserId(req);
    const authMs = Math.round(performance.now() - authStartedAt);

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

    const builderTierStartedAt = performance.now();
    const builderTierPromise = loadUserBuilderTier(userId).then((value) => ({
      value,
      ms: Math.round(performance.now() - builderTierStartedAt),
    }));
    const [{ value: builderTier, ms: builderTierMs }, { value: input, ms: inputMs }] = await Promise.all([
      builderTierPromise,
      inputPromise,
    ]);
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
    const aliasModelId = String(input?.model_id ?? "").trim();
    if (!aliasModelId) throw new Error("model_id_required");

    const requestObj = input?.request;
    if (!requestObj || typeof requestObj !== "object" || Array.isArray(requestObj)) {
      throw new Error("invalid_request");
    }

    const userRlStartedAt = performance.now();
    const userRlPromise = edgeRateLimitAllowKey({
      key: `platform_agent_infer:user:${userId}`,
      windowSeconds: 60,
      limit: 60,
    }).then((value) => ({ value, ms: Math.round(performance.now() - userRlStartedAt) }));

    const ipRlStartedAt = performance.now();
    const ipRlPromise = edgeRateLimitAllow({
      req,
      key: "platform_agent_infer",
      windowSeconds: 60,
      limit: 240,
    }).then((value) => ({ value, ms: Math.round(performance.now() - ipRlStartedAt) }));

    const modelResolveStartedAt = performance.now();
    const modelResolutionPromise = resolvePlatformModelForAliasOrRegistry(aliasModelId)
      .then((value) => ({
        ok: true as const,
        value,
        ms: Math.round(performance.now() - modelResolveStartedAt),
      }))
      .catch((error) => ({
        ok: false as const,
        error,
        ms: Math.round(performance.now() - modelResolveStartedAt),
      }));

    const [
      { value: userRlAllowed, ms: userRlMs },
      { value: ipRlAllowed, ms: ipRlMs },
      modelResolution,
    ] = await Promise.all([userRlPromise, ipRlPromise, modelResolutionPromise]);

    if (!userRlAllowed) throw new Error("rate_limited");
    if (!ipRlAllowed) throw new Error("rate_limited");

    const modelResolveMs = modelResolution.ms;
    if (!modelResolution.ok) {
      const message = modelResolution.error instanceof Error
        ? modelResolution.error.message
        : String(modelResolution.error);
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
    const platformModel: PlatformModelRef = modelResolution.value;

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
    let quotaMs: number | null = null;
    try {
      const quotaStartedAt = performance.now();
      platformRemaining = await consumePlatformInferenceStandard(userId, 1);
      quotaMs = Math.round(performance.now() - quotaStartedAt);
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
      ? Math.max(64, Math.min(4096, Math.floor(Number(platformMaxTokensRaw))))
      : 2048;

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

    const preflightMs = Math.round(performance.now() - requestStartedAt);
    const preflightHeaders = {
      "x-arx-platform-preflight-ms": String(preflightMs),
      "x-arx-platform-auth-ms": String(authMs),
      "x-arx-platform-json-ms": String(inputMs),
      "x-arx-platform-tier-ms": String(builderTierMs),
      "x-arx-platform-user-rl-ms": String(userRlMs),
      "x-arx-platform-ip-rl-ms": String(ipRlMs),
      "x-arx-platform-model-ms": String(modelResolveMs),
      ...(quotaMs !== null ? { "x-arx-platform-quota-ms": String(quotaMs) } : null),
    };

    const acceptHeaders = {
      ...headers,
      ...preflightHeaders,
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
          { status: upstream.status, headers: { ...headers, ...preflightHeaders } },
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
      return jsonResponse(
        { ok: false, error: `Anthropic error ${upstream.status}: ${body}` },
        { status: upstream.status, headers: { ...headers, ...preflightHeaders } },
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes("invalid bearer token") || lower.includes("missing bearer token")) {
      return jsonResponse(
        { ok: false, error: "invalid_jwt", code: "invalid_jwt", message },
        { status: 401, headers },
      );
    }
    if (message.toLowerCase().includes("rate_limited")) {
      return jsonResponse(
        { ok: false, error: "rate_limited", code: "rate_limited", message: "Too many requests. Try again soon." },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
