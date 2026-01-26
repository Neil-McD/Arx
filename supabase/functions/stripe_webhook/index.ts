import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders } from "../_shared/http.ts";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { retrieveCheckoutSession, retrieveSubscription, StripeCheckoutSession, StripeSubscription } from "../_shared/stripe.ts";

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function parseStripeSignatureHeader(header: string): { t: string; v1: string[] } {
  const parts = header.split(",").map((part) => part.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
  const v1 = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return { t, v1 };
}

async function verifyStripeWebhook(rawBody: string, signatureHeader: string): Promise<void> {
  const secret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const { t, v1 } = parseStripeSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) throw new Error("Invalid Stripe-Signature header");

  const ts = Number(t);
  if (!Number.isFinite(ts)) throw new Error("Invalid Stripe timestamp");
  // 5 minute tolerance
  const ageSeconds = Math.abs(Date.now() / 1000 - ts);
  if (ageSeconds > 5 * 60) throw new Error("Stale webhook timestamp");

  const signedPayload = `${t}.${rawBody}`;
  const expected = await hmacSha256(secret, signedPayload);
  const expectedHex = Array.from(expected).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ok = v1.some((sig) => timingSafeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expectedHex)));
  if (!ok) throw new Error("Invalid signature");
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

type BuilderTier = "builder" | "pro";

function readEnvOptional(name: string): string {
  const value = (Deno.env.get(name) ?? "").trim();
  return value;
}

function resolveBuilderTierFromSubscription(sub: StripeSubscription): BuilderTier | null {
  const proPriceId = readEnvOptional("STRIPE_BUILDER_PLAN_PRO_PRICE_ID");
  const builderPriceId = readEnvOptional("STRIPE_BUILDER_PLAN_BUILDER_PRICE_ID");
  if (!proPriceId && !builderPriceId) return null;

  const items = sub.items?.data ?? [];
  const priceIds = items
    .map((item) => String(item?.price?.id ?? "").trim())
    .filter((id) => id.length > 0);

  if (proPriceId && priceIds.includes(proPriceId)) return "pro";
  if (builderPriceId && priceIds.includes(builderPriceId)) return "builder";
  return null;
}

function extractUuid(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(v)) return null;
  return v;
}

function extractBuilderUserIdFromCheckout(session: StripeCheckoutSession): string | null {
  const metaUser = session.metadata?.arx_user_id ?? null;
  const fromMeta = extractUuid(metaUser);
  if (fromMeta) return fromMeta;
  return extractUuid(session.client_reference_id ?? null);
}

function extractBuilderUserIdFromSubscription(sub: StripeSubscription): string | null {
  const meta = sub.metadata ?? null;
  const fromMeta = extractUuid(meta?.arx_user_id ?? null);
  if (fromMeta) return fromMeta;
  return null;
}

function isBuilderSubscriptionActive(sub: StripeSubscription): boolean {
  const status = String(sub.status ?? "").trim().toLowerCase();
  const currentPeriodEndMs = Number(sub.current_period_end ?? 0) * 1000;
  if (!Number.isFinite(currentPeriodEndMs) || currentPeriodEndMs <= Date.now()) return false;
  return status === "active" || status === "trialing" || status === "past_due";
}

