export async function requireLiveCommunityForCognitionWrite(
  ctx: { db: { get: (id: any) => Promise<unknown> } },
  communityId: any,
): Promise<void> {
  const community = await ctx.db.get(communityId);
  if (!community) {
    throw new Error("community_cognition_write_community_not_found");
  }
}
