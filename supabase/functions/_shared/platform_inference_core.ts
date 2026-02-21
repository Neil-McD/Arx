import { supabaseAdminFetch } from "./supabase_admin.ts";
import { getEnv, isTruthyEnv } from "./env.ts";
import {
  normalizePlatformProvider,
  type PlatformModelRef,
  type PlatformProvider,
} from "./platform_model_routing.ts";

export type ModelRegistryRow = {
  id: string;
  provider: string;
  provider_model: string | null;
  enabled: boolean;
  platform_enabled: boolean;
  display_name: string | null;
  sort_order: number | null;
};

export type PlatformBuilderTier = "free" | "builder" | "pro";

export type PlatformInferenceEntitlementDecision = {
  allowed: boolean;
  tier: PlatformBuilderTier;
  platform_enabled: boolean;
  reason: "platform_inference_disabled" | "platform_inference_not_allowed" | null;
};

export type PlatformInferenceTargetErrorCode = "platform_inference_not_allowed" | "platform_inference_misconfigured";

export type PlatformInferenceTargetResolution =
  | {
      ok: true;
      model_id: string;
      platform_model: PlatformModelRef;
      provider_env_key: string;
      provider_key: string;
      openai_compatible_base_url: string | null;
    }
  | {
      ok: false;
      model_id: string;
      code: PlatformInferenceTargetErrorCode;
      status: 403 | 503;
      message: string;
      provider: PlatformProvider | null;
      details?: Record<string, unknown>;
    };

function normalizeBuilderTierForPlatformInference(rawTier: unknown): PlatformBuilderTier {
  const raw = String(rawTier ?? "free").trim().toLowerCase();
  if (raw === "builder") return "builder";
  if (raw === "pro" || raw === "architect") return "pro";
  return "free";
}

export async function loadUserBuilderTierForPlatformInference(userId: string): Promise<PlatformBuilderTier> {
  const res = await supabaseAdminFetch(
    `/rest/v1/profiles?select=builder_tier&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return "free";
  const rows = (await res.json()) as Array<{ builder_tier?: unknown }>;
  return normalizeBuilderTierForPlatformInference(rows[0]?.builder_tier);
}

function isPlatformInferenceEnabledByEnv(): boolean {
  const platformEnabledRaw = getEnv("ARX_PLATFORM_INFERENCE_ENABLED") || getEnv("OPENROUTER_PLATFORM_ENABLED");
  // Kill switch only: if unset, treat platform inference as enabled for paid tiers.
  return platformEnabledRaw ? isTruthyEnv(platformEnabledRaw) : true;
}

export function evaluatePlatformInferenceEntitlement(
  tier: PlatformBuilderTier,
): PlatformInferenceEntitlementDecision {
  const platformEnabled = isPlatformInferenceEnabledByEnv();
  if (!platformEnabled) {
    return {
      allowed: false,
      tier,
      platform_enabled: false,
      reason: "platform_inference_disabled",
    };
  }
  if (tier === "free") {
    return {
      allowed: false,
      tier,
      platform_enabled: true,
      reason: "platform_inference_not_allowed",
    };
  }
  return {
    allowed: true,
    tier,
    platform_enabled: true,
    reason: null,
  };
}

function fallbackPlatformModelForAlias(aliasModelId: string): PlatformModelRef | null {
  const alias = (aliasModelId ?? "").trim().toLowerCase();
  let model = "";
  if (alias === "kimi-k2") model = "moonshotai/kimi-k2";
  else if (alias === "glm-4.7") model = "z-ai/glm-4.7";
  else if (alias === "deepseek-v3.2") model = "deepseek/deepseek-v3.2";
  else return null;
  return { provider: "openrouter", model, ref: `openrouter/${model}` };
}

async function loadModelRegistryRow(modelId: string): Promise<ModelRegistryRow | null> {
  const id = (modelId ?? "").trim();
  if (!id) return null;
  const res = await supabaseAdminFetch(
    `/rest/v1/model_registry?select=id,provider,provider_model,enabled,platform_enabled,display_name,sort_order&id=eq.${encodeURIComponent(
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
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : null,
  };
}

async function resolvePlatformModelForAliasOrRegistry(aliasModelId: string): Promise<PlatformModelRef> {
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (!cleanedAlias) throw new Error("model_id is required");

  if (cleanedAlias.includes("/")) {
    throw new Error("platform model refs must be configured in model_registry");
  }

  const row = await loadModelRegistryRow(cleanedAlias);
  const fallback = fallbackPlatformModelForAlias(cleanedAlias);
  if (!row) {
    if (fallback) return fallback;
    throw new Error(`platform model not configured for '${cleanedAlias}'`);
  }
  if (!row.enabled || !row.platform_enabled) {
    throw new Error("platform_inference_not_allowed");
  }
  const provider = normalizePlatformProvider(row.provider);
  const providerModel = String(row.provider_model ?? "").trim();
  if (!providerModel) {
    if (fallback) return fallback;
    throw new Error(`platform model not configured for '${cleanedAlias}'`);
  }
  return { provider, model: providerModel, ref: `${provider}/${providerModel}` };
}

export async function edgeRateLimitAllowKey(params: {
  key: string;
  windowSeconds: number;
  limit: number;
}): Promise<boolean> {
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

export async function consumePlatformInferenceStandard(userId: string, units = 1): Promise<number> {
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

export function clampMaxTokens(input: unknown, cap: number): number {
  const raw = Number(input);
  const requested = Number.isFinite(raw) ? Math.floor(raw) : cap;
  return Math.max(64, Math.min(cap, requested));
}

function platformOpenAiCompatibleBaseUrl(provider: PlatformProvider): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "google") return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (provider === "x-ai") return "https://api.x.ai/v1";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  return null;
}

function platformProviderEnvKey(provider: PlatformProvider): string {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "google") return "GOOGLE_API_KEY";
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  return "XAI_API_KEY";
}

function isPlatformModelRoutingMisconfiguredMessage(message: string): boolean {
  const raw = String(message ?? "").trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes("platform_model_map_json") ||
    raw.includes("platform model not configured for") ||
    raw.includes("platform model not configured") ||
    raw.includes("invalid platform model mapping") ||
    raw.includes("unsupported platform model provider")
  );
}

