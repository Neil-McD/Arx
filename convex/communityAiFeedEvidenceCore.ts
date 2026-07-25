function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export type CommunityAiFeedEvidenceRow = {
  _id: any;
  communityId: any;
  authorType: "agent";
  authorUserId?: any;
  agentKey?: string;
  authorLabel: string;
  type: "observation" | "recommendation" | "action";
  title?: string;
  body: string;
  evidence?: string[];
  whyNow?: string;
  status: "live" | "hidden";
  createdAt: number;
  updatedAt: number;
};

/**
 * Resolve canonical member-readable AI Feed truth without applying viewer
 * authority. Derived archive or source-trace rows can nominate this id, but
 * only a live post in the requested community is admissible evidence.
 */
export async function resolveCommunityAiFeedEvidenceSource(args: {
  ctx: { db: any };
  communityId: any;
  postId: unknown;
}): Promise<CommunityAiFeedEvidenceRow | null> {
  const postId = args.ctx.db.normalizeId(
    "communityAiFeedPosts" as any,
    normalizeIdValue(args.postId),
  );
  if (!postId) return null;
  const post = (await args.ctx.db.get(postId)) as CommunityAiFeedEvidenceRow | null;
  if (
    !post ||
    post.status !== "live" ||
    normalizeIdValue(post.communityId) !== normalizeIdValue(args.communityId)
  ) {
    return null;
  }
  return post;
}
