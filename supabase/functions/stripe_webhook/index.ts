import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders } from "../_shared/http.ts";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import {
  retrieveCharge,
  retrieveCheckoutSession,
  retrieveInvoice,
  retrieveSubscription,
  StripeCharge,
  StripeCheckoutSession,
  StripeInvoice,
  StripeSubscription,
} from "../_shared/stripe.ts";
import { generateToken, tokenPrefix } from "../_shared/tokens.ts";

const PURCHASE_CLAIM_TTL_DAYS = 30;
const SUBSCRIPTION_GRACE_DAYS = 14;

function addDaysIso(iso: string, days: number): string {
  const baseMs = Date.parse(iso);
  if (!Number.isFinite(baseMs)) return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  return new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
}

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
  // Do not reject stale-but-valid webhooks: Stripe delivery can be delayed, and retries reuse
  // the original timestamp. We rely on signature verification + payment_provider_events
  // idempotency instead of a short timestamp tolerance window.

  const signedPayload = `${t}.${rawBody}`;
  const expected = await hmacSha256(secret, signedPayload);
  const expectedHex = Array.from(expected).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ok = v1.some((sig) => timingSafeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expectedHex)));
  if (!ok) throw new Error("Invalid signature");
}

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
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

function isCheckoutSessionEvent(type: string): boolean {
  return (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "checkout.session.async_payment_failed"
  );
}

async function ensureIssuedPurchaseClaim(params: {
  intentId: string;
  checkoutEmail: string | null;
  tracking: Record<string, unknown>;
}): Promise<void> {
  const existingRes = await supabaseAdminFetch(
    `/rest/v1/purchase_claims?select=id&payment_intent_id=eq.${encodeURIComponent(params.intentId)}&status=eq.issued&limit=1`,
    { method: "GET" },
  );
  if (!existingRes.ok) throw new Error(await existingRes.text());
  const existingRows = (await existingRes.json()) as Array<{ id: string }>;
  if (existingRows.length > 0) return;

  const token = generateToken(24);
  const expiresAt = new Date(Date.now() + PURCHASE_CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const hashRes = await supabaseAdminFetch("/rest/v1/rpc/hash_purchase_claim_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!hashRes.ok) throw new Error(await hashRes.text());
  const tokenHash = (await hashRes.json()) as string;

  const insertRes = await supabaseAdminFetch("/rest/v1/purchase_claims", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      payment_intent_id: params.intentId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix(token),
      status: "issued",
      expires_at: expiresAt,
      issued_to_email: params.checkoutEmail,
      tracking: params.tracking,
    }),
  });

  if (insertRes.ok) return;

  // Best-effort: tolerate duplicate issuance under webhook retries/races.
  const bodyText = await insertRes.text();
  if (insertRes.status === 409 || bodyText.toLowerCase().includes("duplicate")) return;
  throw new Error(bodyText);
}

