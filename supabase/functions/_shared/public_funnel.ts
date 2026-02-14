import { supabaseAdminFetch } from "./supabase_admin.ts";
import { toCanonicalCommunityVisibility } from "./community_visibility.ts";

export type PublicFunnelRow = {
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

export type PublicCommunitySummary = {
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  free_join_requires_approval: boolean;
  created_at: string;
  updated_at: string;
};

export function sanitizePublicSlug(raw: unknown, field = "community_slug"): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) throw new Error(`${field} is required`);
  if (value.length > 128) throw new Error(`${field} too long`);
  return value;
}

export async function loadPublicFunnelBySlug(slug: string): Promise<PublicFunnelRow> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/get_public_community_funnel_by_slug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_community_slug: slug }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as PublicFunnelRow[];
  const row = rows[0] ?? null;
  if (!row) throw new Error("community_not_found");
  return row;
}

export function toPublicCommunitySummary(row: PublicFunnelRow): PublicCommunitySummary {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    avatar_url: row.avatar_url ?? null,
    banner_url: row.banner_url ?? null,
    visibility: toCanonicalCommunityVisibility(row.visibility, "unlisted"),
    free_join_requires_approval: Boolean(row.free_join_requires_approval),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
