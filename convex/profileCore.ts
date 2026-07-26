export async function getUniqueUserProfileDetailByUserId<TRow = any>(
  ctx: any,
  userId: any,
): Promise<TRow | null> {
  const rows = (await ctx.db
    .query("userProfileDetails")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(2)) as TRow[];
  if (rows.length > 1) {
    throw new Error("user_profile_detail_ambiguous");
  }
  return rows[0] ?? null;
}