async function handleCheckoutSession(sessionId: string): Promise<void> {
  const session = await retrieveCheckoutSession(sessionId);
  if (await maybeHandleBuilderPlanCheckoutSession(session)) return;
  const intentId = (session.client_reference_id ?? session.metadata?.payment_intent_id ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(intentId)) return;

  const intentRes = await supabaseAdminFetch(
    `/rest/v1/payment_intents?id=eq.${encodeURIComponent(intentId)}&select=id,community_id,plan_id,user_id,status,amount_base_units,currency,currency_decimals,platform_fee_bps,tracking`,
    { method: "GET" },
  );
  if (!intentRes.ok) throw new Error(await intentRes.text());
  const intentRows = (await intentRes.json()) as Array<{
    id: string;
    community_id: string;
    plan_id: string;
    user_id?: string | null;
    amount_base_units: string;
    currency: string;
    currency_decimals: number;
    platform_fee_bps?: number | null;
    tracking?: Record<string, unknown> | null;
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

  // Revenue analytics: record one-time purchases at checkout (subscriptions are recorded via invoice.paid).
  if (committed && session.mode === "payment") {
    await upsertPaymentLedgerEntry({
      community_id: intent.community_id,
      user_id: intent.user_id ?? null,
      payment_intent_id: intent.id,
      provider: "stripe",
      kind: "checkout_session",
      provider_ref: session.id,
      provider_subscription_id: session.subscription ?? null,
      provider_customer_id: session.customer ?? null,
      amount_base_units: String(amountBaseUnits),
      currency: (session.currency ?? intent.currency).toUpperCase(),
      currency_decimals: intent.currency_decimals,
      platform_fee_bps: platformFeeBps,
      platform_fee_amount_base_units: String(platformFeeAmount),
      occurred_at: nowIso,
      raw_json: session,
    });
  }

  if (committed) {
    const tracking = intent.tracking && typeof intent.tracking === "object" ? intent.tracking : {};
    await ensureIssuedPurchaseClaim({ intentId: intent.id, checkoutEmail: email, tracking });
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
  const rows = (await res.json()) as Array<{
    id: string;
    user_id: string | null;
    community_id: string;
    grace_ends_at?: string | null;
  }>;
  const existing = rows[0];
  if (!existing) return;

  const statusLower = String(sub.status ?? "").trim().toLowerCase();
  const clearDelinquency = statusLower === "active" || statusLower === "trialing";
  const currentPeriodEndIso = new Date(sub.current_period_end * 1000).toISOString();
  const effectiveEntitlementEndsAt = clearDelinquency
    ? currentPeriodEndIso
    : (existing.grace_ends_at ?? null) || currentPeriodEndIso;

  const patchRes = await supabaseAdminFetch(
    `/rest/v1/provider_subscriptions?id=eq.${encodeURIComponent(existing.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: currentPeriodEndIso,
        cancel_at_period_end: sub.cancel_at_period_end,
        provider_customer_id: sub.customer,
        delinquent_at: clearDelinquency ? null : undefined,
        grace_ends_at: clearDelinquency ? null : undefined,
        raw_json: sub,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!patchRes.ok) throw new Error(await patchRes.text());

  if (existing.user_id) {
    const providerSubscriptionId = String(sub.id ?? subscriptionId).trim();
    if (providerSubscriptionId) {
      // Best-effort entitlement extension. Guard by source_ref so we don't clobber manual_grant/public_join access.
      await supabaseAdminFetch(
        `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(existing.user_id)}` +
          `&community_id=eq.${encodeURIComponent(existing.community_id)}` +
          `&source_ref=eq.${encodeURIComponent(providerSubscriptionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            ends_at: effectiveEntitlementEndsAt,
          }),
        },
      );
    }
  }
}

async function handleInvoicePaymentFailed(params: { subscriptionId: string; failedAtIso: string }): Promise<void> {
  const sub = await retrieveSubscription(params.subscriptionId);

  const builderTier = resolveBuilderTierFromSubscription(sub);
  if (builderTier) {
    const providerSubscriptionId = String(sub.id ?? params.subscriptionId).trim();
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

  const providerSubscriptionId = String(sub.id ?? params.subscriptionId).trim();
  if (!providerSubscriptionId) return;

  const res = await supabaseAdminFetch(
    `/rest/v1/provider_subscriptions?provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(providerSubscriptionId)}` +
      `&select=id,user_id,community_id,delinquent_at,grace_ends_at&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{
    id: string;
    user_id: string | null;
    community_id: string;
    delinquent_at: string | null;
    grace_ends_at: string | null;
  }>;
  const existing = rows[0];
  if (!existing?.id) return;

  const delinquentAt = existing.delinquent_at ?? params.failedAtIso;
  const graceEndsAt = existing.grace_ends_at ?? addDaysIso(delinquentAt, SUBSCRIPTION_GRACE_DAYS);

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
        delinquent_at: delinquentAt,
        grace_ends_at: graceEndsAt,
        raw_json: sub,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!patchRes.ok) throw new Error(await patchRes.text());

  if (!existing.user_id) return;

  // Enforce grace window by time-bounding the subscription-backed entitlement.
  await supabaseAdminFetch(
    `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(existing.user_id)}` +
      `&community_id=eq.${encodeURIComponent(existing.community_id)}` +
      `&source_ref=eq.${encodeURIComponent(providerSubscriptionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        ends_at: graceEndsAt,
      }),
    },
  );
}

type PaymentLedgerKind = "checkout_session" | "invoice_payment" | "refund" | "dispute";

type PaymentLedgerEntryInsert = {
  community_id: string;
  user_id: string | null;
  payment_intent_id: string | null;
  provider: string;
  kind: PaymentLedgerKind;
  provider_ref: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  platform_fee_bps: number;
  platform_fee_amount_base_units: string | null;
  occurred_at: string;
  raw_json: unknown;
};

