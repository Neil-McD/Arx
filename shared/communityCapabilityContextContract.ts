import {
  communityAccessIsOpen,
  deriveCommunityCapabilityAuthority,
  type CommunityCapabilityAuthority,
} from "./communityCapabilityContract.ts";
import type { CommunityAccess } from "./communityTypes.ts";

export type CommunityMembershipProjection = {
  community_id: string;
  role: string;
  communities: {
    slug?: string | null;
    name?: string | null;
    one_liner?: string | null;
    about?: string | null;
    visibility?: string | null;
    entry_policy?: string | null;
  };
};

export type ResolvedCommunityCapabilityContext = {
  communityId: string;
  communitySlug: string;
  communityUpdatedAt: number;
  membership: CommunityMembershipProjection;
  access: CommunityAccess;
  authority: CommunityCapabilityAuthority;
};

export type CommunityCapabilityContextErrorCode =
  | "invalid_community_slug"
  | "community_not_accessible"
  | "community_access_unavailable"
  | "community_access_closed";

export type CommunityCapabilityCommunityInput = {
  id: string;
  slug: string;
  name: string;
  oneLiner?: string | null;
  about?: string | null;
  visibility: "published" | "unlisted";
  entryPolicy?: "open" | "approval" | "paid_subscription" | null;
  updatedAt: number;
};

export type CommunityCapabilityMembershipInput = {
  communityId: string;
  role: string;
} | null;

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function normalizeCommunityCapabilitySlug(value: unknown): string | null {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9-]{3,64}$/.test(slug) ? slug : null;
}

export function buildResolvedCommunityCapabilityContext(args: {
  communitySlug: string;
  community: CommunityCapabilityCommunityInput;
  membership: CommunityCapabilityMembershipInput;
  access: CommunityAccess;
}):
  | { ok: true; context: ResolvedCommunityCapabilityContext }
  | { ok: false; code: CommunityCapabilityContextErrorCode } {
  const communitySlug = normalizeCommunityCapabilitySlug(args.communitySlug);
  if (!communitySlug) return { ok: false, code: "invalid_community_slug" };
  if (normalizeCommunityCapabilitySlug(args.community.slug) !== communitySlug) {
    return { ok: false, code: "community_not_accessible" };
  }

  if (
    args.access.community_id !== args.community.id ||
    (args.membership && args.membership.communityId !== args.community.id)
  ) {
    return { ok: false, code: "community_access_unavailable" };
  }
  if (!Number.isFinite(args.community.updatedAt) || args.community.updatedAt < 0) {
    return { ok: false, code: "community_access_unavailable" };
  }
  if (!communityAccessIsOpen(args.access)) {
    return { ok: false, code: "community_access_closed" };
  }

  const relation = args.access.relation;
  const role =
    relation === "owner" ||
    relation === "admin" ||
    relation === "moderator" ||
    relation === "member"
      ? relation
      : boundedString(args.membership?.role, 32) ?? "member";
  const membership: CommunityMembershipProjection = {
    community_id: args.community.id,
    role,
    communities: {
      slug: communitySlug,
      name: boundedString(args.community.name, 180),
      one_liner: boundedString(args.community.oneLiner, 280),
      about: boundedString(args.community.about, 8000),
      visibility: args.community.visibility,
      entry_policy:
        args.community.entryPolicy === "open" ||
        args.community.entryPolicy === "paid_subscription"
          ? args.community.entryPolicy
          : "approval",
    },
  };

  return {
    ok: true,
    context: {
      communityId: args.community.id,
      communitySlug,
      communityUpdatedAt: Math.floor(args.community.updatedAt),
      membership,
      access: args.access,
      authority: deriveCommunityCapabilityAuthority(args.access),
    },
  };
}
