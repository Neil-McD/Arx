import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { stripeRequest } from "../_shared/stripe.ts";

type ConnectOnboardStartInput = {
  return_url: string;
  refresh_url: string;
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

type AuthAdminUser = { email?: string | null };

async function loadUserEmail(userId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "GET" });
  if (!res.ok) return null;
  const data = (await res.json()) as AuthAdminUser;
  const email = String(data?.email ?? "").trim();
  return email ? email : null;
}

type StripeAccountCreate = { id: string };
type StripeAccountLinkCreate = { url: string | null };

async function ensureConnectAccount(userId: string): Promise<string> {
  const existing = await loadBuilderAccount(userId);
  const current = String(existing?.stripe_connected_account_id ?? "").trim();
  if (current) return current;

  const email = await loadUserEmail(userId);
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
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "connect_onboard_start", windowSeconds: 60, limit: 10 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const token = getBearerToken(req);
    const userId = getVerifiedJwtSub(token);
    const input = await readJson<ConnectOnboardStartInput>(req);
    const returnUrl = String(input.return_url ?? "").trim();
    const refreshUrl = String(input.refresh_url ?? "").trim();
    if (!returnUrl) throw new Error("return_url is required");
    if (!refreshUrl) throw new Error("refresh_url is required");

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

