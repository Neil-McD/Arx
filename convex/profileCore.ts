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

export async function readCanonicalUserIdentityProjection(
  ctx: any,
  userId: any,
): Promise<{ displayName: string | null; handle: string | null; timezone: string | null } | null> {
  const user = (await ctx.db.get(userId)) as {
    displayName?: string;
    handle?: string;
    normalizedHandle?: string;
  } | null;
  if (!user) return null;
  let detail: { displayName?: string; timezone?: string } | null = null;
  try {
    detail = await getUniqueUserProfileDetailByUserId(ctx, userId);
  } catch {
    // Display enrichment is non-authoritative. Corrupt duplicate detail rows
    // must not make the durable user identity unreadable.
  }
  const displayName = String(detail?.displayName ?? user.displayName ?? "").trim();
  const handle = String(user.normalizedHandle ?? user.handle ?? "").trim();
  const timezone = String(detail?.timezone ?? "").trim();
  return {
    displayName: displayName || null,
    handle: handle || null,
    timezone: timezone || null,
  };
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
