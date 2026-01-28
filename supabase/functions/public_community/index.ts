import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";

type CommunityRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
};

type PlanRow = {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
  visibility: string;
  is_active: boolean;
};

type PublicPlan = {
  id: string;
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
};

function normalizeSlug(raw: string | null): string {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed) throw new Error("slug is required");
  if (trimmed.length > 128) throw new Error("slug too long");
  return trimmed;
}

async function loadCommunityBySlug(slug: string): Promise<CommunityRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/communities?select=id,slug,name,description,avatar_url,banner_url,visibility,created_at,updated_at` +
      `&slug=eq.${encodeURIComponent(slug)}&visibility=in.(public,private,unlisted)&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as CommunityRow[];
  const row = rows[0];
  if (!row) throw new Error("not_found");
  return row;
}

async function loadActivePlans(communityId: string): Promise<PublicPlan[]> {
  const res = await supabaseAdminFetch(
    `/rest/v1/plans?select=id,community_id,name,description,amount_base_units,currency,currency_decimals,billing_period,visibility,is_active` +
      `&community_id=eq.${encodeURIComponent(communityId)}` +
      `&is_active=eq.true&visibility=in.(public,unlisted)` +
      `&billing_period=in.(monthly,yearly)` +
      `&order=billing_period.asc`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PlanRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    amount_base_units: String(row.amount_base_units ?? "0"),
    currency: row.currency,
    currency_decimals: row.currency_decimals,
    billing_period: row.billing_period,
  }));
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "public_community", windowSeconds: 60, limit: 240 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const url = new URL(req.url);
    const slug = normalizeSlug(url.searchParams.get("slug"));
    const community = await loadCommunityBySlug(slug);
    const activePlans = await loadActivePlans(community.id);
    const preferred =
      activePlans.find((plan) => plan.billing_period === "monthly") ??
      activePlans.find((plan) => plan.billing_period === "yearly") ??
      null;
    return jsonResponse(
      { ok: true, community, active_plan: preferred, active_plans: activePlans },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "not_found" ? 404 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
