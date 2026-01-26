import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { stripeRequest } from "../_shared/stripe.ts";

type BillingPortalStartInput = {
  return_url: string;
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

type BuilderAccountRow = { stripe_customer_id: string | null };
type BuilderSubscriptionRow = { provider_customer_id: string | null };

async function loadStripeCustomerId(userId: string): Promise<string | null> {
  const accountRes = await supabaseAdminFetch(
    `/rest/v1/builder_accounts?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id&limit=1`,
    { method: "GET" },
  );
  if (!accountRes.ok) throw new Error(await accountRes.text());
  const accountRows = (await accountRes.json()) as BuilderAccountRow[];
  const customerId = String(accountRows[0]?.stripe_customer_id ?? "").trim();
  if (customerId) return customerId;

  const subRes = await supabaseAdminFetch(
    `/rest/v1/builder_subscriptions?user_id=eq.${encodeURIComponent(userId)}&provider=eq.stripe&select=provider_customer_id&order=updated_at.desc&limit=1`,
    { method: "GET" },
  );
  if (!subRes.ok) throw new Error(await subRes.text());
  const subRows = (await subRes.json()) as BuilderSubscriptionRow[];
  const fallback = String(subRows[0]?.provider_customer_id ?? "").trim();
  return fallback || null;
}

type StripeBillingPortalSession = { id: string; url: string | null };

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "builder_billing_portal", windowSeconds: 60, limit: 10 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const token = getBearerToken(req);
    const userId = getVerifiedJwtSub(token);

    const input = await readJson<BillingPortalStartInput>(req);
    const returnUrl = String(input.return_url ?? "").trim();
    if (!returnUrl) throw new Error("return_url is required");

    const customerId = await loadStripeCustomerId(userId);
    if (!customerId) throw new Error("No billing customer found. Start a subscription first.");

    const session = await stripeRequest<StripeBillingPortalSession>("POST", "/billing_portal/sessions", {
      customer: customerId,
      return_url: returnUrl,
    });

    return jsonResponse({ ok: true, url: session.url, session_id: session.id }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});

