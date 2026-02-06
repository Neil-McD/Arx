import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { getEnv } from "../_shared/env.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { requireAllowedRedirectUrl } from "../_shared/redirects.ts";

type PublicFunnelIntent = "resolve" | "capture_email" | "checkout";
type CommunityJoinMode = "join_free" | "request_access" | "checkout";

type PublicFunnelInput = {
  community_slug?: unknown;
  intent?: unknown;
  billing_period?: unknown;
  success_url?: unknown;
  cancel_url?: unknown;
  email?: unknown;
  full_name?: unknown;
  source?: unknown;
  metadata?: unknown;
  tracking?: {
    brandos_aid?: unknown;
  } | null;
};

type PublicFunnelRow = {
  community_id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  free_join_requires_approval: boolean;
  join_mode: string;
  active_plans: unknown;
  updated_at: string;
  created_at: string;
};

type PublicPlanSummary = {
  id?: string;
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: "monthly" | "yearly";
};

type PublicFunnelConfigRow = {
  community_id: string;
  slug: string;
  is_enabled: boolean;
  schema_json: unknown;
  updated_at: string;
};

type CaptureLeadRow = {
  community_id: string;
  community_slug: string;
  email: string;
  first_seen_at: string;
  last_seen_at: string;
  capture_count: number;
};

type CheckoutStartOutput = {
  ok?: boolean;
  checkout_url?: string | null;
  session_id?: string | null;
  payment_intent_id?: string | null;
  error?: string;
};

function readAuthBearer(req: Request): string | null {
  const value = (req.headers.get("Authorization") ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (!lower.startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token || null;
}

function sanitizeSlug(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) throw new Error("community_slug is required");
  if (value.length > 128) throw new Error("community_slug too long");
  return value;
}

function sanitizeIntent(raw: unknown): PublicFunnelIntent {
  const value = String(raw ?? "resolve")
    .trim()
    .toLowerCase();
  if (value === "resolve" || value === "capture_email" || value === "checkout") return value;
  throw new Error("invalid_intent");
}

function sanitizeBillingPeriod(raw: unknown): "monthly" | "yearly" {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "monthly" || value === "yearly") return value;
  throw new Error("invalid_billing_period");
}

function sanitizeOptionalUuid(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("invalid_uuid");
  return value;
}

function sanitizeEmail(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) throw new Error("email is required");
  if (!/^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i.test(value)) {
    throw new Error("invalid_email");
  }
  return value;
}

function sanitizeOptionalText(raw: unknown, max = 200): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.length <= max) return value;
  return value.slice(0, max);
}

function sanitizeSource(raw: unknown): string {
  const value = String(raw ?? "public_funnel")
    .trim()
    .toLowerCase();
  if (!value) return "public_funnel";
  if (value.length <= 64) return value;
  return value.slice(0, 64);
}

function normalizeJoinMode(raw: string, fallback: CommunityJoinMode): CommunityJoinMode {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "join_free" || value === "request_access" || value === "checkout") return value;
  return fallback;
}

function toPlan(raw: unknown): PublicPlanSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const billingPeriod = String(row.billing_period ?? "")
    .trim()
    .toLowerCase();
  if (billingPeriod !== "monthly" && billingPeriod !== "yearly") return null;
  const name = String(row.name ?? "").trim();
  const amountBaseUnits = String(row.amount_base_units ?? "").trim();
  const currency = String(row.currency ?? "").trim();
  const currencyDecimals = Number(row.currency_decimals);
  if (!name || !amountBaseUnits || !currency || !Number.isFinite(currencyDecimals)) return null;
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    name,
    description: typeof row.description === "string" ? row.description : null,
    amount_base_units: amountBaseUnits,
    currency,
    currency_decimals: currencyDecimals,
    billing_period: billingPeriod,
  };
}

function parsePlans(raw: unknown): PublicPlanSummary[] {
  if (!Array.isArray(raw)) return [];
  const plans: PublicPlanSummary[] = [];
  for (const item of raw) {
    const plan = toPlan(item);
    if (!plan) continue;
    plans.push(plan);
  }
  plans.sort((a, b) => {
    const ar = a.billing_period === "monthly" ? 0 : 1;
    const br = b.billing_period === "monthly" ? 0 : 1;
    return ar - br;
  });
  return plans;
}

async function readJsonBounded<T>(req: Request, maxChars = 128_000): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
}

async function loadPublicFunnelBySlug(slug: string): Promise<PublicFunnelRow> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/get_public_community_funnel_by_slug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_community_slug: slug }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PublicFunnelRow[];
  const row = rows[0] ?? null;
  if (!row) throw new Error("community_not_found");
  return row;
}

async function loadPublicFunnelConfigBySlug(slug: string): Promise<PublicFunnelConfigRow | null> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/get_public_community_funnel_config_by_slug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_community_slug: slug }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PublicFunnelConfigRow[];
  return rows[0] ?? null;
}

