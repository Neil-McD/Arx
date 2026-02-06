import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { stripeRequest } from "../_shared/stripe.ts";

type WorkerInput = { max_affiliates?: number };

type CandidateRow = {
  referrer_user_id: string;
  currency: string;
  net_available_cents: number;
};

type ReserveRow = {
  payout_id: string;
  amount_cents: number;
};

type StripeTransfer = {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  created: number;
};

async function loadWorkerSecret(): Promise<string> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/affiliate_worker_secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ secret: string | null }>;
  const secret = (rows[0]?.secret ?? "").trim();
  if (!secret) throw new Error("worker_secret_not_configured");
  return secret;
}

async function requireWorkerAuth(req: Request): Promise<void> {
  const got = (req.headers.get("x-arx-worker-secret") ?? "").trim();
  if (!got) throw new Error("forbidden");
  const expected = await loadWorkerSecret();
  if (got !== expected) throw new Error("forbidden");
}

async function matureLedger(): Promise<number> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/affiliate_mature_ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
  const count = Number(await res.json());
  return Number.isFinite(count) ? count : 0;
}

async function releaseStalePayouts(): Promise<number> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/affiliate_release_stale_payouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
  const count = Number(await res.json());
  return Number.isFinite(count) ? count : 0;
}

async function listCandidates(maxAffiliates: number): Promise<CandidateRow[]> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/affiliate_list_payout_candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_limit: maxAffiliates }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateRow[];
}

async function reservePayout(params: { referrerUserId: string; currency: string }): Promise<ReserveRow | null> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/affiliate_reserve_payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_referrer_user_id: params.referrerUserId, p_currency: params.currency }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ReserveRow[];
  const row = rows[0];
  if (!row?.payout_id) return null;
  return row;
}

async function finalizePayout(params: {
  payoutId: string;
  paid: boolean;
  stripeTransferId: string | null;
  failureReason: string | null;
}): Promise<void> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/affiliate_finalize_payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_payout_id: params.payoutId,
      p_paid: params.paid,
      p_stripe_transfer_id: params.stripeTransferId,
      p_failure_reason: params.failureReason,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function markPayoutProcessingError(params: { payoutId: string; failureReason: string }): Promise<void> {
  const failureReason = params.failureReason.trim();
  const res = await supabaseAdminFetch(
    `/rest/v1/affiliate_payouts?id=eq.${encodeURIComponent(params.payoutId)}&status=eq.processing`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        failure_reason: failureReason.slice(0, 200),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function loadConnectedAccountId(userId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/builder_accounts?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=stripe_connected_account_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ stripe_connected_account_id: string | null }>;
  const id = (rows[0]?.stripe_connected_account_id ?? "").trim();
  return id ? id : null;
}

async function createStripeTransfer(params: {
  payoutId: string;
  destination: string;
  amountCents: number;
  currency: string;
  referrerUserId: string;
}): Promise<StripeTransfer> {
  const currency = params.currency.trim().toLowerCase();
  const destination = params.destination.trim();
  const amount = Math.trunc(params.amountCents);
  if (!currency) throw new Error("missing_currency");
  if (!destination) throw new Error("missing_destination");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");

  return await stripeRequest<StripeTransfer>(
    "POST",
    "/transfers",
    {
      amount,
      currency,
      destination,
      metadata: {
        arx_kind: "affiliate_payout",
        payout_id: params.payoutId,
        referrer_user_id: params.referrerUserId,
      },
    },
    { idempotencyKey: `affiliate_payout_${params.payoutId}` },
  );
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders({ "Content-Type": "application/json; charset=utf-8" }), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    await requireWorkerAuth(req);
    const input = (await req.json().catch(() => ({}))) as WorkerInput;
    const maxAffiliates = Math.max(1, Math.min(Number(input.max_affiliates ?? 25) || 25, 200));

    const matured = await matureLedger();
    const released = await releaseStalePayouts();

    const candidates = await listCandidates(maxAffiliates);
    const payouts: Array<{ payout_id: string; referrer_user_id: string; amount_cents: number; currency: string; status: string }> = [];

    for (const candidate of candidates) {
      const referrerUserId = String(candidate.referrer_user_id ?? "").trim();
      const currency = String(candidate.currency ?? "").trim().toLowerCase();
      if (!referrerUserId || !currency) continue;

      const reserved = await reservePayout({ referrerUserId, currency });
      if (!reserved) continue;

      const payoutId = String(reserved.payout_id ?? "").trim();
      const amountCents = Number(reserved.amount_cents);
      if (!payoutId || !Number.isFinite(amountCents) || amountCents <= 0) continue;

      try {
        const destination = await loadConnectedAccountId(referrerUserId);
        if (!destination) {
          await finalizePayout({ payoutId, paid: false, stripeTransferId: null, failureReason: "missing_connected_account" });
          payouts.push({ payout_id: payoutId, referrer_user_id: referrerUserId, amount_cents: amountCents, currency, status: "failed" });
          continue;
        }

        try {
          const transfer = await createStripeTransfer({
            payoutId,
            destination,
            amountCents,
            currency,
            referrerUserId,
          });

          try {
            await finalizePayout({ payoutId, paid: true, stripeTransferId: transfer.id, failureReason: null });
            payouts.push({
              payout_id: payoutId,
              referrer_user_id: referrerUserId,
              amount_cents: amountCents,
              currency,
              status: "paid",
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await markPayoutProcessingError({
              payoutId,
              failureReason: `finalize_paid_failed:${message}`,
            });
            payouts.push({
              payout_id: payoutId,
              referrer_user_id: referrerUserId,
              amount_cents: amountCents,
              currency,
              status: "processing_review",
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await markPayoutProcessingError({
            payoutId,
            failureReason: `transfer_error:${message}`,
          });
          payouts.push({
            payout_id: payoutId,
            referrer_user_id: referrerUserId,
            amount_cents: amountCents,
            currency,
            status: "processing_review",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markPayoutProcessingError({
          payoutId,
          failureReason: `worker_error:${message}`,
        });
        payouts.push({
          payout_id: payoutId,
          referrer_user_id: referrerUserId,
          amount_cents: amountCents,
          currency,
          status: "processing_review",
        });
      }
    }

    return jsonResponse({ ok: true, matured, released, payouts }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "forbidden" ? 403 : 500;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
