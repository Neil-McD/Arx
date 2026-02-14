import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { requireVerifiedUserId } from "../_shared/auth.ts";
import { requireAllowedRedirectUrl } from "../_shared/redirects.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import { loadAuthAdminUserEmail } from "../_shared/auth_admin.ts";

type ConnectOnboardStartInput = {
  return_url: string;
  refresh_url: string;
};

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

type BuilderAccountRow = { user_id: string; stripe_connected_account_id: string | null };

async function loadBuilderAccount(userId: string): Promise<BuilderAccountRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/builder_accounts?user_id=eq.${encodeURIComponent(userId)}&select=user_id,stripe_connected_account_id&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as BuilderAccountRow[];
  return rows[0] ?? null;
}

async function upsertConnectedAccountId(userId: string, accountId: string): Promise<void> {
  const res = await supabaseAdminFetch("/rest/v1/builder_accounts?on_conflict=user_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      stripe_connected_account_id: accountId,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

type StripeAccountCreate = { id: string };
type StripeAccountLinkCreate = { url: string | null };

async function ensureConnectAccount(userId: string): Promise<string> {
  const existing = await loadBuilderAccount(userId);
  const current = String(existing?.stripe_connected_account_id ?? "").trim();
  if (current) return current;

  const email = await loadAuthAdminUserEmail(userId);
  const account = await stripeRequest<StripeAccountCreate>("POST", "/accounts", {
    type: "express",
    ...(email ? { email } : null),
    "capabilities[card_payments][requested]": true,
    "capabilities[transfers][requested]": true,
    "metadata[arx_user_id]": userId,
    "metadata[arx_kind]": "builder_connect",
  });
  await upsertConnectedAccountId(userId, account.id);
  return account.id;
}

Deno.serve(async (req: Request) => {
  const cors = withStrictCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  }
  if (!cors.allowed) {
    return jsonResponse({ ok: false, error: "cors_origin_not_allowed" }, { status: 403, headers: cors.headers });
  }
  const headers = cors.headers;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "connect_onboard_start", windowSeconds: 60, limit: 10 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const userId = await requireVerifiedUserId(req);
    const input = await readJson<ConnectOnboardStartInput>(req);
    const returnUrl = requireAllowedRedirectUrl(input.return_url, "return_url");
    const refreshUrl = requireAllowedRedirectUrl(input.refresh_url, "refresh_url");

    const accountId = await ensureConnectAccount(userId);
    const link = await stripeRequest<StripeAccountLinkCreate>("POST", "/account_links", {
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    const url = typeof link?.url === "string" ? link.url : null;
    if (!url) throw new Error("Failed to create onboarding link.");

    return jsonResponse({ ok: true, url, account_id: accountId }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