function providerDisplayName(provider: PlatformProvider): string {
  if (provider === "x-ai") return "xAI";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Google";
}

export async function resolvePlatformInferenceTarget(modelId: string): Promise<PlatformInferenceTargetResolution> {
  const aliasModelId = String(modelId ?? "").trim();
  if (!aliasModelId) {
    return {
      ok: false,
      model_id: aliasModelId,
      code: "platform_inference_misconfigured",
      status: 503,
      message: "Arx AI isn't configured yet for this model.",
      provider: null,
      details: { misconfig: "model_routing" },
    };
  }

  let platformModel: PlatformModelRef;
  try {
    platformModel = await resolvePlatformModelForAliasOrRegistry(aliasModelId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("platform_inference_not_allowed")) {
      return {
        ok: false,
        model_id: aliasModelId,
        code: "platform_inference_not_allowed",
        status: 403,
        message: "Arx platform inference isn't available for this model.",
        provider: null,
      };
    }
    if (isPlatformModelRoutingMisconfiguredMessage(message)) {
      return {
        ok: false,
        model_id: aliasModelId,
        code: "platform_inference_misconfigured",
        status: 503,
        message: "Arx AI isn't configured yet for this model.",
        provider: null,
        details: {
          misconfig: "model_routing",
        },
      };
    }
    return {
      ok: false,
      model_id: aliasModelId,
      code: "platform_inference_misconfigured",
      status: 503,
      message: "Arx AI isn't configured yet for this model.",
      provider: null,
      details: {
        misconfig: "model_routing",
        upstream_message: message,
      },
    };
  }

  const providerEnvKey = platformProviderEnvKey(platformModel.provider);
  const platformProviderKey = getEnv(providerEnvKey);
  if (!platformProviderKey) {
    return {
      ok: false,
      model_id: aliasModelId,
      code: "platform_inference_misconfigured",
      status: 503,
      message: `Arx AI isn't configured yet for ${providerDisplayName(platformModel.provider)}.`,
      provider: platformModel.provider,
      details: {
        misconfig: "missing_secret",
        missing_secret: providerEnvKey,
      },
    };
  }

  const openAiBaseUrl = platformOpenAiCompatibleBaseUrl(platformModel.provider);
  if (
    (platformModel.provider === "openai" ||
      platformModel.provider === "x-ai" ||
      platformModel.provider === "openrouter") &&
    !openAiBaseUrl
  ) {
    return {
      ok: false,
      model_id: aliasModelId,
      code: "platform_inference_misconfigured",
      status: 503,
      message: "Arx AI isn't configured yet for this model.",
      provider: platformModel.provider,
      details: {
        misconfig: "model_routing",
      },
    };
  }

  return {
    ok: true,
    model_id: aliasModelId,
    platform_model: platformModel,
    provider_env_key: providerEnvKey,
    provider_key: platformProviderKey,
    openai_compatible_base_url: openAiBaseUrl,
  };
}
