import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { stripeRequest } from "../_shared/stripe.ts";

type BuilderTier = "builder" | "pro";

type BuilderCheckoutStartInput = {
  tier: BuilderTier;
  success_url: string;
  cancel_url: string;
};

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

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

function normalizeTier(value: string): BuilderTier {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "pro") return "pro";
  if (v === "builder") return "builder";
  throw new Error("Invalid tier");
}

function resolveBuilderPriceId(tier: BuilderTier): string {
  if (tier === "pro") return requireEnv("STRIPE_BUILDER_PLAN_PRO_PRICE_ID");
  return requireEnv("STRIPE_BUILDER_PLAN_BUILDER_PRICE_ID");
}

type BuilderAccountRow = { user_id: string; stripe_customer_id: string | null };

async function loadBuilderAccount(userId: string): Promise<BuilderAccountRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/builder_accounts?user_id=eq.${encodeURIComponent(userId)}&select=user_id,stripe_customer_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as BuilderAccountRow[];
  return rows[0] ?? null;
}

type AuthAdminUser = { email?: string | null };

async function loadUserEmail(userId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "GET" });
  if (!res.ok) return null;
  const data = (await res.json()) as AuthAdminUser;
  const email = String(data?.email ?? "").trim();
  return email ? email : null;
}

type StripeSessionCreate = { id: string; url: string | null };

async function createBuilderCheckoutSession(params: {
  userId: string;
  tier: BuilderTier;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
}): Promise<StripeSessionCreate> {
  const priceId = resolveBuilderPriceId(params.tier);
  const body: Record<string, unknown> = {
    mode: "subscription",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "line_items[0][quantity]": 1,
    "line_items[0][price]": priceId,
    client_reference_id: params.userId,
    metadata: {
      arx_kind: "builder_plan",
      arx_user_id: params.userId,
      arx_builder_tier: params.tier,
    },
    "subscription_data[metadata][arx_kind]": "builder_plan",
    "subscription_data[metadata][arx_user_id]": params.userId,
    "subscription_data[metadata][arx_builder_tier]": params.tier,
  };

  if (params.stripeCustomerId) {
    body.customer = params.stripeCustomerId;
  } else if (params.customerEmail) {
    body.customer_email = params.customerEmail;
  }

  return stripeRequest<StripeSessionCreate>("POST", "/checkout/sessions", body);
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "builder_checkout_start", windowSeconds: 60, limit: 10 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const token = getBearerToken(req);
    const userId = getVerifiedJwtSub(token);

    const input = await readJson<BuilderCheckoutStartInput>(req);
    const tier = normalizeTier(String((input as { tier?: unknown }).tier ?? ""));
    const successUrl = String(input.success_url ?? "").trim();
    const cancelUrl = String(input.cancel_url ?? "").trim();
    if (!successUrl) throw new Error("success_url is required");
    if (!cancelUrl) throw new Error("cancel_url is required");

    const account = await loadBuilderAccount(userId);
    const email = await loadUserEmail(userId);
    const session = await createBuilderCheckoutSession({
      userId,
      tier,
      successUrl,
      cancelUrl,
      stripeCustomerId: account?.stripe_customer_id ?? null,
      customerEmail: email,
    });

    return jsonResponse(
      { ok: true, checkout_url: session.url, session_id: session.id },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});

