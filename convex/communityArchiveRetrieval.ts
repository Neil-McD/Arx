import { internal } from "./_generated/api";

async function resolveTrustedSearchUserId(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const authSubject = String(args.authSubject ?? "").trim();
  if (!authSubject) {
    if (args.userId) return args.userId;
    throw new Error("auth_subject_required");
  }
  const actor = (await args.ctx.runQuery(
    (internal as any).authActor.resolveAuthenticatedActorByTrustedSubjectInternal,
    {
      authSubject,
      ...(args.userId ? { userId: args.userId } : null),
    },
  )) as { dbUserId?: unknown } | null;
  const resolvedUserId = actor?.dbUserId;
  if (!resolvedUserId) throw new Error("authenticated_user_required");
  return resolvedUserId;
}

/**
 * Compatibility wrapper for the broad community_search tool. Canonical source
 * tables now own retrieval; archive fields remain empty until the MCP wire
 * contract is simplified in the archive-deletion slice.
 */
export async function searchCommunityKnowledge(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
  query: string;
}): Promise<unknown> {
  const userId = await resolveTrustedSearchUserId({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const recent: any = await args.ctx.runQuery(
    (internal as any).communityRecentContext.readCommunityRecentContextInternal,
    {
      userId,
      communityId: args.communityId,
      query: args.query,
    },
  );
  return {
    ...recent,
    archive_context: [],
    archive_source_counts: { interaction: 0, ai_feed: 0, resource: 0 },
    diagnostics: {
      ...(recent?.diagnostics ?? {}),
      retrieval_version: "canonical_recent_v1",
    },
  };
}
