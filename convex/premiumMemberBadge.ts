export type PublicPremiumMemberBadge = {
  kind: "polynet_premium";
  label: "Premium";
};

type EntitlementRow = {
  tier?: unknown;
  startsAt?: number;
  endsAt?: number;
};

function isActiveWindow(nowMs: number, startsAt: unknown, endsAt?: unknown): boolean {
  const start = Number(startsAt ?? 0);
  if (!Number.isFinite(start) || start > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

export async function resolvePublicPremiumMemberBadgeForUserId(
  ctx: any,
  userId: any,
  nowMs: number = Date.now(),
): Promise<PublicPremiumMemberBadge | null> {
  if (!userId) return null;
  const rows = (await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as EntitlementRow[];
  const activeRows = rows
    .filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
    .sort((a, b) => Number(b.startsAt ?? 0) - Number(a.startsAt ?? 0));
  return String(activeRows[0]?.tier ?? "free").trim().toLowerCase() === "architect"
    ? { kind: "polynet_premium", label: "Premium" }
    : null;
}