async function upsertPaymentLedgerEntry(entry: PaymentLedgerEntryInsert): Promise<void> {
  const res = await supabaseAdminFetch("/rest/v1/payment_ledger_entries?on_conflict=provider,kind,provider_ref", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(await res.text());
}

type PlanCurrencyRow = {
  currency: string;
  currency_decimals: number;
};

async function loadPlanCurrency(planId: string): Promise<PlanCurrencyRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/plans?id=eq.${encodeURIComponent(planId)}&select=currency,currency_decimals&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<PlanCurrencyRow>;
  const row = rows[0];
  if (!row?.currency || row.currency_decimals == null) return null;
  return row;
}

type ProviderSubscriptionRow = {
  community_id: string;
  user_id: string | null;
  plan_id: string;
  payment_intent_id: string | null;
  platform_fee_bps: number | null;
  provider_customer_id: string | null;
};

async function loadProviderSubscriptionRow(providerSubscriptionId: string): Promise<ProviderSubscriptionRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/provider_subscriptions?provider=eq.stripe&provider_subscription_id=eq.${encodeURIComponent(providerSubscriptionId)}` +
      `&select=community_id,user_id,plan_id,payment_intent_id,platform_fee_bps,provider_customer_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ProviderSubscriptionRow[];
  return rows[0] ?? null;
}

type LedgerInvoiceRow = {
  community_id: string;
  user_id: string | null;
  payment_intent_id: string | null;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  currency: string;
  currency_decimals: number;
  platform_fee_bps: number;
};

async function loadLedgerInvoiceRow(invoiceId: string): Promise<LedgerInvoiceRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/payment_ledger_entries?provider=eq.stripe&kind=eq.invoice_payment&provider_ref=eq.${encodeURIComponent(invoiceId)}` +
      `&select=community_id,user_id,payment_intent_id,provider_subscription_id,provider_customer_id,currency,currency_decimals,platform_fee_bps&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as LedgerInvoiceRow[];
  return rows[0] ?? null;
}

type ReceiptContextRow = {
  payment_intent_id: string;
  provider_session_id: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  currency: string;
  currency_decimals: number;
  platform_fee_bps: number;
  payment_intents: { community_id: string; user_id: string | null } | null;
};

async function loadReceiptContextForProviderPaymentIntentId(providerPaymentIntentId: string): Promise<{
  community_id: string;
  user_id: string | null;
  payment_intent_id: string;
  provider_session_id: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  currency: string;
  currency_decimals: number;
  platform_fee_bps: number;
} | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/payment_receipts?provider=eq.stripe&provider_payment_intent_id=eq.${encodeURIComponent(providerPaymentIntentId)}` +
      `&select=payment_intent_id,provider_session_id,provider_subscription_id,provider_customer_id,currency,currency_decimals,platform_fee_bps,payment_intents(community_id,user_id)` +
      `&order=created_at.desc&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ReceiptContextRow[];
  const row = rows[0];
  const intent = row?.payment_intents ?? null;
  if (!row?.payment_intent_id || !intent?.community_id) return null;
  return {
    community_id: intent.community_id,
    user_id: intent.user_id ?? null,
    payment_intent_id: row.payment_intent_id,
    provider_session_id: row.provider_session_id,
    provider_subscription_id: row.provider_subscription_id ?? null,
    provider_customer_id: row.provider_customer_id ?? null,
    currency: String(row.currency ?? "").toUpperCase(),
    currency_decimals: row.currency_decimals,
    platform_fee_bps: Number.isFinite(row.platform_fee_bps) ? row.platform_fee_bps : 0,
  };
}

