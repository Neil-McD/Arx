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
  owner_id: string;
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

function clampLimit(raw: string | null): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(200, Math.max(1, Math.trunc(parsed)));
}

function normalizeQuery(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) return trimmed.slice(0, 64);
  return trimmed;
}

async function loadCommunities(params: { limit: number; q: string | null }): Promise<CommunityRow[]> {
  const base =
    `/rest/v1/communities?select=id,slug,name,owner_id,description,avatar_url,banner_url,visibility,created_at,updated_at` +
    `&visibility=eq.public&order=updated_at.desc&limit=${params.limit}`;
  const endpoint = params.q ? `${base}&name=ilike.*${encodeURIComponent(params.q)}*` : base;
  const res = await supabaseAdminFetch(endpoint, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CommunityRow[];
}

async function loadActivePlans(communityIds: string[]): Promise<Record<string, PublicPlan>> {
  if (communityIds.length === 0) return {};
  const list = communityIds.map((id) => `"${id}"`).join(",");
  const res = await supabaseAdminFetch(
    `/rest/v1/plans?select=id,community_id,name,description,amount_base_units,currency,currency_decimals,billing_period,visibility,is_active` +
      `&community_id=in.(${encodeURIComponent(list)})` +
      `&is_active=eq.true&visibility=in.(public,unlisted)` +
      `&billing_period=in.(monthly,yearly)`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PlanRow[];
  const out: Record<string, PublicPlan> = {};
  for (const row of rows) {
    const cid = String(row.community_id ?? "").trim();
    if (!cid) continue;
    const next: PublicPlan = {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      amount_base_units: String(row.amount_base_units ?? "0"),
      currency: row.currency,
      currency_decimals: row.currency_decimals,
      billing_period: row.billing_period,
    };
    const current = out[cid];
    if (!current) {
      out[cid] = next;
      continue;
    }
    if (current.billing_period !== "monthly" && next.billing_period === "monthly") {
      out[cid] = next;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "public_discover", windowSeconds: 60, limit: 120 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const url = new URL(req.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const q = normalizeQuery(url.searchParams.get("q"));

    const communities = await loadCommunities({ limit, q });
    const planByCommunityId = await loadActivePlans(communities.map((c) => c.id));
    const enriched = communities.map((community) => ({
      ...community,
      active_plan: planByCommunityId[community.id] ?? null,
    }));

    return jsonResponse({ ok: true, communities: enriched }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
