import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import {
  retrieveCheckoutSession,
  retrieveSubscription,
  StripeCheckoutSession,
  StripeSubscription,
} from "../_shared/stripe.ts";
import { generateToken, tokenPrefix } from "../_shared/tokens.ts";

function sanitizeSessionId(value: string): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error("session_id is required");
  if (!/^cs_[A-Za-z0-9_]+$/.test(v)) throw new Error("Invalid session_id");
  return v;
}

type PaymentIntentRow = {
  id: string;
  community_id: string;
  plan_id: string;
  status: string;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  platform_fee_bps?: number | null;
};

async function loadPaymentIntent(intentId: string): Promise<PaymentIntentRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/payment_intents?id=eq.${encodeURIComponent(intentId)}&select=id,community_id,plan_id,status,amount_base_units,currency,currency_decimals,platform_fee_bps`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PaymentIntentRow[];
  const row = rows[0];
  if (!row) throw new Error("payment_intent not found");
  return row;
}

async function updatePaymentIntent(intentId: string, patch: Record<string, unknown>): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/payment_intents?id=eq.${encodeURIComponent(intentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

function parseBaseUnits(value: string): bigint {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d+)(?:\.0+)?$/);
  if (!match) return 0n;
  return BigInt(match[1]);
}

function resolvePlatformFeeBps(intent: PaymentIntentRow): number {
  const candidate = intent.platform_fee_bps;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return 0;
  return Math.min(10000, Math.max(0, Math.trunc(candidate)));
}

function resolveAmountBaseUnits(intent: PaymentIntentRow, session: StripeCheckoutSession): bigint {
  const fromStripe = session.amount_total;
  if (typeof fromStripe === "number" && Number.isFinite(fromStripe)) {
    return BigInt(Math.trunc(fromStripe));
  }
  return parseBaseUnits(intent.amount_base_units);
}

async function upsertReceipt(intent: PaymentIntentRow, session: StripeCheckoutSession): Promise<void> {
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const currency = (session.currency ?? intent.currency).toUpperCase();
  const amountBaseUnits = resolveAmountBaseUnits(intent, session);
  const platformFeeBps = resolvePlatformFeeBps(intent);
  const platformFeeAmount = platformFeeBps > 0 ? (amountBaseUnits * BigInt(platformFeeBps)) / 10000n : 0n;
  const nowIso = new Date().toISOString();
  const status = isCommitted(session) ? "confirmed" : "pending";

  const res = await supabaseAdminFetch(
    "/rest/v1/payment_receipts?on_conflict=provider,provider_session_id",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        payment_intent_id: intent.id,
        provider: "stripe",
        provider_session_id: session.id,
        provider_payment_intent_id: session.payment_intent ?? null,
        provider_subscription_id: session.subscription ?? null,
        provider_customer_id: session.customer ?? null,
        checkout_email: email,
        amount_base_units: String(amountBaseUnits),
        currency,
        currency_decimals: intent.currency_decimals,
        platform_fee_bps: platformFeeBps,
        platform_fee_amount_base_units: String(platformFeeAmount),
        status,
        paid_at: isCommitted(session) ? nowIso : null,
        raw_json: session,
      }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function upsertSubscription(
  intent: PaymentIntentRow,
  session: StripeCheckoutSession,
): Promise<StripeSubscription | null> {
  if (!session.subscription) return null;
  const sub = await retrieveSubscription(session.subscription);
  const platformFeeBps = resolvePlatformFeeBps(intent);
  const res = await supabaseAdminFetch(
    "/rest/v1/provider_subscriptions?on_conflict=provider,provider_subscription_id",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        provider: "stripe",
        provider_subscription_id: sub.id,
        provider_customer_id: sub.customer,
        payment_intent_id: intent.id,
        community_id: intent.community_id,
        plan_id: intent.plan_id,
        user_id: null,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        platform_fee_bps: platformFeeBps,
        raw_json: sub,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return sub;
}

async function revokeIssuedClaims(intentId: string): Promise<void> {
  const res = await supabaseAdminFetch(
    `/rest/v1/purchase_claims?payment_intent_id=eq.${encodeURIComponent(intentId)}&status=eq.issued`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "revoked" }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function insertClaim(
  intentId: string,
  token: string,
  issuedToEmail: string | null,
  ttlDays = 7,
): Promise<{ token: string; expires_at: string }> {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const hashRes = await supabaseAdminFetch("/rest/v1/rpc/hash_purchase_claim_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!hashRes.ok) throw new Error(await hashRes.text());
  const tokenHash = (await hashRes.json()) as string;

  const res = await supabaseAdminFetch("/rest/v1/purchase_claims", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      payment_intent_id: intentId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix(token),
      status: "issued",
      expires_at: expiresAt,
      issued_to_email: issuedToEmail,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return { token, expires_at: expiresAt };
}

function isCommitted(session: StripeCheckoutSession): boolean {
  if (session.mode === "payment") {
    return session.payment_status === "paid";
  }
  if (session.mode === "subscription") {
    return session.status === "complete";
  }
  return false;
}

function extractIntentId(session: StripeCheckoutSession): string {
  const candidate = (session.client_reference_id ?? session.metadata?.payment_intent_id ?? "").trim();
  if (!candidate) throw new Error("Missing payment_intent_id on session");
  if (!/^[0-9a-fA-F-]{36}$/.test(candidate)) throw new Error("Invalid payment_intent_id");
  return candidate;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const url = new URL(req.url);
  const sessionId = sanitizeSessionId(url.searchParams.get("session_id") ?? "");

  try {
    const allowed = await edgeRateLimitAllow({
      req,
      key: `checkout_finalize:${sessionId}`,
      windowSeconds: 60,
      limit: 30,
    });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const session = await retrieveCheckoutSession(sessionId);
    const intentId = extractIntentId(session);
    const intent = await loadPaymentIntent(intentId);

    await upsertReceipt(intent, session);
    await upsertSubscription(intent, session);

    const committed = isCommitted(session);
    await updatePaymentIntent(intentId, { status: committed ? "succeeded" : "pending", provider_session_id: session.id });

    if (!committed) {
      return jsonResponse({ ok: false, status: "pending" }, { status: 200, headers });
    }

    await revokeIssuedClaims(intentId);
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const token = generateToken(24);
    const claim = await insertClaim(intentId, token, email, 7);

    return jsonResponse(
      {
        ok: true,
        status: "succeeded",
        payment_intent_id: intentId,
        claim,
        deep_link: `arx://claim?token=${encodeURIComponent(claim.token)}`,
      },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
