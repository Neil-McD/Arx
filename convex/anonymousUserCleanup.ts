import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

type IndexedReferenceSpec = {
  table: string;
  index: string;
  field: string;
};

type ScanReferenceSpec = {
  table: string;
  field: string;
};

const INDEXED_USER_REFERENCES: IndexedReferenceSpec[] = [
  { table: "authSessions", index: "by_user", field: "userId" },
  { table: "userEntitlements", index: "by_user", field: "userId" },
  { table: "operatorRoles", index: "by_user", field: "userId" },
  { table: "userStripeConnectAccounts", index: "by_user", field: "userId" },
  { table: "workspaceCreditBalances", index: "by_user", field: "userId" },
  { table: "workspaceComputeCharges", index: "by_user", field: "userId" },
  { table: "workspaceUsageCollections", index: "by_user_createdAt", field: "userId" },
  { table: "creditLedgerEntries", index: "by_user_createdAt", field: "userId" },
  { table: "criticalAuditEvents", index: "by_actor_createdAt", field: "actorUserId" },
  { table: "platformDiagnosticEvents", index: "by_user_createdAt", field: "userId" },
  { table: "checkoutSessions", index: "by_owner", field: "ownerUserId" },
  { table: "purchaseClaims", index: "by_owner", field: "ownerUserId" },
  { table: "userMemorySettings", index: "by_user", field: "userId" },
  { table: "userProviderConnections", index: "by_user", field: "userId" },
  { table: "userProviderAuthStates", index: "by_user_provider", field: "userId" },
  { table: "userProviderDeviceAuthStates", index: "by_user_provider", field: "userId" },
  { table: "userProfileDetails", index: "by_user", field: "userId" },
  { table: "emailPreferences", index: "by_user", field: "userId" },
  { table: "emailOutbox", index: "by_recipientUserId", field: "recipientUserId" },
  { table: "personalMemoryItems", index: "by_user", field: "userId" },
  { table: "communities", index: "by_owner", field: "ownerId" },
  { table: "communityMemberships", index: "by_user", field: "userId" },
  { table: "communityPresence", index: "by_user", field: "userId" },
  { table: "communityJoinRequests", index: "by_user", field: "userId" },
  { table: "communityBlocks", index: "by_user", field: "userId" },
  { table: "communitySubscriptions", index: "by_user", field: "userId" },
  { table: "communityChatMessages", index: "by_sender", field: "senderUserId" },
  { table: "communityMessageReactions", index: "by_user", field: "userId" },
  { table: "communityTypingPresence", index: "by_user", field: "userId" },
  { table: "dmTypingPresence", index: "by_user", field: "userId" },
  { table: "skillPackages", index: "by_owner", field: "ownerUserId" },
  { table: "userPlatformSkillInstalls", index: "by_user", field: "userId" },
  { table: "communityAiFeedReactions", index: "by_actorUser", field: "actorUserId" },
  { table: "communityMemberSettings", index: "by_user", field: "userId" },
  { table: "communityReadCursors", index: "by_user", field: "userId" },
  { table: "communityResourceProgress", index: "by_user", field: "userId" },
  { table: "communityResources", index: "by_createdBy", field: "createdByUserId" },
  { table: "communityResourceModules", index: "by_createdBy", field: "createdByUserId" },
  { table: "communityEvents", index: "by_createdBy", field: "createdByUserId" },
  { table: "memberAgentChannels", index: "by_owner", field: "ownerId" },
  { table: "threads", index: "by_owner", field: "ownerId" },
  { table: "cloudMessages", index: "by_owner_messageKey", field: "ownerId" },
  { table: "runtimeRuns", index: "by_owner_startedAt", field: "ownerId" },
  { table: "runtimeRunEvents", index: "by_owner_run_seq", field: "ownerId" },
];

const SCANNED_USER_REFERENCES: ScanReferenceSpec[] = [
  { table: "operatorRoles", field: "createdBy" },
  { table: "criticalAuditEvents", field: "subjectUserId" },
  { table: "purchaseClaims", field: "redeemedByUserId" },
  { table: "communityBlocks", field: "createdByUserId" },
  { table: "communityAnalyticsEvents", field: "userId" },
  { table: "skillPackageRevisions", field: "createdByUserId" },
  { table: "communitySkillAttachments", field: "attachedByUserId" },
  { table: "communityAiFeedPosts", field: "authorUserId" },
];

function normalizeLimit(raw: unknown): number {
  const parsed = Number(raw ?? 50);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(50, Math.floor(parsed));
}

function isAnonymousUser(row: any): boolean {
  return String(row?.authSubject ?? "").trim().startsWith("anon:");
}

async function buildScannedReferenceMap(
  ctx: any,
  candidateIds: Set<string>,
): Promise<Map<string, string[]>> {
  const referencesByUser = new Map<string, string[]>();
  const addReference = (userId: string, reference: string) => {
    const existing = referencesByUser.get(userId) ?? [];
    existing.push(reference);
    referencesByUser.set(userId, existing);
  };

  for (const spec of SCANNED_USER_REFERENCES) {
    const rows = await ctx.db.query(spec.table as any).collect();
    for (const row of rows) {
      const userId = String(row?.[spec.field] ?? "").trim();
      if (!candidateIds.has(userId)) continue;
      addReference(userId, `${spec.table}.${spec.field}`);
    }
  }

  return referencesByUser;
}

async function findIndexedReferences(ctx: any, userId: any): Promise<string[]> {
  const references: string[] = [];
  for (const spec of INDEXED_USER_REFERENCES) {
    const row = await ctx.db
      .query(spec.table as any)
      .withIndex(spec.index, (q: any) => q.eq(spec.field, userId))
      .first();
    if (row) references.push(`${spec.table}.${spec.field}`);
  }
  return references;
}

export const cleanupAnonymousUsersInternal = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun !== false;
    const limit = normalizeLimit(args.limit);
    const users = await ctx.db.query("users").collect();
    const anonymousUsers = users
      .filter(isAnonymousUser)
      .sort((a: any, b: any) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
    const batch = anonymousUsers.slice(0, limit);
    const candidateIds = new Set<string>(batch.map((row: any) => String(row._id)));
    const scannedReferences = await buildScannedReferenceMap(ctx, candidateIds);
    const blocked: Array<{ userId: string; authSubject: string; references: string[] }> = [];
    const safe: Array<{ userId: any; authSubject: string }> = [];

    for (const user of batch) {
      const userId = String(user._id);
      const references = [
        ...(scannedReferences.get(userId) ?? []),
        ...(await findIndexedReferences(ctx, user._id)),
      ];
      if (references.length > 0) {
        blocked.push({
          userId,
          authSubject: String(user.authSubject ?? ""),
          references,
        });
      } else {
        safe.push({
          userId: user._id,
          authSubject: String(user.authSubject ?? ""),
        });
      }
    }

    if (!dryRun) {
      for (const user of safe) {
        await ctx.db.delete(user.userId);
      }
    }

    return {
      dryRun,
      totalAnonymousBefore: anonymousUsers.length,
      scanned: batch.length,
      safe: safe.length,
      blocked: blocked.length,
      deleted: dryRun ? 0 : safe.length,
      remainingEstimate: anonymousUsers.length - (dryRun ? 0 : safe.length),
      blockedSamples: blocked.slice(0, 10),
    };
  },
});
