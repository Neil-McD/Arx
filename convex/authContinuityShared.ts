type CanonicalTier = "free" | "builder" | "architect";

type UserEntitlementRow = {
  tier: CanonicalTier;
  startsAt: number;
  endsAt?: number;
};

type CommunityRow = {
  _id: any;
  slug: string;
  name: string;
  visibility: "published" | "unlisted";
  entryPolicy: "open" | "approval" | "paid_subscription";
};

type CommunityMembershipRow = {
  _id: any;
  communityId: any;
  role: "admin" | "moderator" | "member";
  active?: boolean;
  revokedAt?: number;
};

export type AuthContinuityAccountSnapshot = {
  userId: string;
  canonicalTier: CanonicalTier;
  threadCount: number;
  projectCount: number;
  providerConnectionCount: number;
  communityOwnershipCount: number;
  membershipCount: number;
  workspaceCreditsTotal: number;
  ownedCommunities: Array<{
    communityId: string;
    slug: string;
    name: string;
    visibility: "published" | "unlisted";
    entryPolicy: "open" | "approval" | "paid_subscription";
  }>;
  memberships: Array<{
    membershipId: string;
    communityId: string;
    communitySlug: string | null;
    communityName: string | null;
    role: "admin" | "moderator" | "member";
    active: boolean;
    revokedAt: number | null;
  }>;
  recentAuthSessions: Array<{
    sessionId: string;
    provider: string;
    email: string | null;
    createdAt: number;
    updatedAt: number;
    revokedAt: number | null;
    lastRefreshAt: number | null;
  }>;
};

function normalizeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  const normalized = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "builder") return "builder";
  if (normalized === "architect" || normalized === "pro") return "architect";
  return "free";
}

export async function readCanonicalTierByUserId(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<CanonicalTier> {
  const rows = (await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as UserEntitlementRow[];
  const activeRows = rows
    .filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
    .sort((a, b) => b.startsAt - a.startsAt);
  return normalizeCanonicalTier(activeRows[0]?.tier ?? "free");
}

export async function buildAuthContinuityAccountSnapshot(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<AuthContinuityAccountSnapshot> {
  const [
    threads,
    projects,
    providerConnections,
    ownedCommunities,
    memberships,
    workspaceCreditBalances,
  ] = await Promise.all([
    ctx.db.query("threads").withIndex("by_owner", (q: any) => q.eq("ownerId", userId)).collect(),
    ctx.db.query("cloudProjects").withIndex("by_owner", (q: any) => q.eq("ownerId", userId)).collect(),
    ctx.db
      .query("userProviderConnections")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
    ctx.db.query("communities").withIndex("by_owner", (q: any) => q.eq("ownerId", userId)).collect(),
    ctx.db
      .query("communityMemberships")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
  ]);

  const canonicalTier = await readCanonicalTierByUserId(ctx, userId, nowMs);
  const workspaceCreditsTotal = (workspaceCreditBalances as Array<{
    includedCreditsBalance?: number;
    purchasedCreditsBalance?: number;
  }>).reduce((total, row) => {
    return total + Number(row.includedCreditsBalance ?? 0) + Number(row.purchasedCreditsBalance ?? 0);
  }, 0);

  const membershipRows = memberships as CommunityMembershipRow[];
  const membershipCommunityIds = Array.from(
    new Set(membershipRows.map((row) => normalizeId(row.communityId)).filter(Boolean)),
  );
  const membershipCommunityDocs = await Promise.all(
    membershipCommunityIds.map(async (communityId) => {
      const row = await ctx.db.get(communityId as any);
      return row ? ([communityId, row as CommunityRow] as const) : null;
    }),
  );
  const communitiesById = new Map<string, CommunityRow>();
  for (const entry of membershipCommunityDocs) {
    if (!entry) continue;
    communitiesById.set(entry[0], entry[1]);
  }

  return {
    userId: normalizeId(userId),
    canonicalTier,
    threadCount: Array.isArray(threads) ? threads.length : 0,
    projectCount: Array.isArray(projects) ? projects.length : 0,
    providerConnectionCount: Array.isArray(providerConnections) ? providerConnections.length : 0,
    communityOwnershipCount: Array.isArray(ownedCommunities) ? ownedCommunities.length : 0,
    membershipCount: membershipRows.length,
    workspaceCreditsTotal,
    ownedCommunities: (ownedCommunities as CommunityRow[]).map((community) => ({
      communityId: normalizeId(community._id),
      slug: community.slug,
      name: community.name,
      visibility: community.visibility,
      entryPolicy: community.entryPolicy,
    })),
    memberships: membershipRows.map((membership) => {
      const community = communitiesById.get(normalizeId(membership.communityId)) ?? null;
      return {
        membershipId: normalizeId(membership._id),
        communityId: normalizeId(membership.communityId),
        communitySlug: community?.slug ?? null,
        communityName: community?.name ?? null,
        role: membership.role,
        active: membership.active !== false && typeof membership.revokedAt !== "number",
        revokedAt: typeof membership.revokedAt === "number" ? membership.revokedAt : null,
      };
    }),
    recentAuthSessions: [],
  };
}
