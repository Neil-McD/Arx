import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  classifyAuthRelinkBucket,
  isAnonymousAuthSubject,
  normalizeAuthRelinkEmail,
  type AuthRelinkBucket,
} from "../shared/authRelinkPolicy";

type Tier = "free" | "builder" | "architect";
type RelinkBucket = AuthRelinkBucket;
type AuditPriority = "critical" | "important" | "low";

type UserRow = {
  _id: any;
  authSubject?: string;
  email?: string;
  normalizedEmail?: string;
  emailVerifiedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type EntitlementRow = {
  userId: any;
  tier: Tier;
  startsAt: number;
  endsAt?: number;
};

type WorkspaceCreditBalanceRow = {
  userId: any;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
};

type CommunitySubscriptionRow = {
  userId: any;
  status: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
};

type ProviderConnectionRow = {
  userId: any;
};

type CountRow = {
  ownerId?: any;
  userId?: any;
};

type UserAuditRow = {
  userId: string;
  authSubject: string | null;
  email: string | null;
  normalizedEmail: string | null;
  emailVerified: boolean;
  emailVerifiedAt: number | null;
  bucket: RelinkBucket;
  priority: AuditPriority;
  reasons: string[];
  activePaidTier: Exclude<Tier, "free"> | null;
  activePaidEntitlementCount: number;
  activeCommunitySubscriptionCount: number;
  workspaceCreditsTotal: number;
  providerConnectionCount: number;
  communityOwnershipCount: number;
  projectCount: number;
  threadCount: number;
  membershipCount: number;
  developerAppCount: number;
  skillPackageCount: number;
};

type DuplicateEmailGroup = {
  normalizedEmail: string;
  userCount: number;
  criticalUserCount: number;
  paidUserCount: number;
  verifiedUserCount: number;
  unverifiedUserCount: number;
  hasMixedVerification: boolean;
  hasMixedPriority: boolean;
  userIds: string[];
  users: Array<{
    userId: string;
    authSubject: string | null;
    email: string | null;
    priority: AuditPriority;
    bucket: RelinkBucket;
    activePaidTier: Exclude<Tier, "free"> | null;
    activeCommunitySubscriptionCount: number;
    workspaceCreditsTotal: number;
    communityOwnershipCount: number;
  }>;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readAuditSecret(): string {
  return readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET");
}

function assertAuditSecret(secret: string): void {
  const configured = readAuditSecret();
  if (!configured || secret !== configured) {
    throw new Error("auth_migration_audit_unauthorized");
  }
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string | null {
  return normalizeAuthRelinkEmail(value);
}

function resolveUserNormalizedEmail(user: UserRow): string | null {
  return normalizeEmail(user.normalizedEmail ?? user.email);
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function incrementCount(map: Map<string, number>, key: unknown): void {
  const normalized = normalizeId(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function buildCountMap(rows: CountRow[], field: "ownerId" | "userId"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) incrementCount(counts, row[field]);
  return counts;
}

function buildWorkspaceCreditTotals(rows: WorkspaceCreditBalanceRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const userId = normalizeId(row.userId);
    if (!userId) continue;
    const total =
      Number(row.includedCreditsBalance ?? 0) + Number(row.purchasedCreditsBalance ?? 0);
    totals.set(userId, total);
  }
  return totals;
}

function buildProviderConnectionCounts(rows: ProviderConnectionRow[]): Map<string, number> {
  return buildCountMap(rows as CountRow[], "userId");
}

function buildActiveSubscriptionCounts(
  rows: CommunitySubscriptionRow[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (
      row.status !== "active" &&
      row.status !== "past_due" &&
      row.status !== "cancel_at_period_end"
    ) {
      continue;
    }
    incrementCount(counts, row.userId);
  }
  return counts;
}

function buildActivePaidEntitlements(
  rows: EntitlementRow[],
  nowMs: number,
): Map<string, { tier: Exclude<Tier, "free"> | null; count: number }> {
  const entitlementsByUser = new Map<string, EntitlementRow[]>();
  for (const row of rows) {
    const userId = normalizeId(row.userId);
    if (!userId) continue;
    const current = entitlementsByUser.get(userId) ?? [];
    current.push(row);
    entitlementsByUser.set(userId, current);
  }
  const result = new Map<string, { tier: Exclude<Tier, "free"> | null; count: number }>();
  for (const [userId, userRows] of entitlementsByUser) {
    const activePaid = userRows
      .filter((row) => row.tier !== "free" && isActiveWindow(nowMs, row.startsAt, row.endsAt))
      .sort((a, b) => b.startsAt - a.startsAt);
    result.set(userId, {
      tier: (activePaid[0]?.tier as Exclude<Tier, "free"> | undefined) ?? null,
      count: activePaid.length,
    });
  }
  return result;
}

function buildAuthenticatedEmailClusters(users: UserRow[]): Map<string, string[]> {
  const clusters = new Map<string, string[]>();
  for (const user of users) {
    const authSubject = normalizeId(user.authSubject);
    if (!authSubject || isAnonymousAuthSubject(authSubject)) continue;
    const normalizedEmail = resolveUserNormalizedEmail(user);
    if (!normalizedEmail) continue;
    const ids = clusters.get(normalizedEmail) ?? [];
    ids.push(normalizeId(user._id));
    clusters.set(normalizedEmail, ids);
  }
  return clusters;
}

function classifyPriority(args: {
  activePaidEntitlementCount: number;
  activeCommunitySubscriptionCount: number;
  workspaceCreditsTotal: number;
  communityOwnershipCount: number;
  providerConnectionCount: number;
  projectCount: number;
  threadCount: number;
  membershipCount: number;
  developerAppCount: number;
  skillPackageCount: number;
}): AuditPriority {
  if (
    args.activePaidEntitlementCount > 0 ||
    args.activeCommunitySubscriptionCount > 0 ||
    args.workspaceCreditsTotal > 0 ||
    args.communityOwnershipCount > 0
  ) {
    return "critical";
  }
  if (
    args.providerConnectionCount > 0 ||
    args.projectCount > 0 ||
    args.threadCount > 0 ||
    args.membershipCount > 0 ||
    args.developerAppCount > 0 ||
    args.skillPackageCount > 0
  ) {
    return "important";
  }
  return "low";
}

function buildReasons(row: {
  bucket: RelinkBucket;
  activePaidTier: Exclude<Tier, "free"> | null;
  activeCommunitySubscriptionCount: number;
  workspaceCreditsTotal: number;
  communityOwnershipCount: number;
  providerConnectionCount: number;
  projectCount: number;
  threadCount: number;
  membershipCount: number;
  developerAppCount: number;
  skillPackageCount: number;
}): string[] {
  const reasons: string[] = [];
  if (row.bucket === "manual_duplicate_email") reasons.push("duplicate_authenticated_email");
  if (row.bucket === "manual_missing_email") reasons.push("missing_email");
  if (row.bucket === "manual_other") reasons.push("missing_auth_subject");
  if (row.activePaidTier) reasons.push(`paid_tier:${row.activePaidTier}`);
  if (row.activeCommunitySubscriptionCount > 0) reasons.push("active_community_subscription");
  if (row.workspaceCreditsTotal > 0) reasons.push("nonzero_workspace_credits");
  if (row.communityOwnershipCount > 0) reasons.push("owns_community");
  if (row.providerConnectionCount > 0) reasons.push("provider_connection");
  if (row.projectCount > 0) reasons.push("owns_project");
  if (row.threadCount > 0) reasons.push("has_threads");
  if (row.membershipCount > 0) reasons.push("community_membership");
  if (row.developerAppCount > 0) reasons.push("owns_developer_app");
  if (row.skillPackageCount > 0) reasons.push("owns_skill_package");
  return reasons;
}

export const runAuthMigrationPreflightAudit = query({
  args: {
    secret: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertAuditSecret(args.secret);

    const nowMs = args.nowMs ?? Date.now();
    const [
      allUsers,
      entitlements,
      workspaceCreditBalances,
      communitySubscriptions,
      providerConnections,
      communities,
      projects,
      memberships,
      threads,
      developerApps,
      skillPackages,
    ] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("userEntitlements").collect(),
      ctx.db.query("workspaceCreditBalances").collect(),
      ctx.db.query("communitySubscriptions").collect(),
      ctx.db.query("userProviderConnections").collect(),
      ctx.db.query("communities").collect(),
      ctx.db.query("cloudProjects").collect(),
      ctx.db.query("communityMemberships").collect(),
      ctx.db.query("threads").collect(),
      ctx.db.query("developerApps").collect(),
      ctx.db.query("skillPackages").collect(),
    ]);

    const users = (allUsers as UserRow[]).filter((user) => {
      const authSubject = normalizeId(user.authSubject);
      return !isAnonymousAuthSubject(authSubject);
    });
    const skippedAnonymousUserCount = (allUsers as UserRow[]).length - users.length;

    const activePaidEntitlements = buildActivePaidEntitlements(
      entitlements as EntitlementRow[],
      nowMs,
    );
    const workspaceCreditTotals = buildWorkspaceCreditTotals(
      workspaceCreditBalances as WorkspaceCreditBalanceRow[],
    );
    const activeSubscriptionCounts = buildActiveSubscriptionCounts(
      communitySubscriptions as CommunitySubscriptionRow[],
    );
    const providerConnectionCounts = buildProviderConnectionCounts(
      providerConnections as ProviderConnectionRow[],
    );
    const communityOwnershipCounts = buildCountMap(communities as CountRow[], "ownerId");
    const projectCounts = buildCountMap(projects as CountRow[], "ownerId");
    const membershipCounts = buildCountMap(memberships as CountRow[], "userId");
    const threadCounts = buildCountMap(threads as CountRow[], "ownerId");
    const developerAppCounts = buildCountMap(developerApps as CountRow[], "ownerId");
    const skillPackageCounts = buildCountMap(skillPackages as CountRow[], "ownerId");
    const authenticatedEmailClusters = buildAuthenticatedEmailClusters(users as UserRow[]);

    const auditedUsers: UserAuditRow[] = users.map((user) => {
      const userId = normalizeId(user._id);
      const authSubject = normalizeId(user.authSubject) || null;
      const normalizedEmail = resolveUserNormalizedEmail(user);
      const emailVerified = typeof user.emailVerifiedAt === "number";
      const entitlement = activePaidEntitlements.get(userId) ?? { tier: null, count: 0 };
      const activeCommunitySubscriptionCount = activeSubscriptionCounts.get(userId) ?? 0;
      const workspaceCreditsTotal = workspaceCreditTotals.get(userId) ?? 0;
      const providerConnectionCount = providerConnectionCounts.get(userId) ?? 0;
      const communityOwnershipCount = communityOwnershipCounts.get(userId) ?? 0;
      const projectCount = projectCounts.get(userId) ?? 0;
      const membershipCount = membershipCounts.get(userId) ?? 0;
      const threadCount = threadCounts.get(userId) ?? 0;
      const developerAppCount = developerAppCounts.get(userId) ?? 0;
      const skillPackageCount = skillPackageCounts.get(userId) ?? 0;
      const authenticatedEmailClusterSize =
        normalizedEmail && authSubject
          ? (authenticatedEmailClusters.get(normalizedEmail)?.length ?? 0)
          : 0;
      const bucket = classifyAuthRelinkBucket({
        authSubject,
        normalizedEmail,
        authenticatedEmailClusterSize,
      });
      const priority = classifyPriority({
        activePaidEntitlementCount: entitlement.count,
        activeCommunitySubscriptionCount,
        workspaceCreditsTotal,
        communityOwnershipCount,
        providerConnectionCount,
        projectCount,
        threadCount,
        membershipCount,
        developerAppCount,
        skillPackageCount,
      });
      const row: UserAuditRow = {
        userId,
        authSubject,
        email: user.email ?? null,
        normalizedEmail,
        emailVerified,
        emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
        bucket,
        priority,
        reasons: [],
        activePaidTier: entitlement.tier,
        activePaidEntitlementCount: entitlement.count,
        activeCommunitySubscriptionCount,
        workspaceCreditsTotal,
        providerConnectionCount,
        communityOwnershipCount,
        projectCount,
        threadCount,
        membershipCount,
        developerAppCount,
        skillPackageCount,
      };
      row.reasons = buildReasons(row);
      return row;
    });

    auditedUsers.sort((a, b) => {
      const priorityRank = { critical: 0, important: 1, low: 2 };
      if (priorityRank[a.priority] !== priorityRank[b.priority]) {
        return priorityRank[a.priority] - priorityRank[b.priority];
      }
      if (a.bucket !== b.bucket) return a.bucket.localeCompare(b.bucket);
      return a.userId.localeCompare(b.userId);
    });

    const riskyUsers = auditedUsers.filter((user) => user.bucket !== "safe_auto_relink");
    const criticalUsers = auditedUsers.filter((user) => user.priority === "critical");
    const criticalManualUsers = criticalUsers.filter(
      (user) => user.bucket !== "safe_auto_relink",
    );
    const criticalSafeUsers = criticalUsers.filter(
      (user) => user.bucket === "safe_auto_relink",
    );

    const duplicateEmailGroups: DuplicateEmailGroup[] = Array.from(
      authenticatedEmailClusters.entries(),
    )
      .filter(([, userIds]) => userIds.length > 1)
      .map(([normalizedEmail, userIds]) => {
        const groupedUsers = userIds
          .map((userId) => auditedUsers.find((user) => user.userId === userId))
          .filter(Boolean) as UserAuditRow[];
        const criticalUserCount = groupedUsers.filter(
          (user) => user.priority === "critical",
        ).length;
        const paidUserCount = groupedUsers.filter((user) => Boolean(user.activePaidTier)).length;
        const verifiedUserCount = groupedUsers.filter((user) => user.emailVerified).length;
        const unverifiedUserCount = groupedUsers.length - verifiedUserCount;
        const prioritySet = new Set(groupedUsers.map((user) => user.priority));
        return {
          normalizedEmail,
          userCount: groupedUsers.length,
          criticalUserCount,
          paidUserCount,
          verifiedUserCount,
          unverifiedUserCount,
          hasMixedVerification: verifiedUserCount > 0 && unverifiedUserCount > 0,
          hasMixedPriority: prioritySet.size > 1,
          userIds: groupedUsers.map((user) => user.userId),
          users: groupedUsers.map((user) => ({
            userId: user.userId,
            authSubject: user.authSubject,
            email: user.email,
            priority: user.priority,
            bucket: user.bucket,
            activePaidTier: user.activePaidTier,
            activeCommunitySubscriptionCount: user.activeCommunitySubscriptionCount,
            workspaceCreditsTotal: user.workspaceCreditsTotal,
            communityOwnershipCount: user.communityOwnershipCount,
          })),
        };
      })
      .sort((a, b) => {
        if (b.criticalUserCount !== a.criticalUserCount) {
          return b.criticalUserCount - a.criticalUserCount;
        }
        if (b.userCount !== a.userCount) return b.userCount - a.userCount;
        return a.normalizedEmail.localeCompare(b.normalizedEmail);
      });

    return {
      generatedAt: nowMs,
      summary: {
        totalUsers: auditedUsers.length,
        skippedAnonymousUserCount,
        safeAutoRelinkCount: auditedUsers.filter((user) => user.bucket === "safe_auto_relink").length,
        manualUserCount: riskyUsers.length,
        manualDuplicateEmailCount: auditedUsers.filter(
          (user) => user.bucket === "manual_duplicate_email",
        ).length,
        manualMissingEmailCount: auditedUsers.filter(
          (user) => user.bucket === "manual_missing_email",
        ).length,
        manualOtherCount: auditedUsers.filter((user) => user.bucket === "manual_other").length,
        criticalUserCount: criticalUsers.length,
        criticalSafeAutoRelinkCount: criticalSafeUsers.length,
        criticalManualUserCount: criticalManualUsers.length,
        importantUserCount: auditedUsers.filter((user) => user.priority === "important").length,
        lowUserCount: auditedUsers.filter((user) => user.priority === "low").length,
        duplicateAuthenticatedEmailGroupCount: duplicateEmailGroups.length,
      },
      criticalManualUsers,
      criticalSafeUsers,
      riskyUsers,
      duplicateEmailGroups,
      users: auditedUsers,
    };
  },
});
