import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { handleCorsPreflightAndMethod, jsonResponse, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { enforceEdgeRateLimit } from "../_shared/rate_limit.ts";
import { toCanonicalCommunityVisibility } from "../_shared/community_visibility.ts";

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
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
};

type PublicDiscoverCommunity = {
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  active_plan: PublicPlan | null;
};

function clampLimit(raw: string | null): number {
  const parsed = raw ? Number(raw) : NaN;
  // MVP default: keep the first paint snappy by not returning a huge list.
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(200, Math.max(1, Math.trunc(parsed)));
}

function normalizeQuery(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) return trimmed.slice(0, 64);
  return trimmed;
}

function buildSearchOrClause(query: string): string {
  const needle = `*${query}*`;
  return `(name.ilike.${needle},slug.ilike.${needle},description.ilike.${needle})`;
}

async function loadCommunities(params: { limit: number; q: string | null }): Promise<CommunityRow[]> {
  const base =
    `/rest/v1/communities?select=id,slug,name,description,avatar_url,banner_url,visibility,created_at,updated_at` +
    `&visibility=in.(published,public)&order=updated_at.desc&limit=${params.limit}`;
  const endpoint = params.q ? `${base}&or=${encodeURIComponent(buildSearchOrClause(params.q))}` : base;
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
      `&is_active=eq.true&visibility=in.(published,public,unlisted)` +
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
  const headers = withCors(
    {
      // Discover is public data; allow short caching for fast loads.
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      "Referrer-Policy": "no-referrer",
      "Vary": "Origin",
    },
    req,
  );
  const methodResponse = handleCorsPreflightAndMethod(req, headers, "GET");
  if (methodResponse) return methodResponse;

  try {
    const rateLimitResponse = await enforceEdgeRateLimit({
      req,
      key: "public_discover",
      windowSeconds: 60,
      limit: 120,
      headers,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(req.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const q = normalizeQuery(url.searchParams.get("q"));

    const communities = await loadCommunities({ limit, q });
    const planByCommunityId = await loadActivePlans(communities.map((c) => c.id));
    const enriched: PublicDiscoverCommunity[] = communities.map((community) => ({
      slug: community.slug,
      name: community.name,
      description: community.description ?? null,
      avatar_url: community.avatar_url ?? null,
      banner_url: community.banner_url ?? null,
      visibility: toCanonicalCommunityVisibility(community.visibility, "unlisted"),
      created_at: community.created_at,
      updated_at: community.updated_at,
      active_plan: planByCommunityId[community.id] ?? null,
    }));

    return jsonResponse({ ok: true, communities: enriched }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
