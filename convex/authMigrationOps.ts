import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizeName, normalizeSlug } from "./communityCore";
import { isAnonymousAuthSubject, normalizeAuthRelinkEmail } from "../shared/authRelinkPolicy";

type UserRow = {
  _id: any;
  authSubject?: string;
  email?: string;
  normalizedEmail?: string;
  emailVerifiedAt?: number;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code";
  displayName?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
};

type AuthSessionRow = {
  _id: any;
  userId: any;
  email?: string;
  revokedAt?: number;
  updatedAt: number;
  createdAt: number;
};

type ProviderConnectionRow = {
  _id: any;
  userId: any;
  email?: string;
  updatedAt: number;
  createdAt: number;
};

type EmailOutboxRow = {
  _id: any;
  recipientUserId?: any;
  recipientEmail: string;
  updatedAt: number;
  createdAt: number;
};

type AuthenticatedActor = {
  authSubject: string;
  dbUserId: any;
  email: string | null;
  emailVerifiedAt: number | null;
  emailVerificationSource: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

type MergeUserSummary = {
  userId: string;
  authSubject: string | null;
  email: string | null;
  normalizedEmail: string | null;
  emailVerifiedAt: number | null;
  emailVerificationSource: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

type MergeTablePreview = {
  table: string;
  mergeStrategy: "move" | "dedupe" | "additive" | "revoke" | "review";
  winnerCount: number;
  loserCount: number;
};

type MergeCollisionPreview = {
  table: string;
  key: string;
  reason: string;
};

type EntitlementRow = {
  _id: any;
  userId: any;
  tier: "free" | "builder" | "architect";
  source: "default" | "stripe" | "admin_override" | "manual_grant";
  startsAt: number;
  endsAt?: number;
  createdAt: number;
  updatedAt: number;
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeOptionalString(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

function normalizeEmailValue(raw: unknown): string | undefined {
  return normalizeOptionalString(raw);
}

function normalizeStoredEmail(raw: unknown): string | null {
  return normalizeAuthRelinkEmail(raw);
}

function normalizeEmailVerificationSource(
  raw: unknown,
): "oauth_provider" | "magic_link" | "manual_change_code" | undefined {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "oauth_provider") return "oauth_provider";
  if (normalized === "magic_link") return "magic_link";
  if (normalized === "manual_change_code") return "manual_change_code";
  return undefined;
}

function toActor(authSubject: string, user: UserRow): AuthenticatedActor {
  return {
    authSubject,
    dbUserId: user._id,
    email: user.email ?? null,
    emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
    emailVerificationSource: user.emailVerificationSource ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function getUserByResolvedSubject(ctx: any, authSubject: string): Promise<UserRow | null> {
  const normalizedSubject = normalizeIdValue(authSubject);
  if (!normalizedSubject) return null;
  return ((await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalizedSubject))
    .first()) as UserRow | null) ?? null;
}

async function listUsersByNormalizedEmail(ctx: any, normalizedEmail: string): Promise<UserRow[]> {
  const normalized = normalizeStoredEmail(normalizedEmail);
  if (!normalized) return [];
  const indexed = (await ctx.db
    .query("users")
    .withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", normalized))
    .collect()) as UserRow[];
  if (indexed.length > 0) return indexed;
  const scanned = (await ctx.db.query("users").collect()) as UserRow[];
  return scanned.filter(
    (user) => normalizeStoredEmail(user.normalizedEmail ?? user.email) === normalized,
  );
}

function chooseMostRecentEmailValue(
  values: Array<{ email: string; updatedAt: number; createdAt: number }>,
): string | undefined {
  return values
    .slice()
    .sort((a, b) => {
      const left = Number.isFinite(a.updatedAt) ? a.updatedAt : a.createdAt;
      const right = Number.isFinite(b.updatedAt) ? b.updatedAt : b.createdAt;
      return right - left;
    })[0]?.email;
}

async function resolveTrustedMissingEmailCandidate(
  ctx: any,
  userId: any,
): Promise<{ email: string; normalizedEmail: string; source: "oauth_provider" | "manual_change_code" } | null> {
  const authSessions = (await ctx.db
    .query("authSessions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as AuthSessionRow[];
  const allSessionValues = authSessions
    .map((row) => ({
      email: normalizeEmailValue(row.email),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    }))
    .filter((row): row is { email: string; updatedAt: number; createdAt: number } => Boolean(row.email));
  const activeSessionValues = authSessions
    .filter((row) => typeof row.revokedAt !== "number")
    .map((row) => ({
      email: normalizeEmailValue(row.email),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    }))
    .filter((row): row is { email: string; updatedAt: number; createdAt: number } => Boolean(row.email));

  const normalizedActiveSessionEmails = Array.from(
    new Set(
      activeSessionValues
        .map((row) => normalizeStoredEmail(row.email))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (normalizedActiveSessionEmails.length === 1) {
    const email = chooseMostRecentEmailValue(activeSessionValues);
    const normalizedEmail = normalizeStoredEmail(email);
    if (email && normalizedEmail) {
      return { email, normalizedEmail, source: "oauth_provider" };
    }
  }

  const normalizedHistoricalSessionEmails = Array.from(
    new Set(
      allSessionValues
        .map((row) => normalizeStoredEmail(row.email))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (normalizedHistoricalSessionEmails.length === 1) {
    const email = chooseMostRecentEmailValue(allSessionValues);
    const normalizedEmail = normalizeStoredEmail(email);
    if (email && normalizedEmail) {
      return { email, normalizedEmail, source: "oauth_provider" };
    }
  }

  const emailOutbox = (await ctx.db.query("emailOutbox").collect()) as EmailOutboxRow[];
  const outboxValues = emailOutbox
    .filter((row) => normalizeIdValue(row.recipientUserId) === normalizeIdValue(userId))
    .map((row) => ({
      email: normalizeEmailValue(row.recipientEmail),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    }))
    .filter((row): row is { email: string; updatedAt: number; createdAt: number } => Boolean(row.email));
  const normalizedOutboxEmails = Array.from(
    new Set(
      outboxValues
        .map((row) => normalizeStoredEmail(row.email))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (normalizedOutboxEmails.length === 1) {
    const email = chooseMostRecentEmailValue(outboxValues);
    const normalizedEmail = normalizeStoredEmail(email);
    if (email && normalizedEmail) {
      return { email, normalizedEmail, source: "manual_change_code" };
    }
  }

  const providerConnections = (await ctx.db
    .query("userProviderConnections")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as ProviderConnectionRow[];
  const providerValues = providerConnections
    .map((row) => ({
      email: normalizeEmailValue(row.email),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    }))
    .filter((row): row is { email: string; updatedAt: number; createdAt: number } => Boolean(row.email));
  const normalizedProviderEmails = Array.from(
    new Set(
      providerValues
        .map((row) => normalizeStoredEmail(row.email))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (normalizedProviderEmails.length === 1) {
    const email = chooseMostRecentEmailValue(providerValues);
    const normalizedEmail = normalizeStoredEmail(email);
    if (email && normalizedEmail) {
      return { email, normalizedEmail, source: "manual_change_code" };
    }
  }

  return null;
}

async function revokeAuthSessionsForUser(ctx: any, userId: any, nowMs: number): Promise<void> {
  const rows = await ctx.db
    .query("authSessions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    if (typeof row.revokedAt === "number") continue;
    await ctx.db.patch(row._id, {
      revokedAt: nowMs,
      updatedAt: nowMs,
    });
  }
}

function buildUserPatch(args: {
  existing: UserRow;
  authSubject?: string;
  email?: string;
  normalizedEmail?: string;
  emailVerified: boolean;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code";
  displayName?: string;
  avatarUrl?: string;
  nowMs: number;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const nextAuthSubject = normalizeIdValue(args.authSubject);
  if (nextAuthSubject && nextAuthSubject !== normalizeIdValue(args.existing.authSubject)) {
    patch.authSubject = nextAuthSubject;
  }

  const emailChanged = args.email !== args.existing.email;
  const normalizedEmailChanged =
    normalizeStoredEmail(args.normalizedEmail) !==
    normalizeStoredEmail(args.existing.normalizedEmail ?? args.existing.email);

  if (emailChanged) patch.email = args.email;
  if (normalizedEmailChanged) patch.normalizedEmail = args.normalizedEmail;

  if (args.displayName !== undefined && args.displayName !== args.existing.displayName) {
    patch.displayName = args.displayName;
  }
  if (args.avatarUrl !== undefined && args.avatarUrl !== args.existing.avatarUrl) {
    patch.avatarUrl = args.avatarUrl;
  }

  if ((emailChanged || normalizedEmailChanged) && !args.emailVerified) {
    patch.emailVerifiedAt = undefined;
    patch.emailVerificationSource = undefined;
  }

  if (
    args.emailVerified &&
    (
      emailChanged ||
      normalizedEmailChanged ||
      typeof args.existing.emailVerifiedAt !== "number" ||
      args.existing.emailVerificationSource !== args.emailVerificationSource
    )
  ) {
    patch.emailVerifiedAt = args.nowMs;
    patch.emailVerificationSource = args.emailVerificationSource;
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = args.nowMs;
  }
  return patch;
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readAuthMigrationSecret(): string {
  return readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET");
}

function assertAuthMigrationSecret(secret: string): void {
  const configured = readAuthMigrationSecret();
  if (!configured || secret !== configured) {
    throw new Error("auth_migration_unauthorized");
  }
}

function summarizeUser(user: UserRow): MergeUserSummary {
  return {
    userId: normalizeIdValue(user._id),
    authSubject: normalizeIdValue(user.authSubject) || null,
    email: user.email ?? null,
    normalizedEmail: normalizeStoredEmail(user.normalizedEmail ?? user.email),
    emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
    emailVerificationSource: user.emailVerificationSource ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function buildTablePreview(
  table: string,
  mergeStrategy: MergeTablePreview["mergeStrategy"],
  winnerRows: unknown[],
  loserRows: unknown[],
): MergeTablePreview {
  return {
    table,
    mergeStrategy,
    winnerCount: winnerRows.length,
    loserCount: loserRows.length,
  };
}

function buildOverlapCollisions<T>(args: {
  table: string;
  reason: string;
  winnerRows: T[];
  loserRows: T[];
  keyForRow: (row: T) => string | null;
}): MergeCollisionPreview[] {
  const winnerKeys = new Set(
    args.winnerRows
      .map((row) => args.keyForRow(row))
      .filter((value): value is string => Boolean(value)),
  );
  const loserKeys = new Set(
    args.loserRows
      .map((row) => args.keyForRow(row))
      .filter((value): value is string => Boolean(value)),
  );
  return Array.from(winnerKeys)
    .filter((key) => loserKeys.has(key))
    .sort()
    .map((key) => ({
      table: args.table,
      key,
      reason: args.reason,
    }));
}

function buildSingletonCollision(args: {
  table: string;
  reason: string;
  winnerCount: number;
  loserCount: number;
}): MergeCollisionPreview[] {
  if (args.winnerCount === 0 || args.loserCount === 0) return [];
  return [
    {
      table: args.table,
      key: "singleton",
      reason: args.reason,
    },
  ];
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function entitlementTierRank(tier: "free" | "builder" | "architect"): number {
  if (tier === "architect") return 3;
  if (tier === "builder") return 2;
  return 1;
}

function buildMergedUserTombstone(args: { loserUserId: any; winnerUserId: any; nowMs: number }): string {
  return `merged:${normalizeIdValue(args.loserUserId)}:${normalizeIdValue(args.winnerUserId)}:${args.nowMs}`;
}

async function normalizeActiveEntitlementsForUser(ctx: any, userId: any, nowMs: number): Promise<void> {
  const rows = (await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as EntitlementRow[];
  const activeRows = rows.filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt));
  if (activeRows.length <= 1) return;
  const sorted = activeRows
    .slice()
    .sort((a, b) => {
      const tierDelta = entitlementTierRank(b.tier) - entitlementTierRank(a.tier);
      if (tierDelta !== 0) return tierDelta;
      if (b.startsAt !== a.startsAt) return b.startsAt - a.startsAt;
      return b.createdAt - a.createdAt;
    });
  const keeper = sorted[0];
  for (const row of activeRows) {
    if (normalizeIdValue(row._id) === normalizeIdValue(keeper?._id)) continue;
    await ctx.db.patch(row._id, {
      endsAt: nowMs,
      updatedAt: nowMs,
    });
  }
}

export const previewDuplicateUserMerge = query({
  args: {
    secret: v.string(),
    winnerUserId: v.id("users"),
    loserUserId: v.id("users"),
    expectedNormalizedEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);

    const winner = (await ctx.db.get(args.winnerUserId)) as UserRow | null;
    const loser = (await ctx.db.get(args.loserUserId)) as UserRow | null;
    const blockingIssues: string[] = [];
    if (!winner) blockingIssues.push("winner_not_found");
    if (!loser) blockingIssues.push("loser_not_found");
    if (blockingIssues.length > 0) {
      return {
        generatedAt: Date.now(),
        mergeAllowed: false,
        needsConflictResolution: false,
        blockingIssues,
      };
    }
    const winnerUser = winner as UserRow;
    const loserUser = loser as UserRow;

    if (normalizeIdValue(args.winnerUserId) === normalizeIdValue(args.loserUserId)) {
      blockingIssues.push("winner_and_loser_must_differ");
    }

    const winnerAuthSubject = normalizeIdValue(winnerUser.authSubject);
    const loserAuthSubject = normalizeIdValue(loserUser.authSubject);
    if (!winnerAuthSubject || isAnonymousAuthSubject(winnerAuthSubject)) {
      blockingIssues.push("winner_not_authenticated");
    }
    if (!loserAuthSubject || isAnonymousAuthSubject(loserAuthSubject)) {
      blockingIssues.push("loser_not_authenticated");
    }

    const winnerNormalizedEmail = normalizeStoredEmail(
      winnerUser.normalizedEmail ?? winnerUser.email,
    );
    const loserNormalizedEmail = normalizeStoredEmail(
      loserUser.normalizedEmail ?? loserUser.email,
    );
    if (!winnerNormalizedEmail || !loserNormalizedEmail) {
      blockingIssues.push("missing_normalized_email");
    } else if (winnerNormalizedEmail !== loserNormalizedEmail) {
      blockingIssues.push("normalized_email_mismatch");
    }

    const expectedNormalizedEmail = normalizeStoredEmail(args.expectedNormalizedEmail);
    if (
      expectedNormalizedEmail &&
      winnerNormalizedEmail &&
      winnerNormalizedEmail !== expectedNormalizedEmail
    ) {
      blockingIssues.push("expected_normalized_email_mismatch");
    }

    const clusterRows = winnerNormalizedEmail
      ? await listUsersByNormalizedEmail(ctx, winnerNormalizedEmail)
      : [];
    const authenticatedClusterRows = clusterRows.filter((row) => {
      const authSubject = normalizeIdValue(row.authSubject);
      return authSubject && !isAnonymousAuthSubject(authSubject);
    });
    if (authenticatedClusterRows.length !== 2) {
      blockingIssues.push("authenticated_duplicate_cluster_must_have_size_2");
    }

    const [
      winnerEntitlements,
      loserEntitlements,
      winnerCreditBalances,
      loserCreditBalances,
      winnerComputeCharges,
      loserComputeCharges,
      winnerCheckoutSessions,
      loserCheckoutSessions,
      winnerPurchaseClaims,
      loserPurchaseClaims,
      winnerMemorySettings,
      loserMemorySettings,
      winnerProviderConnections,
      loserProviderConnections,
      winnerAuthSessions,
      loserAuthSessions,
      winnerProfileDetails,
      loserProfileDetails,
      winnerEmailPreferences,
      loserEmailPreferences,
      winnerEmailOutbox,
      loserEmailOutbox,
      winnerPersonalMemory,
      loserPersonalMemory,
      winnerProjects,
      loserProjects,
      winnerCommunities,
      loserCommunities,
      winnerMemberships,
      loserMemberships,
      winnerPresence,
      loserPresence,
      winnerJoinRequests,
      loserJoinRequests,
      winnerSubscriptions,
      loserSubscriptions,
      winnerCommunityMessages,
      loserCommunityMessages,
      winnerMessageReactions,
      loserMessageReactions,
      winnerDeveloperApps,
      loserDeveloperApps,
      winnerUserPlatformAppMounts,
      loserUserPlatformAppMounts,
      winnerSkillPackages,
      loserSkillPackages,
      winnerMemberSettings,
      loserMemberSettings,
      winnerResources,
      loserResources,
      winnerThreads,
      loserThreads,
      winnerCloudMessages,
      loserCloudMessages,
      winnerRuntimeRuns,
      loserRuntimeRuns,
      winnerRuntimeRunEvents,
      loserRuntimeRunEvents,
      allUserProviderAuthStates,
      allUserProviderDeviceAuthStates,
      allWorkspaceTerminalSessions,
      allCommunityAppMounts,
      allCommunitySkillAttachments,
      allCommunityAiFeedPosts,
      allCommunityAiFeedReactions,
    ] = await Promise.all([
      ctx.db.query("userEntitlements").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userEntitlements").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db
        .query("workspaceCreditBalances")
        .withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId))
        .collect(),
      ctx.db
        .query("workspaceCreditBalances")
        .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
        .collect(),
      ctx.db
        .query("workspaceComputeCharges")
        .withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId))
        .collect(),
      ctx.db
        .query("workspaceComputeCharges")
        .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
        .collect(),
      ctx.db.query("checkoutSessions").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.winnerUserId)).collect(),
      ctx.db.query("checkoutSessions").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId)).collect(),
      ctx.db.query("purchaseClaims").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.winnerUserId)).collect(),
      ctx.db.query("purchaseClaims").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId)).collect(),
      ctx.db.query("userMemorySettings").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userMemorySettings").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db
        .query("userProviderConnections")
        .withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId))
        .collect(),
      ctx.db
        .query("userProviderConnections")
        .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
        .collect(),
      ctx.db.query("authSessions").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("authSessions").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("emailPreferences").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("emailPreferences").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("emailOutbox").withIndex("by_recipientUserId", (q: any) => q.eq("recipientUserId", args.winnerUserId)).collect(),
      ctx.db.query("emailOutbox").withIndex("by_recipientUserId", (q: any) => q.eq("recipientUserId", args.loserUserId)).collect(),
      ctx.db.query("personalMemoryItems").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("personalMemoryItems").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("cloudProjects").withIndex("by_owner", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("cloudProjects").withIndex("by_owner", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("communities").withIndex("by_owner", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("communities").withIndex("by_owner", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("communityMemberships").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityMemberships").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityPresence").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityPresence").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityJoinRequests").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityJoinRequests").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communitySubscriptions").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communitySubscriptions").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityChatMessages").withIndex("by_sender", (q: any) => q.eq("senderUserId", args.winnerUserId)).collect(),
      ctx.db.query("communityChatMessages").withIndex("by_sender", (q: any) => q.eq("senderUserId", args.loserUserId)).collect(),
      ctx.db.query("communityMessageReactions").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityMessageReactions").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("developerApps").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.winnerUserId)).collect(),
      ctx.db.query("developerApps").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId)).collect(),
      ctx.db
        .query("userPlatformAppMounts")
        .withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId))
        .collect(),
      ctx.db
        .query("userPlatformAppMounts")
        .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
        .collect(),
      ctx.db.query("skillPackages").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.winnerUserId)).collect(),
      ctx.db.query("skillPackages").withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId)).collect(),
      ctx.db.query("communityMemberSettings").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityMemberSettings").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityResources").withIndex("by_createdBy", (q: any) => q.eq("createdByUserId", args.winnerUserId)).collect(),
      ctx.db.query("communityResources").withIndex("by_createdBy", (q: any) => q.eq("createdByUserId", args.loserUserId)).collect(),
      ctx.db.query("threads").withIndex("by_owner", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("threads").withIndex("by_owner", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("cloudMessages").withIndex("by_owner_messageKey", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("cloudMessages").withIndex("by_owner_messageKey", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("runtimeRuns").withIndex("by_owner_startedAt", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("runtimeRuns").withIndex("by_owner_startedAt", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("runtimeRunEvents").withIndex("by_owner_run_seq", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("runtimeRunEvents").withIndex("by_owner_run_seq", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("userProviderAuthStates").collect(),
      ctx.db.query("userProviderDeviceAuthStates").collect(),
      ctx.db.query("workspaceTerminalSessions").collect(),
      ctx.db.query("communityAppMounts").collect(),
      ctx.db.query("communitySkillAttachments").collect(),
      ctx.db.query("communityAiFeedPosts").collect(),
      ctx.db.query("communityAiFeedReactions").collect(),
    ]);

    const winnerProviderAuthStates = allUserProviderAuthStates.filter((row: any) => normalizeIdValue(row.userId) === normalizeIdValue(args.winnerUserId));
    const loserProviderAuthStates = allUserProviderAuthStates.filter((row: any) => normalizeIdValue(row.userId) === normalizeIdValue(args.loserUserId));
    const winnerProviderDeviceAuthStates = allUserProviderDeviceAuthStates.filter((row: any) => normalizeIdValue(row.userId) === normalizeIdValue(args.winnerUserId));
    const loserProviderDeviceAuthStates = allUserProviderDeviceAuthStates.filter((row: any) => normalizeIdValue(row.userId) === normalizeIdValue(args.loserUserId));
    const winnerTerminalSessions = allWorkspaceTerminalSessions.filter((row: any) => normalizeIdValue(row.ownerId) === normalizeIdValue(args.winnerUserId));
    const loserTerminalSessions = allWorkspaceTerminalSessions.filter((row: any) => normalizeIdValue(row.ownerId) === normalizeIdValue(args.loserUserId));
    const winnerCommunityAppMounts = allCommunityAppMounts.filter((row: any) => normalizeIdValue(row.mountedByUserId) === normalizeIdValue(args.winnerUserId));
    const loserCommunityAppMounts = allCommunityAppMounts.filter((row: any) => normalizeIdValue(row.mountedByUserId) === normalizeIdValue(args.loserUserId));
    const winnerSkillAttachments = allCommunitySkillAttachments.filter((row: any) => normalizeIdValue(row.attachedByUserId) === normalizeIdValue(args.winnerUserId));
    const loserSkillAttachments = allCommunitySkillAttachments.filter((row: any) => normalizeIdValue(row.attachedByUserId) === normalizeIdValue(args.loserUserId));
    const winnerAiFeedPosts = allCommunityAiFeedPosts.filter((row: any) => normalizeIdValue(row.authorUserId) === normalizeIdValue(args.winnerUserId));
    const loserAiFeedPosts = allCommunityAiFeedPosts.filter((row: any) => normalizeIdValue(row.authorUserId) === normalizeIdValue(args.loserUserId));
    const winnerAiFeedReactions = allCommunityAiFeedReactions.filter((row: any) => normalizeIdValue(row.actorUserId) === normalizeIdValue(args.winnerUserId));
    const loserAiFeedReactions = allCommunityAiFeedReactions.filter((row: any) => normalizeIdValue(row.actorUserId) === normalizeIdValue(args.loserUserId));

    const tableCounts: MergeTablePreview[] = [
      buildTablePreview("userEntitlements", "review", winnerEntitlements, loserEntitlements),
      buildTablePreview("workspaceCreditBalances", "additive", winnerCreditBalances, loserCreditBalances),
      buildTablePreview("workspaceComputeCharges", "move", winnerComputeCharges, loserComputeCharges),
      buildTablePreview("checkoutSessions", "move", winnerCheckoutSessions, loserCheckoutSessions),
      buildTablePreview("purchaseClaims", "move", winnerPurchaseClaims, loserPurchaseClaims),
      buildTablePreview("userMemorySettings", "review", winnerMemorySettings, loserMemorySettings),
      buildTablePreview("userProviderConnections", "dedupe", winnerProviderConnections, loserProviderConnections),
      buildTablePreview("userProviderAuthStates", "revoke", winnerProviderAuthStates, loserProviderAuthStates),
      buildTablePreview("authSessions", "revoke", winnerAuthSessions, loserAuthSessions),
      buildTablePreview("userProviderDeviceAuthStates", "revoke", winnerProviderDeviceAuthStates, loserProviderDeviceAuthStates),
      buildTablePreview("userProfileDetails", "review", winnerProfileDetails, loserProfileDetails),
      buildTablePreview("emailPreferences", "review", winnerEmailPreferences, loserEmailPreferences),
      buildTablePreview("emailOutbox", "move", winnerEmailOutbox, loserEmailOutbox),
      buildTablePreview("personalMemoryItems", "move", winnerPersonalMemory, loserPersonalMemory),
      buildTablePreview("cloudProjects", "move", winnerProjects, loserProjects),
      buildTablePreview("workspaceTerminalSessions", "move", winnerTerminalSessions, loserTerminalSessions),
      buildTablePreview("communities", "move", winnerCommunities, loserCommunities),
      buildTablePreview("communityMemberships", "dedupe", winnerMemberships, loserMemberships),
      buildTablePreview("communityPresence", "dedupe", winnerPresence, loserPresence),
      buildTablePreview("communityJoinRequests", "dedupe", winnerJoinRequests, loserJoinRequests),
      buildTablePreview("communitySubscriptions", "dedupe", winnerSubscriptions, loserSubscriptions),
      buildTablePreview("communityChatMessages", "move", winnerCommunityMessages, loserCommunityMessages),
      buildTablePreview("communityMessageReactions", "dedupe", winnerMessageReactions, loserMessageReactions),
      buildTablePreview("developerApps", "review", winnerDeveloperApps, loserDeveloperApps),
      buildTablePreview("communityAppMounts", "move", winnerCommunityAppMounts, loserCommunityAppMounts),
      buildTablePreview("userPlatformAppMounts", "dedupe", winnerUserPlatformAppMounts, loserUserPlatformAppMounts),
      buildTablePreview("skillPackages", "move", winnerSkillPackages, loserSkillPackages),
      buildTablePreview("communitySkillAttachments", "move", winnerSkillAttachments, loserSkillAttachments),
      buildTablePreview("communityAiFeedPosts", "move", winnerAiFeedPosts, loserAiFeedPosts),
      buildTablePreview("communityAiFeedReactions", "dedupe", winnerAiFeedReactions, loserAiFeedReactions),
      buildTablePreview("communityMemberSettings", "dedupe", winnerMemberSettings, loserMemberSettings),
      buildTablePreview("communityResources", "move", winnerResources, loserResources),
      buildTablePreview("threads", "review", winnerThreads, loserThreads),
      buildTablePreview("cloudMessages", "review", winnerCloudMessages, loserCloudMessages),
      buildTablePreview("runtimeRuns", "review", winnerRuntimeRuns, loserRuntimeRuns),
      buildTablePreview("runtimeRunEvents", "review", winnerRuntimeRunEvents, loserRuntimeRunEvents),
    ];

    const collisions: MergeCollisionPreview[] = [
      ...buildSingletonCollision({
        table: "userMemorySettings",
        reason: "both users have a singleton memory settings row",
        winnerCount: winnerMemorySettings.length,
        loserCount: loserMemorySettings.length,
      }),
      ...buildSingletonCollision({
        table: "userProfileDetails",
        reason: "both users have a singleton profile details row",
        winnerCount: winnerProfileDetails.length,
        loserCount: loserProfileDetails.length,
      }),
      ...buildSingletonCollision({
        table: "emailPreferences",
        reason: "both users have a singleton email preferences row",
        winnerCount: winnerEmailPreferences.length,
        loserCount: loserEmailPreferences.length,
      }),
      ...buildOverlapCollisions({
        table: "userProviderConnections",
        reason: "both users have a connection for the same provider",
        winnerRows: winnerProviderConnections,
        loserRows: loserProviderConnections,
        keyForRow: (row: any) => normalizeOptionalString(row.provider) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "userProviderAuthStates",
        reason: "both users have auth state for the same provider",
        winnerRows: winnerProviderAuthStates,
        loserRows: loserProviderAuthStates,
        keyForRow: (row: any) => normalizeOptionalString(row.provider) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "userProviderDeviceAuthStates",
        reason: "both users have device auth state for the same provider",
        winnerRows: winnerProviderDeviceAuthStates,
        loserRows: loserProviderDeviceAuthStates,
        keyForRow: (row: any) => normalizeOptionalString(row.provider) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "communityMemberships",
        reason: "both users have membership in the same community",
        winnerRows: winnerMemberships,
        loserRows: loserMemberships,
        keyForRow: (row: any) => normalizeIdValue(row.communityId) || null,
      }),
      ...buildOverlapCollisions({
        table: "communityPresence",
        reason: "both users have presence in the same community",
        winnerRows: winnerPresence,
        loserRows: loserPresence,
        keyForRow: (row: any) => normalizeIdValue(row.communityId) || null,
      }),
      ...buildOverlapCollisions({
        table: "communityJoinRequests",
        reason: "both users have a join request in the same community",
        winnerRows: winnerJoinRequests,
        loserRows: loserJoinRequests,
        keyForRow: (row: any) => normalizeIdValue(row.communityId) || null,
      }),
      ...buildOverlapCollisions({
        table: "communitySubscriptions",
        reason: "both users have a subscription in the same community",
        winnerRows: winnerSubscriptions,
        loserRows: loserSubscriptions,
        keyForRow: (row: any) => normalizeIdValue(row.communityId) || null,
      }),
      ...buildOverlapCollisions({
        table: "communityMessageReactions",
        reason: "both users reacted with the same emoji on the same message",
        winnerRows: winnerMessageReactions,
        loserRows: loserMessageReactions,
        keyForRow: (row: any) =>
          `${normalizeIdValue(row.messageId)}:${normalizeOptionalString(row.emoji) ?? ""}` || null,
      }),
      ...buildOverlapCollisions({
        table: "developerApps",
        reason: "both users own an app with the same slug",
        winnerRows: winnerDeveloperApps,
        loserRows: loserDeveloperApps,
        keyForRow: (row: any) => normalizeOptionalString(row.slug) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "userPlatformAppMounts",
        reason: "both users mounted the same developer app",
        winnerRows: winnerUserPlatformAppMounts,
        loserRows: loserUserPlatformAppMounts,
        keyForRow: (row: any) => normalizeIdValue(row.developerAppId) || null,
      }),
      ...buildOverlapCollisions({
        table: "communityAiFeedReactions",
        reason: "both users reacted to the same AI feed post",
        winnerRows: winnerAiFeedReactions,
        loserRows: loserAiFeedReactions,
        keyForRow: (row: any) => normalizeIdValue(row.postId) || null,
      }),
      ...buildOverlapCollisions({
        table: "communityMemberSettings",
        reason: "both users have member settings in the same community",
        winnerRows: winnerMemberSettings,
        loserRows: loserMemberSettings,
        keyForRow: (row: any) => normalizeIdValue(row.communityId) || null,
      }),
      ...buildOverlapCollisions({
        table: "threads",
        reason: "both users have the same thread key",
        winnerRows: winnerThreads,
        loserRows: loserThreads,
        keyForRow: (row: any) => normalizeOptionalString(row.threadKey) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "cloudMessages",
        reason: "both users have the same message key",
        winnerRows: winnerCloudMessages,
        loserRows: loserCloudMessages,
        keyForRow: (row: any) => normalizeOptionalString(row.messageKey) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "runtimeRuns",
        reason: "both users have the same runtime run id",
        winnerRows: winnerRuntimeRuns,
        loserRows: loserRuntimeRuns,
        keyForRow: (row: any) => normalizeOptionalString(row.runId) ?? null,
      }),
      ...buildOverlapCollisions({
        table: "runtimeRunEvents",
        reason: "both users have runtime events for the same run and sequence",
        winnerRows: winnerRuntimeRunEvents,
        loserRows: loserRuntimeRunEvents,
        keyForRow: (row: any) =>
          `${normalizeOptionalString(row.runId) ?? ""}:${String(row.seq ?? "")}` || null,
      }),
    ].sort((a, b) => {
      if (a.table !== b.table) return a.table.localeCompare(b.table);
      return a.key.localeCompare(b.key);
    });

    return {
      generatedAt: Date.now(),
      mergeAllowed: blockingIssues.length === 0,
      needsConflictResolution: collisions.length > 0,
      blockingIssues,
      users: {
        winner: summarizeUser(winnerUser),
        loser: summarizeUser(loserUser),
      },
      cluster: {
        normalizedEmail: winnerNormalizedEmail,
        authenticatedUserIds: authenticatedClusterRows.map((row) => normalizeIdValue(row._id)).sort(),
        authenticatedClusterSize: authenticatedClusterRows.length,
      },
      tableCounts,
      collisions,
    };
  },
});

export const executeDuplicateUserMerge = mutation({
  args: {
    secret: v.string(),
    winnerUserId: v.id("users"),
    loserUserId: v.id("users"),
    expectedNormalizedEmail: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();

    const winner = (await ctx.db.get(args.winnerUserId)) as UserRow | null;
    const loser = (await ctx.db.get(args.loserUserId)) as UserRow | null;
    if (!winner) throw new Error("winner_not_found");
    if (!loser) throw new Error("loser_not_found");
    if (normalizeIdValue(args.winnerUserId) === normalizeIdValue(args.loserUserId)) {
      throw new Error("winner_and_loser_must_differ");
    }

    const winnerAuthSubject = normalizeIdValue(winner.authSubject);
    const loserAuthSubject = normalizeIdValue(loser.authSubject);
    if (!winnerAuthSubject || isAnonymousAuthSubject(winnerAuthSubject)) {
      throw new Error("winner_not_authenticated");
    }
    if (!loserAuthSubject || isAnonymousAuthSubject(loserAuthSubject)) {
      throw new Error("loser_not_authenticated");
    }

    const winnerNormalizedEmail = normalizeStoredEmail(winner.normalizedEmail ?? winner.email);
    const loserNormalizedEmail = normalizeStoredEmail(loser.normalizedEmail ?? loser.email);
    if (!winnerNormalizedEmail || !loserNormalizedEmail) {
      throw new Error("missing_normalized_email");
    }
    if (winnerNormalizedEmail !== loserNormalizedEmail) {
      throw new Error("normalized_email_mismatch");
    }
    const expectedNormalizedEmail = normalizeStoredEmail(args.expectedNormalizedEmail);
    if (expectedNormalizedEmail && expectedNormalizedEmail !== winnerNormalizedEmail) {
      throw new Error("expected_normalized_email_mismatch");
    }

    const clusterRows = await listUsersByNormalizedEmail(ctx, winnerNormalizedEmail);
    const authenticatedClusterRows = clusterRows.filter((row) => {
      const authSubject = normalizeIdValue(row.authSubject);
      return authSubject && !isAnonymousAuthSubject(authSubject);
    });
    if (authenticatedClusterRows.length !== 2) {
      throw new Error("authenticated_duplicate_cluster_must_have_size_2");
    }
    const authenticatedIds = new Set(authenticatedClusterRows.map((row) => normalizeIdValue(row._id)));
    if (
      !authenticatedIds.has(normalizeIdValue(args.winnerUserId)) ||
      !authenticatedIds.has(normalizeIdValue(args.loserUserId))
    ) {
      throw new Error("duplicate_cluster_target_mismatch");
    }

    const [
      winnerMemorySettings,
      loserMemorySettings,
      winnerProfileDetails,
      loserProfileDetails,
      winnerEmailPreferences,
      loserEmailPreferences,
      winnerProviderConnections,
      loserProviderConnections,
      winnerMemberships,
      loserMemberships,
      winnerPresence,
      loserPresence,
      winnerJoinRequests,
      loserJoinRequests,
      winnerSubscriptions,
      loserSubscriptions,
      winnerMessageReactions,
      loserMessageReactions,
      winnerUserPlatformAppMounts,
      loserUserPlatformAppMounts,
      winnerMemberSettings,
      loserMemberSettings,
      winnerThreads,
      loserThreads,
      winnerCloudMessages,
      loserCloudMessages,
      winnerRuntimeRuns,
      loserRuntimeRuns,
      winnerRuntimeRunEvents,
      loserRuntimeRunEvents,
    ] = await Promise.all([
      ctx.db.query("userMemorySettings").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userMemorySettings").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("emailPreferences").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("emailPreferences").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("userProviderConnections").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userProviderConnections").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityMemberships").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityMemberships").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityPresence").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityPresence").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityJoinRequests").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityJoinRequests").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communitySubscriptions").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communitySubscriptions").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityMessageReactions").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityMessageReactions").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("userPlatformAppMounts").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("userPlatformAppMounts").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("communityMemberSettings").withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId)).collect(),
      ctx.db.query("communityMemberSettings").withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId)).collect(),
      ctx.db.query("threads").withIndex("by_owner", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("threads").withIndex("by_owner", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("cloudMessages").withIndex("by_owner_messageKey", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("cloudMessages").withIndex("by_owner_messageKey", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("runtimeRuns").withIndex("by_owner_startedAt", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("runtimeRuns").withIndex("by_owner_startedAt", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
      ctx.db.query("runtimeRunEvents").withIndex("by_owner_run_seq", (q: any) => q.eq("ownerId", args.winnerUserId)).collect(),
      ctx.db.query("runtimeRunEvents").withIndex("by_owner_run_seq", (q: any) => q.eq("ownerId", args.loserUserId)).collect(),
    ]);

    if (winnerMemorySettings.length > 0 && loserMemorySettings.length > 0) {
      throw new Error("memory_settings_conflict");
    }
    if (winnerProfileDetails.length > 0 && loserProfileDetails.length > 0) {
      throw new Error("profile_details_conflict");
    }
    if (winnerEmailPreferences.length > 0 && loserEmailPreferences.length > 0) {
      throw new Error("email_preferences_conflict");
    }

    const providerKeys = new Set(
      winnerProviderConnections.map((row: any) => normalizeOptionalString(row.provider)).filter(Boolean),
    );
    for (const row of loserProviderConnections) {
      if (providerKeys.has(normalizeOptionalString((row as any).provider))) {
        throw new Error("provider_connection_conflict");
      }
    }

    const membershipKeys = new Set(
      winnerMemberships.map((row: any) => normalizeIdValue(row.communityId)).filter(Boolean),
    );
    for (const row of loserMemberships) {
      if (membershipKeys.has(normalizeIdValue((row as any).communityId))) {
        throw new Error("community_membership_conflict");
      }
    }

    const presenceKeys = new Set(
      winnerPresence.map((row: any) => normalizeIdValue(row.communityId)).filter(Boolean),
    );
    for (const row of loserPresence) {
      if (presenceKeys.has(normalizeIdValue((row as any).communityId))) {
        throw new Error("community_presence_conflict");
      }
    }

    const joinRequestKeys = new Set(
      winnerJoinRequests.map((row: any) => normalizeIdValue(row.communityId)).filter(Boolean),
    );
    for (const row of loserJoinRequests) {
      if (joinRequestKeys.has(normalizeIdValue((row as any).communityId))) {
        throw new Error("community_join_request_conflict");
      }
    }

    const subscriptionKeys = new Set(
      winnerSubscriptions.map((row: any) => normalizeIdValue(row.communityId)).filter(Boolean),
    );
    for (const row of loserSubscriptions) {
      if (subscriptionKeys.has(normalizeIdValue((row as any).communityId))) {
        throw new Error("community_subscription_conflict");
      }
    }

    const reactionKeys = new Set(
      winnerMessageReactions
        .map((row: any) => `${normalizeIdValue(row.messageId)}:${normalizeOptionalString(row.emoji) ?? ""}`)
        .filter(Boolean),
    );
    for (const row of loserMessageReactions) {
      const key = `${normalizeIdValue((row as any).messageId)}:${normalizeOptionalString((row as any).emoji) ?? ""}`;
      if (reactionKeys.has(key)) {
        throw new Error("community_message_reaction_conflict");
      }
    }

    const mountedAppKeys = new Set(
      winnerUserPlatformAppMounts.map((row: any) => normalizeIdValue(row.developerAppId)).filter(Boolean),
    );
    for (const row of loserUserPlatformAppMounts) {
      if (mountedAppKeys.has(normalizeIdValue((row as any).developerAppId))) {
        throw new Error("user_platform_app_mount_conflict");
      }
    }

    const memberSettingKeys = new Set(
      winnerMemberSettings.map((row: any) => normalizeIdValue(row.communityId)).filter(Boolean),
    );
    for (const row of loserMemberSettings) {
      if (memberSettingKeys.has(normalizeIdValue((row as any).communityId))) {
        throw new Error("community_member_settings_conflict");
      }
    }

    const threadKeys = new Set(
      winnerThreads.map((row: any) => normalizeOptionalString(row.threadKey)).filter(Boolean),
    );
    for (const row of loserThreads) {
      const key = normalizeOptionalString((row as any).threadKey);
      if (key && threadKeys.has(key)) {
        throw new Error("thread_key_conflict");
      }
    }

    const messageKeys = new Set(
      winnerCloudMessages.map((row: any) => normalizeOptionalString(row.messageKey)).filter(Boolean),
    );
    for (const row of loserCloudMessages) {
      const key = normalizeOptionalString((row as any).messageKey);
      if (key && messageKeys.has(key)) {
        throw new Error("cloud_message_key_conflict");
      }
    }

    const runKeys = new Set(
      winnerRuntimeRuns.map((row: any) => normalizeOptionalString(row.runId)).filter(Boolean),
    );
    for (const row of loserRuntimeRuns) {
      const key = normalizeOptionalString((row as any).runId);
      if (key && runKeys.has(key)) {
        throw new Error("runtime_run_conflict");
      }
    }

    const runEventKeys = new Set(
      winnerRuntimeRunEvents
        .map((row: any) => `${normalizeOptionalString(row.runId) ?? ""}:${String(row.seq ?? "")}`)
        .filter(Boolean),
    );
    for (const row of loserRuntimeRunEvents) {
      const key = `${normalizeOptionalString((row as any).runId) ?? ""}:${String((row as any).seq ?? "")}`;
      if (runEventKeys.has(key)) {
        throw new Error("runtime_run_event_conflict");
      }
    }

    const userEntitlements = (await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
      .collect()) as EntitlementRow[];
    for (const row of userEntitlements) {
      await ctx.db.patch(row._id, {
        userId: args.winnerUserId,
        updatedAt: nowMs,
      });
    }

    const winnerCreditBalance = (await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q: any) => q.eq("userId", args.winnerUserId))
      .first()) as any;
    const loserCreditBalance = (await ctx.db
      .query("workspaceCreditBalances")
      .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
      .first()) as any;
    if (loserCreditBalance) {
      if (winnerCreditBalance) {
        await ctx.db.patch(winnerCreditBalance._id, {
          includedCreditsBalance:
            Number(winnerCreditBalance.includedCreditsBalance ?? 0) +
            Number(loserCreditBalance.includedCreditsBalance ?? 0),
          purchasedCreditsBalance:
            Number(winnerCreditBalance.purchasedCreditsBalance ?? 0) +
            Number(loserCreditBalance.purchasedCreditsBalance ?? 0),
          includedCycleCredits: Math.max(
            Number(winnerCreditBalance.includedCycleCredits ?? 0),
            Number(loserCreditBalance.includedCycleCredits ?? 0),
          ),
          includedCycleStartedAt: Math.max(
            Number(winnerCreditBalance.includedCycleStartedAt ?? 0),
            Number(loserCreditBalance.includedCycleStartedAt ?? 0),
          ),
          includedCycleEndsAt: Math.max(
            Number(winnerCreditBalance.includedCycleEndsAt ?? 0),
            Number(loserCreditBalance.includedCycleEndsAt ?? 0),
          ),
          updatedAt: nowMs,
        });
        await ctx.db.delete(loserCreditBalance._id);
      } else {
        await ctx.db.patch(loserCreditBalance._id, {
          userId: args.winnerUserId,
          updatedAt: nowMs,
        });
      }
    }

    const tablesToMoveByUserId = [
      "workspaceComputeCharges",
      "checkoutSessions",
      "userMemorySettings",
      "userProfileDetails",
      "emailPreferences",
      "emailOutbox",
      "personalMemoryItems",
      "communityMemberships",
      "communityPresence",
      "communityJoinRequests",
      "communitySubscriptions",
      "communityChatMessages",
      "communityMessageReactions",
      "userPlatformAppMounts",
      "communityMemberSettings",
    ] as const;

    for (const table of tablesToMoveByUserId) {
      // handled via indexed queries above or full scans below
    }

    const loserWorkspaceComputeCharges = await ctx.db
      .query("workspaceComputeCharges")
      .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
      .collect();
    for (const row of loserWorkspaceComputeCharges) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId });
    }

    const loserCheckoutSessions = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId))
      .collect();
    for (const row of loserCheckoutSessions) {
      await ctx.db.patch((row as any)._id, { ownerUserId: args.winnerUserId, updatedAt: nowMs });
    }

    const purchaseClaims = await ctx.db.query("purchaseClaims").collect();
    for (const row of purchaseClaims) {
      const patch: Record<string, unknown> = {};
      if (normalizeIdValue((row as any).ownerUserId) === normalizeIdValue(args.loserUserId)) {
        patch.ownerUserId = args.winnerUserId;
      }
      if (normalizeIdValue((row as any).redeemedByUserId) === normalizeIdValue(args.loserUserId)) {
        patch.redeemedByUserId = args.winnerUserId;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = nowMs;
        await ctx.db.patch((row as any)._id, patch);
      }
    }

    if (loserMemorySettings.length > 0) {
      await ctx.db.patch((loserMemorySettings[0] as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }
    if (loserProfileDetails.length > 0) {
      await ctx.db.patch((loserProfileDetails[0] as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }
    if (loserEmailPreferences.length > 0) {
      await ctx.db.patch((loserEmailPreferences[0] as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }

    for (const row of loserProviderConnections) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserProviderAuthStates = (await ctx.db.query("userProviderAuthStates").collect()).filter(
      (row: any) => normalizeIdValue(row.userId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserProviderAuthStates) {
      await ctx.db.delete((row as any)._id);
    }

    const loserProviderDeviceAuthStates = (await ctx.db.query("userProviderDeviceAuthStates").collect()).filter(
      (row: any) => normalizeIdValue(row.userId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserProviderDeviceAuthStates) {
      await ctx.db.delete((row as any)._id);
    }

    await revokeAuthSessionsForUser(ctx, args.loserUserId, nowMs);

    const loserEmailOutbox = await ctx.db
      .query("emailOutbox")
      .withIndex("by_recipientUserId", (q: any) => q.eq("recipientUserId", args.loserUserId))
      .collect();
    for (const row of loserEmailOutbox) {
      await ctx.db.patch((row as any)._id, { recipientUserId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserPersonalMemory = await ctx.db
      .query("personalMemoryItems")
      .withIndex("by_user", (q: any) => q.eq("userId", args.loserUserId))
      .collect();
    for (const row of loserPersonalMemory) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId });
    }

    const loserProjects = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", args.loserUserId))
      .collect();
    for (const row of loserProjects) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserTerminalSessions = (await ctx.db.query("workspaceTerminalSessions").collect()).filter(
      (row: any) => normalizeIdValue(row.ownerId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserTerminalSessions) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserCommunities = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", args.loserUserId))
      .collect();
    for (const row of loserCommunities) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId, updatedAt: nowMs });
    }

    for (const row of loserMemberships) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }
    for (const row of loserPresence) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }
    for (const row of loserJoinRequests) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }
    for (const row of loserSubscriptions) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserCommunityMessages = await ctx.db
      .query("communityChatMessages")
      .withIndex("by_sender", (q: any) => q.eq("senderUserId", args.loserUserId))
      .collect();
    for (const row of loserCommunityMessages) {
      await ctx.db.patch((row as any)._id, { senderUserId: args.winnerUserId, updatedAt: nowMs });
    }

    for (const row of loserMessageReactions) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId });
    }

    const loserDeveloperApps = await ctx.db
      .query("developerApps")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId))
      .collect();
    for (const row of loserDeveloperApps) {
      await ctx.db.patch((row as any)._id, { ownerUserId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserCommunityAppMounts = (await ctx.db.query("communityAppMounts").collect()).filter(
      (row: any) => normalizeIdValue(row.mountedByUserId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserCommunityAppMounts) {
      await ctx.db.patch((row as any)._id, { mountedByUserId: args.winnerUserId, updatedAt: nowMs });
    }

    for (const row of loserUserPlatformAppMounts) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserSkillPackages = await ctx.db
      .query("skillPackages")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.loserUserId))
      .collect();
    for (const row of loserSkillPackages) {
      await ctx.db.patch((row as any)._id, { ownerUserId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserSkillAttachments = (await ctx.db.query("communitySkillAttachments").collect()).filter(
      (row: any) => normalizeIdValue(row.attachedByUserId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserSkillAttachments) {
      await ctx.db.patch((row as any)._id, { attachedByUserId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserAiFeedPosts = (await ctx.db.query("communityAiFeedPosts").collect()).filter(
      (row: any) => normalizeIdValue(row.authorUserId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserAiFeedPosts) {
      await ctx.db.patch((row as any)._id, { authorUserId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserAiFeedReactions = (await ctx.db.query("communityAiFeedReactions").collect()).filter(
      (row: any) => normalizeIdValue(row.actorUserId) === normalizeIdValue(args.loserUserId),
    );
    for (const row of loserAiFeedReactions) {
      await ctx.db.patch((row as any)._id, { actorUserId: args.winnerUserId, updatedAt: nowMs });
    }

    for (const row of loserMemberSettings) {
      await ctx.db.patch((row as any)._id, { userId: args.winnerUserId, updatedAt: nowMs });
    }

    const loserResources = await ctx.db
      .query("communityResources")
      .withIndex("by_createdBy", (q: any) => q.eq("createdByUserId", args.loserUserId))
      .collect();
    for (const row of loserResources) {
      await ctx.db.patch((row as any)._id, { createdByUserId: args.winnerUserId, updatedAt: nowMs });
    }

    for (const row of loserThreads) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId, updatedAt: nowMs });
    }
    for (const row of loserCloudMessages) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId });
    }
    for (const row of loserRuntimeRuns) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId, updatedAt: nowMs });
    }
    for (const row of loserRuntimeRunEvents) {
      await ctx.db.patch((row as any)._id, { ownerId: args.winnerUserId });
    }

    await normalizeActiveEntitlementsForUser(ctx, args.winnerUserId, nowMs);

    const tombstoneSubject = buildMergedUserTombstone({
      loserUserId: args.loserUserId,
      winnerUserId: args.winnerUserId,
      nowMs,
    });
    await ctx.db.patch(args.loserUserId, {
      authSubject: tombstoneSubject,
      email: undefined,
      normalizedEmail: undefined,
      emailVerifiedAt: undefined,
      emailVerificationSource: undefined,
      updatedAt: nowMs,
    });

    return {
      ok: true,
      winnerUserId: normalizeIdValue(args.winnerUserId),
      loserUserId: normalizeIdValue(args.loserUserId),
      mergedNormalizedEmail: winnerNormalizedEmail,
      tombstoneSubject,
    };
  },
});

export const backfillNormalizedUserEmails = mutation({
  args: {
    secret: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();
    const users = (await ctx.db.query("users").collect()) as UserRow[];
    let updatedCount = 0;
    for (const user of users) {
      const normalizedEmail = normalizeStoredEmail(user.email) ?? undefined;
      const currentNormalized = normalizeStoredEmail(user.normalizedEmail) ?? undefined;
      if (normalizedEmail === currentNormalized) continue;
      await ctx.db.patch(user._id, {
        normalizedEmail,
        updatedAt: nowMs,
      });
      updatedCount += 1;
    }
    return {
      scannedCount: users.length,
      updatedCount,
    };
  },
});

export const repairMissingUserEmailsFromTrustedHistory = mutation({
  args: {
    secret: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();
    const users = (await ctx.db.query("users").collect()) as UserRow[];
    let scannedCount = 0;
    let repairedCount = 0;
    const unresolvedUserIds: string[] = [];

    for (const user of users) {
      const authSubject = normalizeIdValue(user.authSubject);
      if (!authSubject || isAnonymousAuthSubject(authSubject)) continue;
      const normalizedEmail = normalizeStoredEmail(user.normalizedEmail ?? user.email);
      if (normalizedEmail) continue;
      scannedCount += 1;
      const candidate = await resolveTrustedMissingEmailCandidate(ctx, user._id);
      if (!candidate) {
        unresolvedUserIds.push(normalizeIdValue(user._id));
        continue;
      }
      await ctx.db.patch(user._id, {
        email: candidate.email,
        normalizedEmail: candidate.normalizedEmail,
        ...(typeof user.emailVerifiedAt === "number"
          ? null
          : {
              emailVerifiedAt: nowMs,
              emailVerificationSource: candidate.source,
            }),
        updatedAt: nowMs,
      });
      repairedCount += 1;
    }

    return {
      scannedCount,
      repairedCount,
      unresolvedUserIds,
    };
  },
});

export const manuallyRelinkUserAuthSubject = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    newAuthSubject: v.string(),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    emailVerificationSource: v.optional(
      v.union(
        v.literal("oauth_provider"),
        v.literal("magic_link"),
        v.literal("manual_change_code"),
      ),
    ),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();
    const user = (await ctx.db.get(args.userId)) as UserRow | null;
    if (!user) throw new Error("user_not_found");

    const conflicting = await getUserByResolvedSubject(ctx, args.newAuthSubject);
    if (conflicting && normalizeIdValue(conflicting._id) !== normalizeIdValue(args.userId)) {
      throw new Error("auth_subject_conflict");
    }

    const email = normalizeEmailValue(args.email ?? user.email);
    const normalizedEmail = normalizeStoredEmail(email) ?? undefined;
    const emailVerified = Boolean(args.emailVerified ?? false);
    const emailVerificationSource =
      normalizeEmailVerificationSource(args.emailVerificationSource) ??
      (emailVerified ? "manual_change_code" : undefined);
    const displayName =
      args.displayName !== undefined ? normalizeOptionalString(args.displayName) : user.displayName;
    const avatarUrl =
      args.avatarUrl !== undefined ? normalizeOptionalString(args.avatarUrl) : user.avatarUrl;

    const patch = buildUserPatch({
      existing: user,
      authSubject: args.newAuthSubject,
      email,
      normalizedEmail,
      emailVerified,
      emailVerificationSource,
      displayName,
      avatarUrl,
      nowMs,
    });
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.userId, patch);
    }
    await revokeAuthSessionsForUser(ctx, args.userId, nowMs);
    const updated = (await ctx.db.get(args.userId)) as UserRow | null;
    if (!updated) throw new Error("user_not_found");
    return toActor(normalizeIdValue(updated.authSubject), updated);
  },
});

