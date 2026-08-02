type OperatorRoleRow = {
  role?: unknown;
  active?: unknown;
};

export async function hasPlatformOwnerComplimentaryAccess(
  ctx: any,
  userId: any,
): Promise<boolean> {
  const rows = (await ctx.db
    .query("operatorRoles" as any)
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as OperatorRoleRow[];
  const activeRows = rows.filter((row) => row.active === true);
  return activeRows.length === 1 && activeRows[0]?.role === "owner";
}