function normalizeFunnelSchema(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

async function captureLeadBySlug(input: {
  slug: string;
  email: string;
  fullName: string | null;
  source: string;
  metadata: unknown;
  brandosAid: string | null;
}): Promise<CaptureLeadRow> {
  const body = {
    p_community_slug: input.slug,
    p_email: input.email,
    p_full_name: input.fullName,
    p_source: input.source,
    p_brandos_aid: input.brandosAid,
    p_metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
  const res = await supabaseAdminFetch(`/rest/v1/rpc/capture_community_funnel_lead_by_slug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as CaptureLeadRow[];
  const row = rows[0] ?? null;
  if (!row) throw new Error("lead_capture_failed");
  return row;
}

async function startCheckoutViaCanonicalFunction(params: {
  req: Request;
  slug: string;
  billingPeriod: "monthly" | "yearly";
  successUrl: string;
  cancelUrl: string;
  brandosAid: string | null;
}): Promise<CheckoutStartOutput> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_env_missing");

  const authBearer = readAuthBearer(params.req);
  const response = await fetch(`${supabaseUrl}/functions/v1/checkout_start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: authBearer ? `Bearer ${authBearer}` : `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      community_slug: params.slug,
      billing_period: params.billingPeriod,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      tracking: params.brandosAid ? { brandos_aid: params.brandosAid } : undefined,
    }),
  });
  const payload = (await response.json().catch(() => null)) as CheckoutStartOutput | null;
  if (!response.ok) {
    const message = payload?.error ? String(payload.error) : "checkout_start_failed";
    throw new Error(message);
  }
  if (!payload?.checkout_url) throw new Error("checkout_url_missing");
  return payload;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "public_funnel", windowSeconds: 60, limit: 90 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const body = await readJsonBounded<PublicFunnelInput>(req);
    const slug = sanitizeSlug(body.community_slug);
    const intent = sanitizeIntent(body.intent);

    const [funnel, funnelConfig] = await Promise.all([loadPublicFunnelBySlug(slug), loadPublicFunnelConfigBySlug(slug)]);
    const activePlans = parsePlans(funnel.active_plans);
    // `join_mode` comes from the canonical SQL contract; fail closed if missing/invalid.
    const resolvedJoinMode = normalizeJoinMode(funnel.join_mode, "request_access");
    const preferredPlan =
      activePlans.find((plan) => plan.billing_period === "monthly") ??
      activePlans.find((plan) => plan.billing_period === "yearly") ??
      null;

    if (intent === "resolve") {
      return jsonResponse(
        {
          ok: true,
          intent,
          community: {
            slug: funnel.slug,
            name: funnel.name,
            description: funnel.description ?? null,
            avatar_url: funnel.avatar_url ?? null,
            banner_url: funnel.banner_url ?? null,
            visibility: funnel.visibility,
            free_join_requires_approval: Boolean(funnel.free_join_requires_approval),
            join_mode: resolvedJoinMode,
            created_at: funnel.created_at,
            updated_at: funnel.updated_at,
          },
          active_plan: preferredPlan,
          active_plans: activePlans,
          actions: {
            can_join_free: resolvedJoinMode === "join_free",
            can_request_access: resolvedJoinMode === "request_access",
            can_checkout: resolvedJoinMode === "checkout" && activePlans.length > 0,
          },
          funnel: {
            enabled: Boolean(funnelConfig?.is_enabled),
            schema_json: normalizeFunnelSchema(funnelConfig?.schema_json),
            updated_at: funnelConfig?.updated_at ?? null,
          },
        },
        { status: 200, headers },
      );
    }

    if (intent === "capture_email") {
      const email = sanitizeEmail(body.email);
      const fullName = sanitizeOptionalText(body.full_name);
      const source = sanitizeSource(body.source);
      const brandosAid = sanitizeOptionalUuid(body.tracking?.brandos_aid ?? null);
      const lead = await captureLeadBySlug({
        slug,
        email,
        fullName,
        source,
        metadata: body.metadata,
        brandosAid,
      });
      return jsonResponse(
        {
          ok: true,
          intent,
          lead,
          community: {
            slug: funnel.slug,
            name: funnel.name,
            join_mode: resolvedJoinMode,
          },
        },
        { status: 200, headers },
      );
    }

    if (resolvedJoinMode !== "checkout" || activePlans.length === 0) {
      throw new Error("checkout_not_available");
    }

    const billingPeriod = sanitizeBillingPeriod(body.billing_period ?? preferredPlan?.billing_period ?? "monthly");
    if (!activePlans.some((plan) => plan.billing_period === billingPeriod)) {
      throw new Error("billing_period_not_available");
    }

    const successUrl = requireAllowedRedirectUrl(String(body.success_url ?? ""), "success_url");
    const cancelUrl = requireAllowedRedirectUrl(String(body.cancel_url ?? ""), "cancel_url");
    const brandosAid = sanitizeOptionalUuid(body.tracking?.brandos_aid ?? null);
    const checkout = await startCheckoutViaCanonicalFunction({
      req,
      slug,
      billingPeriod,
      successUrl,
      cancelUrl,
      brandosAid,
    });

    return jsonResponse(
      {
        ok: true,
        intent,
        checkout_url: checkout.checkout_url ?? null,
        session_id: checkout.session_id ?? null,
        payment_intent_id: checkout.payment_intent_id ?? null,
      },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const status =
      lower.includes("community_not_found")
        ? 404
        : lower.includes("rate_limited")
          ? 429
          : lower.includes("auth")
            ? 401
            : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