export const inspectCommunityAccessState = query({
  args: {
    secret: v.string(),
    communitySlug: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);

    const normalizedSlug = String(args.communitySlug ?? "").trim().toLowerCase();
    const normalizedEmail = normalizeStoredEmail(args.email);

    const community = normalizedSlug
      ? ((await ctx.db
          .query("communities")
          .withIndex("by_slug", (q: any) => q.eq("slug", normalizedSlug))
          .first()) as any | null)
      : null;

    const emailUsers = normalizedEmail ? await listUsersByNormalizedEmail(ctx, normalizedEmail) : [];
    const communityMemberships = community
      ? await ctx.db
          .query("communityMemberships")
          .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
          .collect()
      : [];
    const communityJoinRequests = community
      ? await ctx.db
          .query("communityJoinRequests")
          .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
          .collect()
      : [];

    const involvedUserIds = new Set<string>();
    for (const user of emailUsers) involvedUserIds.add(normalizeIdValue(user._id));
    if (community?.ownerId) involvedUserIds.add(normalizeIdValue(community.ownerId));
    for (const row of communityMemberships as any[]) involvedUserIds.add(normalizeIdValue(row.userId));
    for (const row of communityJoinRequests as any[]) involvedUserIds.add(normalizeIdValue(row.userId));

    const involvedUsers = (
      await Promise.all(
        Array.from(involvedUserIds)
          .filter(Boolean)
          .map(async (userId) => {
            const row = (await ctx.db.get(userId as any)) as UserRow | null;
            if (!row) return null;
            return row;
          }),
      )
    ).filter(Boolean) as UserRow[];

    const userSummaryById = new Map<string, MergeUserSummary>();
    for (const user of involvedUsers) {
      userSummaryById.set(normalizeIdValue(user._id), {
        userId: normalizeIdValue(user._id),
        authSubject: normalizeIdValue(user.authSubject) || null,
        email: user.email ?? null,
        normalizedEmail: normalizeStoredEmail(user.normalizedEmail ?? user.email),
        emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
        emailVerificationSource: user.emailVerificationSource ?? null,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }

    const allAuthSessions = (
      await Promise.all(
        Array.from(involvedUserIds)
          .filter(Boolean)
          .map(async (userId) => {
            const rows = await ctx.db
              .query("authSessions")
              .withIndex("by_user", (q: any) => q.eq("userId", userId as any))
              .collect();
            return rows.map((row: any) => ({
              userId: normalizeIdValue(row.userId),
              authSubject: normalizeIdValue(row.authSubject) || null,
              sessionId: normalizeIdValue(row.sessionId) || null,
              provider: normalizeOptionalString(row.provider) ?? null,
              email: row.email ?? null,
              displayName: row.displayName ?? null,
              revokedAt: typeof row.revokedAt === "number" ? row.revokedAt : null,
              accessTokenExpiresAt:
                typeof row.accessTokenExpiresAt === "number" ? row.accessTokenExpiresAt : null,
              lastRefreshAt: typeof row.lastRefreshAt === "number" ? row.lastRefreshAt : null,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }));
          }),
      )
    )
      .flat()
      .sort((a, b) => {
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        return b.updatedAt - a.updatedAt;
      });

    const ownedCommunities = (
      await Promise.all(
        emailUsers.map(async (user) => {
          const rows = await ctx.db
            .query("communities")
            .withIndex("by_owner", (q: any) => q.eq("ownerId", user._id))
            .collect();
          return rows.map((row: any) => ({
            communityId: normalizeIdValue(row._id),
            ownerUserId: normalizeIdValue(row.ownerId),
            slug: normalizeOptionalString(row.slug) ?? null,
            name: normalizeOptionalString(row.name) ?? null,
            visibility: normalizeOptionalString(row.visibility) ?? null,
            entryPolicy: normalizeOptionalString(row.entryPolicy) ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }));
        }),
      )
    ).flat();

    return {
      generatedAt: Date.now(),
      lookup: {
        communitySlug: normalizedSlug || null,
        normalizedEmail,
      },
      matchedEmailUsers: emailUsers.map((user) => userSummaryById.get(normalizeIdValue(user._id))),
      community: community
        ? {
            id: normalizeIdValue(community._id),
            slug: community.slug,
            name: community.name,
            ownerUserId: normalizeIdValue(community.ownerId),
            owner: userSummaryById.get(normalizeIdValue(community.ownerId)) ?? null,
            visibility: community.visibility,
            entryPolicy: community.entryPolicy,
            createdAt: community.createdAt,
            updatedAt: community.updatedAt,
          }
        : null,
      communityMemberships: (communityMemberships as any[]).map((row) => ({
        membershipId: normalizeIdValue(row._id),
        communityId: normalizeIdValue(row.communityId),
        userId: normalizeIdValue(row.userId),
        user: userSummaryById.get(normalizeIdValue(row.userId)) ?? null,
        role: normalizeOptionalString(row.role) ?? null,
        accessSource: normalizeOptionalString(row.accessSource) ?? null,
        active: typeof row.active === "boolean" ? row.active : null,
        revokedAt: typeof row.revokedAt === "number" ? row.revokedAt : null,
        revokedReason: normalizeOptionalString(row.revokedReason) ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      communityJoinRequests: (communityJoinRequests as any[]).map((row) => ({
        joinRequestId: normalizeIdValue(row._id),
        communityId: normalizeIdValue(row.communityId),
        userId: normalizeIdValue(row.userId),
        user: userSummaryById.get(normalizeIdValue(row.userId)) ?? null,
        status: normalizeOptionalString(row.status) ?? null,
        message: normalizeOptionalString(row.message) ?? null,
        deniedAt: typeof row.deniedAt === "number" ? row.deniedAt : null,
        reapplyAt: typeof row.reapplyAt === "number" ? row.reapplyAt : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      ownedCommunities,
      recentAuthSessions: allAuthSessions,
    };
  },
});

export const renameCommunityCanonicalFields = mutation({
  args: {
    secret: v.string(),
    communityId: v.id("communities"),
    slug: v.string(),
    name: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);

    const community = (await ctx.db.get(args.communityId)) as
      | {
          _id: any;
          ownerId: any;
          slug: string;
          name: string;
          updatedAt: number;
          createdAt: number;
        }
      | null;
    if (!community) throw new Error("community_not_found");

    const normalizedSlug = normalizeSlug(args.slug);
    const normalizedName = normalizeName(args.name);

    const conflicting = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", normalizedSlug))
      .first()) as { _id: any } | null;
    if (conflicting && normalizeIdValue(conflicting._id) !== normalizeIdValue(community._id)) {
      throw new Error("community_slug_taken");
    }

    const nextUpdatedAt = args.nowMs ?? Date.now();
    if (community.slug !== normalizedSlug || community.name !== normalizedName) {
      await ctx.db.patch(args.communityId, {
        slug: normalizedSlug,
        name: normalizedName,
        updatedAt: nextUpdatedAt,
      });
    }

    const updated = (await ctx.db.get(args.communityId)) as
      | {
          _id: any;
          ownerId: any;
          slug: string;
          name: string;
          updatedAt: number;
          createdAt: number;
        }
      | null;
    if (!updated) throw new Error("community_not_found");

    return {
      communityId: normalizeIdValue(updated._id),
      ownerUserId: normalizeIdValue(updated.ownerId),
      slug: updated.slug,
      name: updated.name,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  },
});

export const deleteCommunityJoinRequest = mutation({
  args: {
    secret: v.string(),
    joinRequestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    assertAuthMigrationSecret(args.secret);

    const joinRequest = (await ctx.db.get(args.joinRequestId)) as
      | {
          _id: any;
          communityId: any;
          userId: any;
          status?: string;
          createdAt: number;
          updatedAt: number;
        }
      | null;
    if (!joinRequest) {
      return { deleted: false, joinRequestId: normalizeIdValue(args.joinRequestId) };
    }

    await ctx.db.delete(args.joinRequestId);
    return {
      deleted: true,
      joinRequestId: normalizeIdValue(joinRequest._id),
      communityId: normalizeIdValue(joinRequest.communityId),
      userId: normalizeIdValue(joinRequest.userId),
      status: normalizeOptionalString(joinRequest.status) ?? null,
      createdAt: joinRequest.createdAt,
      updatedAt: joinRequest.updatedAt,
    };
  },
});
