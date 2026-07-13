import { api, internal } from "./_generated/api";
import {
  normalizeCommunityReadScope,
  projectCommunityMembershipReadSummary,
  projectPublicDiscoverCommunityReadSummary,
  projectResolvedCommunityReadDetail,
  type CommunityReadDetail,
  type CommunityReadScope,
  type CommunityReadSummary,
  type PublicDiscoverCommunityProjection,
} from "../shared/communityReadContract.ts";
import type { ResolvedCommunityCapabilityContext } from "../shared/communityCapabilityContextContract.ts";
import { listAccessibleCommunityMemberships } from "./communityCapabilityContext";

export const COMMUNITY_READ_LIST_LIMIT = 60;

export async function listCommunityReadSummaries(args: {
  ctx: any;
  authSubject: string;
  scope?: unknown;
}): Promise<
  | { ok: true; scope: CommunityReadScope; communities: CommunityReadSummary[] }
  | { ok: false; code: "invalid_community_scope" }
> {
  const scope = normalizeCommunityReadScope(args.scope);
  if (!scope) return { ok: false, code: "invalid_community_scope" };

  const membershipRows = await listAccessibleCommunityMemberships(
    args.ctx,
    args.authSubject,
  );
  const accessible = membershipRows
    .map(projectCommunityMembershipReadSummary)
    .filter((row): row is CommunityReadSummary => Boolean(row));
  if (scope === "joined") {
    return { ok: true, scope, communities: accessible.slice(0, COMMUNITY_READ_LIST_LIMIT) };
  }

  const publicResult = (await args.ctx.runQuery(
    api.communityPublic.listPublicDiscoverCommunities as any,
    { limit: COMMUNITY_READ_LIST_LIMIT },
  )) as { communities?: PublicDiscoverCommunityProjection[] } | null;
  const accessibleBySlug = new Map(accessible.map((row) => [row.slug, row]));
  const communities = (Array.isArray(publicResult?.communities)
    ? publicResult.communities
    : []
  )
    .map((community) =>
      projectPublicDiscoverCommunityReadSummary({
        community,
        accessibleSummary: accessibleBySlug.get(String(community.slug ?? "").trim().toLowerCase()),
      }),
    )
    .filter((row): row is CommunityReadSummary => Boolean(row))
    .slice(0, COMMUNITY_READ_LIST_LIMIT);
  return { ok: true, scope, communities };
}

export async function resolveAccessibleCommunityReadDetail(args: {
  ctx: any;
  authSubject: string;
  communitySlug: string;
}): Promise<
  | { ok: true; community: CommunityReadDetail; context: ResolvedCommunityCapabilityContext }
  | { ok: false; code: string }
> {
  const resolved = (await args.ctx.runQuery(
    internal.communityCapabilityContext.resolveCommunityCapabilityContextInternal as any,
    {
      authSubject: args.authSubject,
      communitySlug: args.communitySlug,
    },
  )) as
    | { ok: true; context: ResolvedCommunityCapabilityContext }
    | { ok: false; code: string };
  if (!resolved.ok) return resolved;
  const community = projectResolvedCommunityReadDetail(resolved.context);
  if (!community) return { ok: false, code: "community_not_accessible" };
  return { ok: true, community, context: resolved.context };
}