async function truncateEntitlementForSourceRef(params: {
  communityId: string;
  sourceRef: string;
  endsAtIso: string;
}): Promise<void> {
  const res = await supabaseAdminFetch(
    `/rest/v1/entitlements?community_id=eq.${encodeURIComponent(params.communityId)}` +
      `&source_ref=eq.${encodeURIComponent(params.sourceRef)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ends_at: params.endsAtIso }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function revokeIssuedClaimsForIntent(paymentIntentId: string): Promise<void> {
  const res = await supabaseAdminFetch(
    `/rest/v1/purchase_claims?payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&status=eq.issued`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "revoked" }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function markPaymentIntentFailed(paymentIntentId: string): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/payment_intents?id=eq.${encodeURIComponent(paymentIntentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "failed", updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function handleInvoicePaid(invoice: StripeInvoice, eventCreatedMs: number): Promise<void> {
  const invoiceId = String(invoice.id ?? "").trim();
  const subscriptionId = String(invoice.subscription ?? "").trim();
  if (!invoiceId || !subscriptionId) return;

  const subRow = await loadProviderSubscriptionRow(subscriptionId);
  if (!subRow?.community_id || !subRow.plan_id) return;

  const amountPaid = typeof invoice.amount_paid === "number" && Number.isFinite(invoice.amount_paid) ? invoice.amount_paid : null;
  if (!amountPaid) return;
  const amountBaseUnits = BigInt(Math.trunc(amountPaid));
  if (amountBaseUnits === 0n) return;

  const planCurrency = await loadPlanCurrency(subRow.plan_id);
  if (!planCurrency) return;

  const occurredAtMs = (() => {
    const paidAt = invoice.status_transitions?.paid_at ?? null;
    if (typeof paidAt === "number" && Number.isFinite(paidAt) && paidAt > 0) return paidAt * 1000;
    const created = invoice.created ?? null;
    if (typeof created === "number" && Number.isFinite(created) && created > 0) return created * 1000;
    return eventCreatedMs;
  })();

  const platformFeeBps = Number.isFinite(subRow.platform_fee_bps) ? Number(subRow.platform_fee_bps) : 0;
  const platformFeeAmount = platformFeeBps > 0 ? (amountBaseUnits * BigInt(platformFeeBps)) / 10000n : 0n;

  await upsertPaymentLedgerEntry({
    community_id: subRow.community_id,
    user_id: subRow.user_id ?? null,
    payment_intent_id: subRow.payment_intent_id ?? null,
    provider: "stripe",
    kind: "invoice_payment",
    provider_ref: invoiceId,
    provider_subscription_id: subscriptionId,
    provider_customer_id: subRow.provider_customer_id ?? (String(invoice.customer ?? "").trim() || null),
    amount_base_units: String(amountBaseUnits),
    currency: String(invoice.currency ?? planCurrency.currency).toUpperCase(),
    currency_decimals: planCurrency.currency_decimals,
    platform_fee_bps: platformFeeBps,
    platform_fee_amount_base_units: String(platformFeeAmount),
    occurred_at: new Date(occurredAtMs).toISOString(),
    raw_json: invoice,
  });
}

type ChargeContext = {
  community_id: string;
  user_id: string | null;
  payment_intent_id: string | null;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  currency: string;
  currency_decimals: number;
  platform_fee_bps: number;
  source_ref: string | null;
};

async function resolveChargeContext(charge: StripeCharge): Promise<ChargeContext | null> {
  const invoiceId = String(charge.invoice ?? "").trim() || null;
  if (invoiceId) {
    const ledgerInvoice = await loadLedgerInvoiceRow(invoiceId);
    if (ledgerInvoice) {
      const sourceRef = ledgerInvoice.provider_subscription_id ?? null;
      return {
        community_id: ledgerInvoice.community_id,
        user_id: ledgerInvoice.user_id ?? null,
        payment_intent_id: ledgerInvoice.payment_intent_id ?? null,
        provider_subscription_id: ledgerInvoice.provider_subscription_id ?? null,
        provider_customer_id: ledgerInvoice.provider_customer_id ?? (String(charge.customer ?? "").trim() || null),
        currency: String(ledgerInvoice.currency ?? "").toUpperCase(),
        currency_decimals: ledgerInvoice.currency_decimals,
        platform_fee_bps: Number.isFinite(ledgerInvoice.platform_fee_bps) ? Number(ledgerInvoice.platform_fee_bps) : 0,
        source_ref: sourceRef,
      };
    }

    const invoice = await retrieveInvoice(invoiceId);
    const subscriptionId = String(invoice.subscription ?? "").trim();
    if (!subscriptionId) return null;
    const subRow = await loadProviderSubscriptionRow(subscriptionId);
    if (!subRow?.community_id || !subRow.plan_id) return null;
    const planCurrency = await loadPlanCurrency(subRow.plan_id);
    if (!planCurrency) return null;
    const platformFeeBps = Number.isFinite(subRow.platform_fee_bps) ? Number(subRow.platform_fee_bps) : 0;
    return {
      community_id: subRow.community_id,
      user_id: subRow.user_id ?? null,
      payment_intent_id: subRow.payment_intent_id ?? null,
      provider_subscription_id: subscriptionId,
      provider_customer_id:
        subRow.provider_customer_id ??
        (String(invoice.customer ?? "").trim() || String(charge.customer ?? "").trim() || null),
      currency: String(invoice.currency ?? planCurrency.currency).toUpperCase(),
      currency_decimals: planCurrency.currency_decimals,
      platform_fee_bps: platformFeeBps,
      source_ref: subscriptionId,
    };
  }

  const providerPaymentIntentId = String(charge.payment_intent ?? "").trim() || null;
  if (providerPaymentIntentId) {
    const receipt = await loadReceiptContextForProviderPaymentIntentId(providerPaymentIntentId);
    if (!receipt) return null;
    const sourceRef = receipt.provider_subscription_id ?? receipt.provider_session_id ?? null;
    return {
      community_id: receipt.community_id,
      user_id: receipt.user_id ?? null,
      payment_intent_id: receipt.payment_intent_id,
      provider_subscription_id: receipt.provider_subscription_id ?? null,
      provider_customer_id: receipt.provider_customer_id ?? (String(charge.customer ?? "").trim() || null),
      currency: receipt.currency,
      currency_decimals: receipt.currency_decimals,
      platform_fee_bps: receipt.platform_fee_bps,
      source_ref: sourceRef,
    };
  }

  return null;
}

async function handleChargeRefunded(charge: StripeCharge): Promise<void> {
  const refunds = charge.refunds?.data ?? [];
  if (!Array.isArray(refunds) || refunds.length === 0) return;

  const context = await resolveChargeContext(charge);
  if (!context) return;

  for (const refund of refunds) {
    const refundId = String(refund?.id ?? "").trim();
    if (!refundId) continue;

    const refundAmount = typeof refund?.amount === "number" && Number.isFinite(refund.amount) ? refund.amount : 0;
    const amountBaseUnits = BigInt(-Math.trunc(refundAmount));
    if (amountBaseUnits === 0n) continue;

    const platformFeeBps = context.platform_fee_bps;
    const platformFeeAmount = platformFeeBps > 0 ? (amountBaseUnits * BigInt(platformFeeBps)) / 10000n : 0n;

    const occurredAtMs =
      typeof refund?.created === "number" && Number.isFinite(refund.created) && refund.created > 0
        ? refund.created * 1000
        : Date.now();

    await upsertPaymentLedgerEntry({
      community_id: context.community_id,
      user_id: context.user_id ?? null,
      payment_intent_id: context.payment_intent_id ?? null,
      provider: "stripe",
      kind: "refund",
      provider_ref: refundId,
      provider_subscription_id: context.provider_subscription_id ?? null,
      provider_customer_id: context.provider_customer_id ?? null,
      amount_base_units: String(amountBaseUnits),
      currency: context.currency,
      currency_decimals: context.currency_decimals,
      platform_fee_bps: platformFeeBps,
      platform_fee_amount_base_units: String(platformFeeAmount),
      occurred_at: new Date(occurredAtMs).toISOString(),
      raw_json: { refund, charge_id: charge.id },
    });
  }

  const fullyRefunded =
    Boolean(charge.refunded) ||
    (typeof charge.amount_refunded === "number" &&
      typeof charge.amount === "number" &&
      Number.isFinite(charge.amount_refunded) &&
      Number.isFinite(charge.amount) &&
      charge.amount_refunded >= charge.amount);

  // For now: only revoke access for fully refunded one-time purchases (subscription access is governed by subscription state).
  if (fullyRefunded && context.provider_subscription_id == null && context.source_ref && context.payment_intent_id) {
    const nowIso = new Date().toISOString();
    await truncateEntitlementForSourceRef({ communityId: context.community_id, sourceRef: context.source_ref, endsAtIso: nowIso });
    await revokeIssuedClaimsForIntent(context.payment_intent_id);
    await markPaymentIntentFailed(context.payment_intent_id);
  }
}

async function handleChargeDisputeClosed(dispute: Record<string, unknown>, eventCreatedMs: number): Promise<void> {
  const disputeId = String(dispute.id ?? "").trim();
  if (!disputeId) return;

  const status = String(dispute.status ?? "").trim().toLowerCase();
  if (status !== "lost") return;

  const chargeId = String(dispute.charge ?? "").trim();
  if (!chargeId) return;

  const charge = await retrieveCharge(chargeId);
  const context = await resolveChargeContext(charge);
  if (!context) return;

  const amount = typeof dispute.amount === "number" && Number.isFinite(dispute.amount) ? dispute.amount : 0;
  const amountBaseUnits = BigInt(-Math.trunc(amount));
  if (amountBaseUnits === 0n) return;

  const platformFeeBps = context.platform_fee_bps;
  const platformFeeAmount = platformFeeBps > 0 ? (amountBaseUnits * BigInt(platformFeeBps)) / 10000n : 0n;

  const occurredAtMs = (() => {
    const created = dispute.created ?? null;
    if (typeof created === "number" && Number.isFinite(created) && created > 0) return created * 1000;
    return eventCreatedMs;
  })();

  await upsertPaymentLedgerEntry({
    community_id: context.community_id,
    user_id: context.user_id ?? null,
    payment_intent_id: context.payment_intent_id ?? null,
    provider: "stripe",
    kind: "dispute",
    provider_ref: disputeId,
    provider_subscription_id: context.provider_subscription_id ?? null,
    provider_customer_id: context.provider_customer_id ?? null,
    amount_base_units: String(amountBaseUnits),
    currency: context.currency,
    currency_decimals: context.currency_decimals,
    platform_fee_bps: platformFeeBps,
    platform_fee_amount_base_units: String(platformFeeAmount),
    occurred_at: new Date(occurredAtMs).toISOString(),
    raw_json: dispute,
  });

  // For now: only revoke access for one-time disputes. Subscription access is governed by subscription state.
  if (context.provider_subscription_id == null && context.source_ref && context.payment_intent_id) {
    const nowIso = new Date().toISOString();
    await truncateEntitlementForSourceRef({ communityId: context.community_id, sourceRef: context.source_ref, endsAtIso: nowIso });
    await revokeIssuedClaimsForIntent(context.payment_intent_id);
    await markPaymentIntentFailed(context.payment_intent_id);
  }
}

type ProviderEventRow = {
  id: string;
  processed_at: string | null;
};

async function upsertProviderEvent(event: StripeEvent): Promise<ProviderEventRow> {
  const res = await supabaseAdminFetch("/rest/v1/payment_provider_events?on_conflict=provider,provider_event_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      raw_json: event,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ProviderEventRow[];
  const row = rows[0];
  if (!row?.id) throw new Error("Failed to upsert payment_provider_events row");
  return row;
}

async function markProviderEventProcessed(id: string): Promise<void> {
  const res = await supabaseAdminFetch(`/rest/v1/payment_provider_events?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ processed_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function handleStripeEvent(event: StripeEvent): Promise<void> {
  if (isCheckoutSessionEvent(event.type)) {
    const obj = event.data.object as Record<string, unknown>;
    const sessionId = String(obj.id ?? "");
    if (sessionId.startsWith("cs_")) {
      await handleCheckoutSession(sessionId);
    }
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const obj = event.data.object as Record<string, unknown>;
    const subId = String(obj.id ?? "");
    if (subId) await handleSubscriptionUpdated(subId);
    return;
  }

  if (event.type === "invoice.paid") {
    const obj = event.data.object as Record<string, unknown>;
    const subId = String(obj.subscription ?? "");
    if (subId) {
      const created = typeof event.created === "number" && Number.isFinite(event.created) ? event.created * 1000 : Date.now();
      await handleInvoicePaid(obj as unknown as StripeInvoice, created);
      await handleSubscriptionUpdated(subId);
    }
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const obj = event.data.object as Record<string, unknown>;
    const subId = String(obj.subscription ?? "");
    if (subId) {
      const created = typeof event.created === "number" && Number.isFinite(event.created) ? event.created * 1000 : Date.now();
      await handleInvoicePaymentFailed({ subscriptionId: subId, failedAtIso: new Date(created).toISOString() });
    }
    return;
  }

  if (event.type === "charge.refunded") {
    const obj = event.data.object as unknown as StripeCharge;
    await handleChargeRefunded(obj);
    return;
  }

  if (event.type === "charge.dispute.closed") {
    const obj = event.data.object as Record<string, unknown>;
    const created = typeof event.created === "number" && Number.isFinite(event.created) ? event.created * 1000 : Date.now();
    await handleChargeDisputeClosed(obj, created);
    return;
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
    const providerEvent = await upsertProviderEvent(event);
    if (providerEvent.processed_at) return new Response("ok", { status: 200, headers });

    await handleStripeEvent(event);
    await markProviderEventProcessed(providerEvent.id);

    return new Response("ok", { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("stripe_webhook error:", message);
    // Return 400 so Stripe retries if signature/processing failed.
    return new Response(message, { status: 400, headers });
  }
});
