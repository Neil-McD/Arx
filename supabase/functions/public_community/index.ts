import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";

type PublicFunnelRow = {
  community_id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  free_join_requires_approval: boolean;
  join_mode: string;
  active_plans: unknown;
  created_at: string;
  updated_at: string;
};

type PublicCommunity = {
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  free_join_requires_approval: boolean;
  join_mode: "join_free" | "request_access" | "checkout";
  created_at: string;
  updated_at: string;
};

type PublicPlan = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
};

type JoinMode = "join_free" | "request_access" | "checkout";

function resolveJoinMode(opts: {
  visibility: string | null | undefined;
  hasPaidPlans: boolean;
  freeJoinRequiresApproval: boolean;
}): JoinMode {
  if (opts.hasPaidPlans) return "checkout";
  const visibility = String(opts.visibility ?? "").trim().toLowerCase();
  if (visibility === "private") return "request_access";
  if (visibility === "public" || visibility === "unlisted") {
    return opts.freeJoinRequiresApproval ? "request_access" : "join_free";
  }
  return "request_access";
}

function sanitizeBillingPeriod(value: unknown): "monthly" | "yearly" | null {
  const billingPeriod = String(value ?? "")
    .trim()
    .toLowerCase();
  if (billingPeriod === "monthly" || billingPeriod === "yearly") return billingPeriod;
  return null;
}

function toPublicPlan(raw: unknown): PublicPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const billingPeriod = sanitizeBillingPeriod(row.billing_period);
  if (!billingPeriod) return null;
  const name = String(row.name ?? "").trim();
  const currency = String(row.currency ?? "").trim();
  const amountBaseUnits = String(row.amount_base_units ?? "").trim();
  const currencyDecimals = Number(row.currency_decimals);
  if (!name || !currency || !amountBaseUnits || !Number.isFinite(currencyDecimals)) return null;
  return {
    name,
    description: typeof row.description === "string" ? row.description : null,
    amount_base_units: amountBaseUnits,
    currency,
    currency_decimals: currencyDecimals,
    billing_period: billingPeriod,
  };
}

function parseActivePlans(raw: unknown): PublicPlan[] {
  if (!Array.isArray(raw)) return [];
  const plans: PublicPlan[] = [];
  for (const item of raw) {
    const plan = toPublicPlan(item);
    if (!plan) continue;
    plans.push(plan);
  }
  plans.sort((a, b) => {
    const ar = a.billing_period === "monthly" ? 0 : 1;
    const br = b.billing_period === "monthly" ? 0 : 1;
    return ar - br;
  });
  return plans;
}

function resolveJoinModeFromRow(row: PublicFunnelRow, activePlans: PublicPlan[]): JoinMode {
  const mode = String(row.join_mode ?? "")
    .trim()
    .toLowerCase();
  if (mode === "join_free" || mode === "request_access" || mode === "checkout") {
    return mode;
  }
  return resolveJoinMode({
    visibility: row.visibility,
    hasPaidPlans: activePlans.length > 0,
    freeJoinRequiresApproval: Boolean(row.free_join_requires_approval),
  });
}

function normalizeSlug(raw: string | null): string {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed) throw new Error("slug is required");
  if (trimmed.length > 128) throw new Error("slug too long");
  return trimmed;
}

async function loadPublicFunnelBySlug(slug: string): Promise<PublicFunnelRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/rpc/get_public_community_funnel_by_slug`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_community_slug: slug }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PublicFunnelRow[];
  const row = rows[0];
  if (!row) throw new Error("community_not_found");
  return row;
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
    const funnel = await loadPublicFunnelBySlug(slug);
    const activePlans = parseActivePlans(funnel.active_plans);
    const preferred =
      activePlans.find((plan) => plan.billing_period === "monthly") ??
      activePlans.find((plan) => plan.billing_period === "yearly") ??
      null;

    const publicCommunity: PublicCommunity = {
      slug: funnel.slug,
      name: funnel.name,
      description: funnel.description ?? null,
      avatar_url: funnel.avatar_url ?? null,
      banner_url: funnel.banner_url ?? null,
      visibility: funnel.visibility,
      free_join_requires_approval: Boolean(funnel.free_join_requires_approval),
      join_mode: resolveJoinModeFromRow(funnel, activePlans),
      created_at: funnel.created_at,
      updated_at: funnel.updated_at,
    };
    return jsonResponse(
      { ok: true, community: publicCommunity, active_plan: preferred, active_plans: activePlans },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "community_not_found" ? 404 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
