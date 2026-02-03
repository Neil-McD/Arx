import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { requireAllowedRedirectUrl } from "../_shared/redirects.ts";
import { stripeRequest } from "../_shared/stripe.ts";

type CheckoutStartInput = {
  community_id?: string;
  plan_id?: string;
  community_slug?: string;
  billing_period?: string;
  success_url: string;
  cancel_url: string;
  tracking?: {
    brandos_aid?: string;
  };
};

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

function sanitizeUuid(value: string): string {
  const v = (value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(v)) throw new Error("Invalid id");
  return v;
}

function sanitizeSlug(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) throw new Error("community_slug is required");
  if (v.length > 128) throw new Error("community_slug too long");
  return v;
}

function sanitizeOptionalUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(v)) throw new Error("Invalid id");
  return v;
}

function sanitizeBillingPeriod(value: unknown): "one_time" | "monthly" | "yearly" {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "one_time" || v === "monthly" || v === "yearly") return v;
  throw new Error("Invalid billing_period");
}

function extractBearerToken(header: string | null): string | null {
  const value = (header ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (!lower.startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token ? token : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthUserId(req: Request): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) return null;
  try {
    const res = await supabaseAdminFetch(`/auth/v1/user`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    const id = String(json?.id ?? "").trim();
    if (!id || !isUuid(id)) return null;
    return id;
  } catch {
    return null;
  }
}

type PlanRow = {
  id: string;
  community_id: string;
  name: string;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: "one_time" | "monthly" | "yearly";
  stripe_price_id: string | null;
  is_active: boolean;
  visibility: string;
};

async function loadPlan(planId: string): Promise<PlanRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/plans?id=eq.${encodeURIComponent(planId)}&select=id,community_id,name,amount_base_units,currency,currency_decimals,billing_period,stripe_price_id,is_active,visibility`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PlanRow[];
  const row = rows[0];
  if (!row) throw new Error("Plan not found");
  if (!row.is_active) throw new Error("Plan is not active");
  return row;
}

async function loadCommunityIdBySlug(slug: string): Promise<string> {
  const res = await supabaseAdminFetch(
    `/rest/v1/communities?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ id: string }>;
  const id = (rows[0]?.id ?? "").trim();
  if (!id) throw new Error("Community not found");
  return id;
}

async function loadActivePlanForCommunity(
  communityId: string,
  billingPeriod: PlanRow["billing_period"],
): Promise<PlanRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/plans?select=id,community_id,name,amount_base_units,currency,currency_decimals,billing_period,stripe_price_id,is_active,visibility` +
      `&community_id=eq.${encodeURIComponent(communityId)}` +
      `&billing_period=eq.${encodeURIComponent(billingPeriod)}` +
      `&is_active=eq.true&visibility=in.(public,unlisted)`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PlanRow[];
  const preferred = rows.find((row) => (row.visibility ?? "").trim() === "public") ?? rows[0] ?? null;
  if (!preferred) throw new Error("Plan not found");
  if (!preferred.is_active) throw new Error("Plan is not active");
  return preferred;
}

type CommunityOwnerRow = { id: string; owner_id: string };

async function loadCommunityOwner(communityId: string): Promise<CommunityOwnerRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/communities?id=eq.${encodeURIComponent(communityId)}&select=id,owner_id`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as CommunityOwnerRow[];
  const row = rows[0];
  if (!row?.owner_id) throw new Error("Community not found");
  return row;
}

type BuilderAccountRow = { user_id: string; stripe_connected_account_id: string | null };

async function loadBuilderConnectedAccountId(userId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/builder_accounts?user_id=eq.${encodeURIComponent(userId)}&select=user_id,stripe_connected_account_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as BuilderAccountRow[];
  const row = rows[0];
  const acct = String(row?.stripe_connected_account_id ?? "").trim();
  return acct ? acct : null;
}

type BuilderTier = "free" | "builder" | "pro";
type ProfileTierRow = { user_id: string; builder_tier: string | null };

