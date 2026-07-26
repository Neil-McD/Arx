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

export async function getUniqueUserByNormalizedHandle<TRow = any>(
  ctx: any,
  normalizedHandle: string,
): Promise<TRow | null> {
  const rows = (await ctx.db
    .query("users")
    .withIndex("by_normalizedHandle", (q: any) =>
      q.eq("normalizedHandle", normalizedHandle),
    )
    .take(2)) as TRow[];
  if (rows.length > 1) {
    throw new Error("user_handle_ambiguous");
  }
  return rows[0] ?? null;
}
