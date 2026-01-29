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

type AuthUser = {
  id: string;
  email?: string | null;
};

type EntitlementRow = {
  community_id: string;
  starts_at: string;
  ends_at: string | null;
  communities: CommunityRow | null;
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
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(200, Math.max(1, Math.trunc(parsed)));
}

function normalizeQuery(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) return trimmed.slice(0, 64);
  return trimmed;
}

function extractBearerToken(header: string | null): string | null {
  const value = (header ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (!lower.startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token ? token : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) return null;
  try {
    const res = await supabaseAdminFetch(`/auth/v1/user`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string; email?: string | null };
    const id = String(json?.id ?? "").trim();
    if (!id || !isUuid(id)) return null;
    return { id, email: json?.email ?? null };
  } catch {
    return null;
  }
}

async function loadCommunities(params: { limit: number; q: string | null }): Promise<CommunityRow[]> {
  const base =
    `/rest/v1/communities?select=id,slug,name,description,avatar_url,banner_url,visibility,created_at,updated_at` +
    `&visibility=in.(public,private)&order=updated_at.desc&limit=${params.limit}`;
  const endpoint = params.q ? `${base}&name=ilike.*${encodeURIComponent(params.q)}*` : base;
  const res = await supabaseAdminFetch(endpoint, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CommunityRow[];
}

async function loadUserCommunities(userId: string): Promise<CommunityRow[]> {
  if (!isUuid(userId)) return [];
  const select =
    "id,slug,name,description,avatar_url,banner_url,visibility,created_at,updated_at";

  const nowIso = new Date().toISOString();
  const entitlementsRes = await supabaseAdminFetch(
    `/rest/v1/entitlements?select=community_id,starts_at,ends_at,communities(${select})` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&starts_at=lte.${encodeURIComponent(nowIso)}` +
      `&or=${encodeURIComponent(`(ends_at.is.null,ends_at.gt.${nowIso})`)}` +
      `&limit=200`,
    { method: "GET" },
  );
  if (!entitlementsRes.ok) throw new Error(await entitlementsRes.text());
  const entitlementRows = (await entitlementsRes.json()) as EntitlementRow[];
  const entitlementCommunities = entitlementRows
    .map((row) => row.communities)
    .filter((item): item is CommunityRow => Boolean(item));

  const ownedRes = await supabaseAdminFetch(
    `/rest/v1/communities?select=${select}&owner_id=eq.${encodeURIComponent(userId)}&limit=200`,
    { method: "GET" },
  );
  if (!ownedRes.ok) throw new Error(await ownedRes.text());
  const ownedCommunities = (await ownedRes.json()) as CommunityRow[];

  const merged = new Map<string, CommunityRow>();
  for (const community of [...entitlementCommunities, ...ownedCommunities]) {
    const id = String(community?.id ?? "").trim();
    if (!id) continue;
    merged.set(id, community);
  }
  return Array.from(merged.values());
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

    const viewer = await getAuthUser(req);
    const discoverable = await loadCommunities({ limit, q });
    const accessible = viewer ? await loadUserCommunities(viewer.id) : [];

    const merged = new Map<string, CommunityRow>();
    for (const community of discoverable) merged.set(community.id, community);
    for (const community of accessible) merged.set(community.id, community);

    let combined = Array.from(merged.values()).filter((community) => community.visibility !== "unlisted");
    if (q) {
      const needle = q.toLowerCase();
      combined = combined.filter((community) => {
        const haystack = `${community.name ?? ""}\n${community.slug ?? ""}\n${community.description ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      });
    }

    combined.sort((a, b) => {
      const aTime = Date.parse(a.updated_at ?? "") || 0;
      const bTime = Date.parse(b.updated_at ?? "") || 0;
      return bTime - aTime;
    });
    combined = combined.slice(0, limit);

    const planByCommunityId = await loadActivePlans(combined.map((c) => c.id));
    const enriched: PublicDiscoverCommunity[] = combined.map((community) => ({
      slug: community.slug,
      name: community.name,
      description: community.description ?? null,
      avatar_url: community.avatar_url ?? null,
      banner_url: community.banner_url ?? null,
      visibility: community.visibility,
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