async function loadBuilderTier(userId: string): Promise<BuilderTier> {
  const res = await supabaseAdminFetch(
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,builder_tier`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ProfileTierRow[];
  const row = rows[0];
  const tier = (row?.builder_tier ?? "free").trim().toLowerCase();
  if (tier === "pro") return "pro";
  if (tier === "builder") return "builder";
  return "free";
}

function resolvePlatformFeeBps(tier: BuilderTier): number {
  // Skool-shaped: higher plan => lower take rate.
  if (tier === "pro") return 300; // 3%
  return 1000; // 10% for builder
}

async function createPaymentIntent(
  plan: PlanRow,
  platformFeeBps: number,
  tracking: Record<string, unknown>,
  userId: string | null,
): Promise<{ id: string }> {
  const res = await supabaseAdminFetch("/rest/v1/payment_intents?select=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      community_id: plan.community_id,
      plan_id: plan.id,
      user_id: userId,
      provider: "stripe",
      status: "created",
      amount_base_units: plan.amount_base_units,
      currency: plan.currency,
      currency_decimals: plan.currency_decimals,
      platform_fee_bps: platformFeeBps,
      tracking,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ id: string }>;
  const row = rows[0];
  if (!row) throw new Error("Failed to create payment intent");
  return row;
}

async function updatePaymentIntent(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/payment_intents?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

type StripeSessionCreate = {
  id: string;
  url: string | null;
};

type StripePriceCreate = {
  id: string;
};

async function updatePlanStripePriceId(planId: string, stripePriceId: string): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/plans?id=eq.${encodeURIComponent(planId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ stripe_price_id: stripePriceId, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function ensureStripePriceForPlan(plan: PlanRow): Promise<string> {
  if (plan.stripe_price_id) return plan.stripe_price_id;
  if (plan.billing_period !== "monthly" && plan.billing_period !== "yearly") {
    throw new Error("Plan billing period is not supported");
  }
  const unitAmount = Math.round(Number(plan.amount_base_units ?? 0));
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) throw new Error("Invalid plan amount");

  const interval = plan.billing_period === "monthly" ? "month" : "year";
  const price = await stripeRequest<StripePriceCreate>("POST", "/prices", {
    unit_amount: unitAmount,
    currency: plan.currency,
    recurring: { interval },
    product_data: { name: `${plan.name} (${plan.billing_period})` },
    metadata: {
      community_id: plan.community_id,
      plan_id: plan.id,
    },
  });
  await updatePlanStripePriceId(plan.id, price.id);
  return price.id;
}

async function createStripeCheckoutSession(
  intentId: string,
  plan: PlanRow,
  platformFeeBps: number,
  destinationAccountId: string,
  input: CheckoutStartInput,
): Promise<StripeSessionCreate> {
  const mode =
    plan.billing_period === "one_time" ? "payment" : "subscription";
  const stripePriceId =
    mode === "subscription" ? await ensureStripePriceForPlan(plan) : plan.stripe_price_id;
  if (!stripePriceId) throw new Error("Plan is missing stripe_price_id");

  const body: Record<string, unknown> = {
    mode,
    success_url: input.success_url,
    cancel_url: input.cancel_url,
    client_reference_id: intentId,
    metadata: {
      payment_intent_id: intentId,
      community_id: plan.community_id,
      plan_id: plan.id,
    },
    "line_items[0][quantity]": 1,
  };
  body["line_items[0][price]"] = stripePriceId;

  if (mode === "subscription") {
    const feePercent = Math.max(0, Math.min(100, platformFeeBps / 100));
    body["subscription_data[application_fee_percent]"] = feePercent;
    body["subscription_data[transfer_data][destination]"] = destinationAccountId;
  }
  return stripeRequest<StripeSessionCreate>("POST", "/checkout/sessions", body);
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "checkout_start", windowSeconds: 60, limit: 15 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const input = await readJson<CheckoutStartInput>(req);
    const successUrl = requireAllowedRedirectUrl(input.success_url, "success_url");
    const cancelUrl = requireAllowedRedirectUrl(input.cancel_url, "cancel_url");
    const brandosAid = sanitizeOptionalUuid(input.tracking?.brandos_aid ?? null);

    const rawPlanId = String(input.plan_id ?? "").trim();
    const rawCommunityId = String(input.community_id ?? "").trim();
    const rawCommunitySlug = String(input.community_slug ?? "").trim();

    const plan = rawPlanId
      ? await (async () => {
          const communityId = sanitizeUuid(rawCommunityId);
          const planId = sanitizeUuid(rawPlanId);
          const loaded = await loadPlan(planId);
          if (loaded.community_id !== communityId) throw new Error("Plan does not belong to community");
          return loaded;
        })()
      : await (async () => {
          const slug = sanitizeSlug(rawCommunitySlug);
          const billingPeriod = sanitizeBillingPeriod(input.billing_period);
          const communityId = await loadCommunityIdBySlug(slug);
          return loadActivePlanForCommunity(communityId, billingPeriod);
        })();

    const community = await loadCommunityOwner(plan.community_id);
    const builderTier = await loadBuilderTier(community.owner_id);
    if (builderTier === "free") {
      throw new Error("Creator must be on Builder/Pro to accept payments");
    }
    const platformFeeBps = resolvePlatformFeeBps(builderTier);
    const destinationAccountId = await loadBuilderConnectedAccountId(community.owner_id);
    if (!destinationAccountId) {
      throw new Error("Creator must set up payouts before accepting payments");
    }
    const tracking = brandosAid ? { brandos_aid: brandosAid } : {};
    const userId = await getAuthUserId(req);
    const intent = await createPaymentIntent(plan, platformFeeBps, tracking, userId);
    const session = await createStripeCheckoutSession(intent.id, plan, platformFeeBps, destinationAccountId, {
      ...input,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await updatePaymentIntent(intent.id, {
      status: "pending",
      provider_session_id: session.id,
    });

    return jsonResponse(
      { ok: true, checkout_url: session.url, session_id: session.id, payment_intent_id: intent.id },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