async function upsertBuilderAccountCustomerId(userId: string, customerId: string | null): Promise<void> {
  const trimmed = String(customerId ?? "").trim();
  if (!trimmed) return;
  const res = await supabaseAdminFetch("/rest/v1/builder_accounts?on_conflict=user_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      stripe_customer_id: trimmed,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function upsertBuilderSubscription(params: {
  subscription: StripeSubscription;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  userId: string | null;
  builderTier: BuilderTier;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const body = {
    provider: "stripe",
    provider_subscription_id: params.providerSubscriptionId,
    provider_customer_id: params.providerCustomerId,
    user_id: params.userId,
    builder_tier: params.builderTier,
    status: String(params.subscription.status ?? ""),
    current_period_start: params.subscription.current_period_start
      ? new Date(params.subscription.current_period_start * 1000).toISOString()
      : null,
    current_period_end: params.subscription.current_period_end
      ? new Date(params.subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(params.subscription.cancel_at_period_end),
    raw_json: params.subscription,
    updated_at: nowIso,
  };
  const res = await supabaseAdminFetch(
    "/rest/v1/builder_subscriptions?on_conflict=provider,provider_subscription_id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function loadBuilderSubscriptionUserId(providerSubscriptionId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/builder_subscriptions?provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(providerSubscriptionId)}&select=user_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ user_id: string | null }>;
  const id = extractUuid(rows[0]?.user_id ?? null);
  return id;
}

async function updateProfileBuilderTier(userId: string, tier: "free" | "builder" | "pro"): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ builder_tier: tier, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function maybeHandleBuilderPlanCheckoutSession(session: StripeCheckoutSession): Promise<boolean> {
  if (!session.subscription) return false;
  const sub = await retrieveSubscription(session.subscription);
  const builderTier = resolveBuilderTierFromSubscription(sub);
  if (!builderTier) return false;

  const userId = extractBuilderUserIdFromCheckout(session) ?? extractBuilderUserIdFromSubscription(sub);
  if (!userId) return false;

  const providerCustomerId = String(sub.customer ?? session.customer ?? "").trim() || null;
  await upsertBuilderAccountCustomerId(userId, providerCustomerId);
  await upsertBuilderSubscription({
    subscription: sub,
    providerSubscriptionId: String(sub.id ?? session.subscription ?? "").trim(),
    providerCustomerId,
    userId,
    builderTier,
  });

  const effectiveTier: "free" | "builder" | "pro" = isBuilderSubscriptionActive(sub) ? builderTier : "free";
  await updateProfileBuilderTier(userId, effectiveTier);
  return true;
}

async function dedupeEvent(event: StripeEvent): Promise<boolean> {
  const res = await supabaseAdminFetch("/rest/v1/payment_provider_events?on_conflict=provider,provider_event_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      raw_json: event,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length === 0; // true => duplicate
}

function isCheckoutSessionEvent(type: string): boolean {
  return (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "checkout.session.async_payment_failed"
  );
}

async function handleCheckoutSession(sessionId: string): Promise<void> {
  const session = await retrieveCheckoutSession(sessionId);
  if (await maybeHandleBuilderPlanCheckoutSession(session)) return;
  const intentId = (session.client_reference_id ?? session.metadata?.payment_intent_id ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(intentId)) return;

  const intentRes = await supabaseAdminFetch(
    `/rest/v1/payment_intents?id=eq.${encodeURIComponent(intentId)}&select=id,community_id,plan_id,status,amount_base_units,currency,currency_decimals,platform_fee_bps`,
    { method: "GET" },
  );
  if (!intentRes.ok) throw new Error(await intentRes.text());
  const intentRows = (await intentRes.json()) as Array<{
    id: string;
    community_id: string;
    plan_id: string;
    amount_base_units: string;
    currency: string;
    currency_decimals: number;
    platform_fee_bps?: number | null;
  }>;
  const intent = intentRows[0];
  if (!intent) return;

  const committed =
    session.mode === "payment"
      ? session.payment_status === "paid"
      : session.mode === "subscription"
        ? session.status === "complete"
        : false;

  await supabaseAdminFetch(`/rest/v1/payment_intents?id=eq.${encodeURIComponent(intent.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      status: committed ? "succeeded" : "pending",
      provider_session_id: session.id,
      updated_at: new Date().toISOString(),
    }),
  });

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const nowIso = new Date().toISOString();

  const platformFeeBps = Number.isFinite(intent.platform_fee_bps) ? Number(intent.platform_fee_bps) : 0;
  const amountBaseUnits = (() => {
    const fromStripe = session.amount_total;
    if (typeof fromStripe === "number" && Number.isFinite(fromStripe)) return BigInt(Math.trunc(fromStripe));
    const raw = String(intent.amount_base_units ?? "").trim();
    const match = raw.match(/^(\d+)(?:\.0+)?$/);
    if (!match) return 0n;
    return BigInt(match[1]);
  })();
  const platformFeeAmount = platformFeeBps > 0 ? (amountBaseUnits * BigInt(platformFeeBps)) / 10000n : 0n;

  await supabaseAdminFetch("/rest/v1/payment_receipts?on_conflict=provider,provider_session_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      payment_intent_id: intent.id,
      provider: "stripe",
      provider_session_id: session.id,
      provider_payment_intent_id: session.payment_intent ?? null,
      provider_subscription_id: session.subscription ?? null,
      provider_customer_id: session.customer ?? null,
      checkout_email: email,
      amount_base_units: String(session.amount_total ?? intent.amount_base_units),
      currency: (session.currency ?? intent.currency).toUpperCase(),
      currency_decimals: intent.currency_decimals,
      platform_fee_bps: platformFeeBps,
      platform_fee_amount_base_units: String(platformFeeAmount),
      status: committed ? "confirmed" : "pending",
      paid_at: committed ? nowIso : null,
      raw_json: session,
    }),
  });

  if (session.subscription) {
    const sub = await retrieveSubscription(session.subscription);
    await supabaseAdminFetch("/rest/v1/provider_subscriptions?on_conflict=provider,provider_subscription_id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
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
    });
  }
}

async function handleSubscriptionUpdated(subscriptionId: string): Promise<void> {
  const sub = await retrieveSubscription(subscriptionId);

  const builderTier = resolveBuilderTierFromSubscription(sub);
  if (builderTier) {
    const providerSubscriptionId = String(sub.id ?? subscriptionId).trim();
    const providerCustomerId = String(sub.customer ?? "").trim() || null;
    let userId = await loadBuilderSubscriptionUserId(providerSubscriptionId);
    if (!userId) userId = extractBuilderUserIdFromSubscription(sub);

    await upsertBuilderSubscription({
      subscription: sub,
      providerSubscriptionId,
      providerCustomerId,
      userId,
      builderTier,
    });

    if (userId) {
      await upsertBuilderAccountCustomerId(userId, providerCustomerId);
      const effectiveTier: "free" | "builder" | "pro" = isBuilderSubscriptionActive(sub) ? builderTier : "free";
      await updateProfileBuilderTier(userId, effectiveTier);
    }
    return;
  }

  const res = await supabaseAdminFetch(
    `/rest/v1/provider_subscriptions?provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(String(sub.id ?? subscriptionId))}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ id: string; user_id: string | null; community_id: string }>;
  const existing = rows[0];
  if (!existing) return;

  const patchRes = await supabaseAdminFetch(
    `/rest/v1/provider_subscriptions?id=eq.${encodeURIComponent(existing.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        provider_customer_id: sub.customer,
        raw_json: sub,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!patchRes.ok) throw new Error(await patchRes.text());

  if (existing.user_id) {
    // Best-effort entitlement extension (claim-first means entitlement may not exist yet).
    await supabaseAdminFetch(
      `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(existing.user_id)}&community_id=eq.${encodeURIComponent(existing.community_id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          ends_at: new Date(sub.current_period_end * 1000).toISOString(),
        }),
      },
    );
  }
}

