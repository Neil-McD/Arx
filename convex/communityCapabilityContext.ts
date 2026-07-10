import { api } from "./_generated/api";
import {
  communityAccessIsOpen,
  deriveCommunityCapabilityAuthority,
  type CommunityCapabilityAuthority,
} from "../shared/communityCapabilityContract";
import { normalizeSlug } from "./communityCore";

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
  membership: CommunityMembershipProjection;
  access: Record<string, unknown>;
  authority: CommunityCapabilityAuthority;
};

export type CommunityCapabilityContextErrorCode =
  | "invalid_community_slug"
  | "community_not_accessible"
  | "community_access_unavailable"
  | "community_access_closed";

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function listAccessibleCommunityMemberships(
  ctx: any,
  authSubject: string,
): Promise<CommunityMembershipProjection[]> {
  const rows = (await ctx.runQuery(api.community.listCommunityMemberships as any, {
    authSubject,
    selectMode: "full",
  })) as CommunityMembershipProjection[];
  return rows.filter((row) => boundedString(row.communities?.slug, 160));
}

export function findCommunityMembershipBySlug(
  rows: CommunityMembershipProjection[],
  communitySlug: string,
): CommunityMembershipProjection | null {
  const normalized = normalizeSlug(communitySlug);
  if (!normalized) return null;
  return rows.find((row) => normalizeSlug(row.communities?.slug) === normalized) ?? null;
}

export async function resolveCommunityCapabilityContext(args: {
  ctx: any;
  authSubject: string;
  communitySlug: string;
}): Promise<
  | { ok: true; context: ResolvedCommunityCapabilityContext }
  | { ok: false; code: CommunityCapabilityContextErrorCode }
> {
  const communitySlug = normalizeSlug(args.communitySlug);
  if (!communitySlug) return { ok: false, code: "invalid_community_slug" };

  const rows = await listAccessibleCommunityMemberships(args.ctx, args.authSubject);
  const membership = findCommunityMembershipBySlug(rows, communitySlug);
  if (!membership) return { ok: false, code: "community_not_accessible" };

  const access = (await args.ctx.runQuery(api.community.getMyCommunityAccessBySlug as any, {
    authSubject: args.authSubject,
    communitySlug,
  })) as Record<string, unknown> | null;
  if (!access) return { ok: false, code: "community_access_unavailable" };
  if (!communityAccessIsOpen(access)) {
    return { ok: false, code: "community_access_closed" };
  }

  return {
    ok: true,
    context: {
      communityId: membership.community_id,
      communitySlug,
      membership,
      access,
      authority: deriveCommunityCapabilityAuthority(access),
    },
  };
}
