import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  handleCorsPreflightAndMethod,
  jsonResponse,
  noStoreHeaders,
  parseBearerToken,
  withCors,
} from "../_shared/http.ts";
import { getEnv } from "../_shared/env.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { enforceEdgeRateLimit } from "../_shared/rate_limit.ts";
import { requireAllowedRedirectUrl } from "../_shared/redirects.ts";
import {
  loadPublicFunnelBySlug,
  type PublicFunnelRow,
  sanitizePublicSlug,
  toPublicCommunitySummary,
} from "../_shared/public_funnel.ts";
import {
  parsePublicRecurringPlans,
  requireRecurringBillingPeriod,
  type PublicRecurringPlan,
} from "../_shared/public_plan.ts";

type PublicFunnelIntent = "resolve" | "checkout";
type CommunityJoinMode = "join_free" | "request_access" | "checkout";

type PublicFunnelInput = {
  community_slug?: unknown;
  intent?: unknown;
  billing_period?: unknown;
  success_url?: unknown;
  cancel_url?: unknown;
  tracking?: {
    brandos_aid?: unknown;
  } | null;
};

type PublicPlanSummary = PublicRecurringPlan;

type CheckoutStartOutput = {
  ok?: boolean;
  checkout_url?: string | null;
  session_id?: string | null;
  payment_intent_id?: string | null;
  error?: string;
};

function sanitizeIntent(raw: unknown): PublicFunnelIntent {
  const value = String(raw ?? "resolve")
    .trim()
    .toLowerCase();
  if (value === "resolve" || value === "checkout") return value;
  throw new Error("invalid_intent");
}

function sanitizeOptionalUuid(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("invalid_uuid");
  return value;
}

function normalizeJoinMode(raw: string, fallback: CommunityJoinMode): CommunityJoinMode {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "join_free" || value === "request_access" || value === "checkout") return value;
  return fallback;
}

async function readJsonBounded<T>(req: Request, maxChars = 128_000): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
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

  const authBearer = parseBearerToken(params.req.headers.get("Authorization"));
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
  const methodResponse = handleCorsPreflightAndMethod(req, headers, "POST");
  if (methodResponse) return methodResponse;

  try {
    const rateLimitResponse = await enforceEdgeRateLimit({
      req,
      key: "public_funnel",
      windowSeconds: 60,
      limit: 90,
      headers,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readJsonBounded<PublicFunnelInput>(req);
    const slug = sanitizePublicSlug(body.community_slug);
    const intent = sanitizeIntent(body.intent);

    const funnel = await loadPublicFunnelBySlug(slug);
    const activePlans = parsePublicRecurringPlans(funnel.active_plans, { includeId: true });
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
            ...toPublicCommunitySummary(funnel),
            join_mode: resolvedJoinMode,
          },
          active_plan: preferredPlan,
          active_plans: activePlans,
          actions: {
            can_join_free: resolvedJoinMode === "join_free",
            can_request_access: resolvedJoinMode === "request_access",
            can_checkout: resolvedJoinMode === "checkout" && activePlans.length > 0,
          },
        },
        { status: 200, headers },
      );
    }

    if (resolvedJoinMode !== "checkout" || activePlans.length === 0) {
      throw new Error("checkout_not_available");
    }

    const billingPeriod = requireRecurringBillingPeriod(
      body.billing_period ?? preferredPlan?.billing_period ?? "monthly",
      "invalid_billing_period",
    );
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