Deno.serve(async (req: Request) => {
  const headers = noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" });

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers });

  try {
    const signature = req.headers.get("Stripe-Signature") ?? "";
    const rawBody = await req.text();
    await verifyStripeWebhook(rawBody, signature);

    const event = JSON.parse(rawBody) as StripeEvent;
    const isDup = await dedupeEvent(event);
    if (isDup) return new Response("ok", { status: 200, headers });

    if (isCheckoutSessionEvent(event.type)) {
      const obj = event.data.object as Record<string, unknown>;
      const sessionId = String(obj.id ?? "");
      if (sessionId.startsWith("cs_")) {
        await handleCheckoutSession(sessionId);
      }
      return new Response("ok", { status: 200, headers });
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const obj = event.data.object as Record<string, unknown>;
      const subId = String(obj.id ?? "");
      if (subId) await handleSubscriptionUpdated(subId);
      return new Response("ok", { status: 200, headers });
    }

    if (event.type === "invoice.paid") {
      const obj = event.data.object as Record<string, unknown>;
      const subId = String(obj.subscription ?? "");
      if (subId) await handleSubscriptionUpdated(subId);
      return new Response("ok", { status: 200, headers });
    }

    return new Response("ok", { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("stripe_webhook error:", message);
    // Return 400 so Stripe retries if signature/processing failed.
    return new Response(message, { status: 400, headers });
  }
});
