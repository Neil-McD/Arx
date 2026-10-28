import {
  normalizeCommunityCapabilityRelation,
} from "./communityCapabilityContract.ts";
import {
  normalizeCommunityCapabilitySlug,
  type CommunityMembershipProjection,
} from "./communityCapabilityContextContract.ts";

export const COMMUNITY_READ_SCOPES = ["joined", "discover"] as const;

export type CommunityReadScope = (typeof COMMUNITY_READ_SCOPES)[number];

export type CommunityReadSummary = {
  slug: string;
  name: string;
  one_liner: string | null;
  visibility: "published" | "unlisted";
  entry_policy: "open" | "approval" | "paid_subscription";
  relation: "owner" | "admin" | "moderator" | "member" | "pending" | "no_access";
};

export type CommunityReadDetail = CommunityReadSummary & {
  about: string | null;
  is_entitled: boolean;
  capabilities: {
    can_view: boolean;
    can_enter_community: boolean;
    can_read_chat: boolean;
    can_post_chat: boolean;
    can_post_message: boolean;
    can_manage_resources: boolean;
    can_moderate_content: boolean;
    can_manage_members: boolean;
    can_review_join_requests: boolean;
    can_manage_pricing: boolean;
    can_manage_branding: boolean;
    can_manage_publishing: boolean;
    can_manage_payouts: boolean;
  };
};

export type PublicDiscoverCommunityProjection = {
  slug?: unknown;
  name?: unknown;
  one_liner?: unknown;
  visibility?: unknown;
  entry_policy?: unknown;
};

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeEntryPolicy(
  value: unknown,
): "open" | "approval" | "paid_subscription" {
  const normalized = boundedString(value, 40)?.toLowerCase();
  if (normalized === "paid_subscription") return "paid_subscription";
  if (normalized === "approval") return "approval";
  return "open";
}

function normalizeMembershipRelation(
  value: unknown,
): CommunityReadSummary["relation"] {
  const relation = normalizeCommunityCapabilityRelation(value);
  return relation === "owner" ||
    relation === "admin" ||
    relation === "moderator" ||
    relation === "member"
    ? relation
    : "member";
}

export function normalizeCommunityReadScope(value: unknown): CommunityReadScope | null {
  if (value === undefined || value === null || value === "") return "joined";
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "joined" || normalized === "discover" ? normalized : null;
}

export function projectCommunityMembershipReadSummary(
  row: CommunityMembershipProjection,
): CommunityReadSummary | null {
  const slug = normalizeCommunityCapabilitySlug(row.communities?.slug);
  if (!slug) return null;
  return {
    slug,
    name: boundedString(row.communities?.name, 180) ?? "Community",
    one_liner: boundedString(row.communities?.one_liner, 280),
    visibility:
      boundedString(row.communities?.visibility, 40)?.toLowerCase() === "published"
        ? "published"
        : "unlisted",
    entry_policy: normalizeEntryPolicy(row.communities?.entry_policy),
    relation: normalizeMembershipRelation(row.role),
  };
}

export function projectPublicDiscoverCommunityReadSummary(args: {
  community: PublicDiscoverCommunityProjection;
  accessibleSummary?: CommunityReadSummary | null;
}): CommunityReadSummary | null {
  const slug = normalizeCommunityCapabilitySlug(args.community.slug);
  if (!slug || String(args.community.visibility ?? "").trim().toLowerCase() !== "published") {
    return null;
  }
  return {
    slug,
    name: boundedString(args.community.name, 180) ?? "Community",
    one_liner: boundedString(args.community.one_liner, 280),
    visibility: "published",
    entry_policy: normalizeEntryPolicy(args.community.entry_policy),
    relation: args.accessibleSummary?.relation ?? "no_access",
  };
}
