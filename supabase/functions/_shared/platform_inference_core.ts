import { supabaseAdminFetch } from "./supabase_admin.ts";
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

export async function loadModelRegistryRow(modelId: string): Promise<ModelRegistryRow | null> {
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

export async function resolvePlatformModelForAliasOrRegistry(aliasModelId: string): Promise<PlatformModelRef> {
  const cleanedAlias = (aliasModelId ?? "").trim();
  if (!cleanedAlias) throw new Error("model_id is required");

  if (cleanedAlias.includes("/")) {
    throw new Error("platform model refs must be configured in model_registry");
  }

  const row = await loadModelRegistryRow(cleanedAlias);
  if (!row) throw new Error(`platform model not configured for '${cleanedAlias}'`);
  if (!row.enabled || !row.platform_enabled) {
    throw new Error("platform_inference_not_allowed");
  }
  const provider = normalizePlatformProvider(row.provider);
  const providerModel = String(row.provider_model ?? "").trim();
  if (!providerModel) throw new Error(`platform model not configured for '${cleanedAlias}'`);
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

export function platformOpenAiCompatibleBaseUrl(provider: PlatformProvider): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "google") return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (provider === "x-ai") return "https://api.x.ai/v1";
  return null;
}

export function platformProviderEnvKey(provider: PlatformProvider): string {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "google") return "GOOGLE_API_KEY";
  return "XAI_API_KEY";
}
