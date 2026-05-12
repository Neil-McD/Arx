import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { ensureAuthenticatedActor } from "./authActor";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";

type AccountDeleteBlockerCode =
  | "account_delete_owned_communities_blocked"
  | "account_delete_active_community_subscription_blocked"
  | "account_delete_active_payout_account_blocked"
  | "account_delete_mounted_apps_blocked"
  | "account_delete_attached_skills_blocked";

const accountDeleteBlockerCodes = new Set<string>([
  "account_delete_owned_communities_blocked",
  "account_delete_active_community_subscription_blocked",
  "account_delete_active_payout_account_blocked",
  "account_delete_mounted_apps_blocked",
  "account_delete_attached_skills_blocked",
]);

function throwAccountDeleteBlocker(code: AccountDeleteBlockerCode): never {
  throw new ConvexError({ code, reason: code });
}

function readAccountDeleteBlockerReason(error: unknown): string {
  const data =
    error instanceof ConvexError
      ? error.data
      : typeof error === "object" && error !== null && "data" in error
        ? (error as { data?: unknown }).data
        : null;
  if (typeof data === "object" && data !== null) {
    const code = (data as { code?: unknown }).code;
    if (typeof code === "string" && accountDeleteBlockerCodes.has(code)) return code;
    const reason = (data as { reason?: unknown }).reason;
    if (typeof reason === "string" && accountDeleteBlockerCodes.has(reason)) return reason;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const code of accountDeleteBlockerCodes) {
    if (message.includes(code)) return code;
  }
  return message || "unknown";
}

async function deleteRowsByIndex(ctx: any, tableName: string, indexName: string, fieldName: string, value: any) {
  const rows = await ctx.db
    .query(tableName)
    .withIndex(indexName, (q: any) => q.eq(fieldName, value))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

function isActiveCommunitySubscription(row: any): boolean {
  return row?.status === "active" || row?.status === "past_due" || row?.status === "cancel_at_period_end";
}

function hasPayoutAccountState(row: any): boolean {
  return Boolean(row);
}

async function assertAccountDeletionAllowed(ctx: any, userId: any) {
  const ownedCommunity = await ctx.db
    .query("communities")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
    .first();
  if (ownedCommunity) {
    throwAccountDeleteBlocker("account_delete_owned_communities_blocked");
  }

  const communitySubscriptions = await ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (communitySubscriptions.some(isActiveCommunitySubscription)) {
    throwAccountDeleteBlocker("account_delete_active_community_subscription_blocked");
  }

  const stripeConnectAccounts = await ctx.db
    .query("userStripeConnectAccounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (stripeConnectAccounts.some(hasPayoutAccountState)) {
    throwAccountDeleteBlocker("account_delete_active_payout_account_blocked");
  }

  const developerApps = await ctx.db
    .query("developerApps")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId))
    .collect();
  for (const app of developerApps) {
    const communityMount = await ctx.db
      .query("communityAppMounts")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", app._id))
      .first();
    if (communityMount) {
      throwAccountDeleteBlocker("account_delete_mounted_apps_blocked");
    }
    const otherUserMounts = await ctx.db
      .query("userPlatformAppMounts")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", app._id))
      .collect();
    if (otherUserMounts.some((mount: any) => mount.userId !== userId)) {
      throwAccountDeleteBlocker("account_delete_mounted_apps_blocked");
    }
  }

  const skillPackages = await ctx.db
    .query("skillPackages")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId))
    .collect();
  for (const skill of skillPackages) {
    const communityAttachment = await ctx.db
      .query("communitySkillAttachments")
      .withIndex("by_skill", (q: any) => q.eq("skillPackageId", skill._id))
      .first();
    if (communityAttachment) {
      throwAccountDeleteBlocker("account_delete_attached_skills_blocked");
    }
    const otherUserInstalls = await ctx.db
      .query("userPlatformSkillInstalls")
      .withIndex("by_skill", (q: any) => q.eq("skillPackageId", skill._id))
      .collect();
    if (otherUserInstalls.some((install: any) => install.userId !== userId)) {
      throwAccountDeleteBlocker("account_delete_attached_skills_blocked");
    }
  }
}

export const deleteOwnAccount = mutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
      nowMs,
    });
    const userId = actor.dbUserId;

    try {
      await assertAccountDeletionAllowed(ctx, userId);
    } catch (error) {
      const blockerReason = readAccountDeleteBlockerReason(error);
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `account_delete_blocked:${userId}:${blockerReason}:${nowMs}`,
        eventType: "account_delete_blocked",
        severity: "warning",
        status: "blocked",
        actorUserId: userId,
        subjectUserId: userId,
        provider: "polynet",
        metadata: {
          reason: blockerReason,
        },
        createdAt: nowMs,
      });
      throw error;
    }

    const deleted: Record<string, number> = {};
    const record = async (tableName: string, count: number) => {
      deleted[tableName] = (deleted[tableName] ?? 0) + count;
    };

    await record("authSessions", await deleteRowsByIndex(ctx, "authSessions", "by_user", "userId", userId));
    await record("userEntitlements", await deleteRowsByIndex(ctx, "userEntitlements", "by_user", "userId", userId));
    await record("userStripeConnectAccounts", await deleteRowsByIndex(ctx, "userStripeConnectAccounts", "by_user", "userId", userId));
    await record("workspaceCreditBalances", await deleteRowsByIndex(ctx, "workspaceCreditBalances", "by_user", "userId", userId));
    await record("workspaceComputeCharges", await deleteRowsByIndex(ctx, "workspaceComputeCharges", "by_user", "userId", userId));
    await record("creditLedgerEntries", await deleteRowsByIndex(ctx, "creditLedgerEntries", "by_user_createdAt", "userId", userId));
    await record("checkoutSessions", await deleteRowsByIndex(ctx, "checkoutSessions", "by_owner", "ownerUserId", userId));
    await record("purchaseClaims", await deleteRowsByIndex(ctx, "purchaseClaims", "by_owner", "ownerUserId", userId));
    await record("userMemorySettings", await deleteRowsByIndex(ctx, "userMemorySettings", "by_user", "userId", userId));
    await record("userProviderConnections", await deleteRowsByIndex(ctx, "userProviderConnections", "by_user", "userId", userId));
    await record("userProviderAuthStates", await deleteRowsByIndex(ctx, "userProviderAuthStates", "by_user_provider", "userId", userId));
    await record("userProviderDeviceAuthStates", await deleteRowsByIndex(ctx, "userProviderDeviceAuthStates", "by_user_provider", "userId", userId));
    await record("userProfileDetails", await deleteRowsByIndex(ctx, "userProfileDetails", "by_user", "userId", userId));
    await record("emailPreferences", await deleteRowsByIndex(ctx, "emailPreferences", "by_user", "userId", userId));
    await record("emailOutbox", await deleteRowsByIndex(ctx, "emailOutbox", "by_recipientUserId", "recipientUserId", userId));
    await record("personalMemoryItems", await deleteRowsByIndex(ctx, "personalMemoryItems", "by_user", "userId", userId));
    await record("communityMemberships", await deleteRowsByIndex(ctx, "communityMemberships", "by_user", "userId", userId));
    await record("communityPresence", await deleteRowsByIndex(ctx, "communityPresence", "by_user", "userId", userId));
    await record("communityJoinRequests", await deleteRowsByIndex(ctx, "communityJoinRequests", "by_user", "userId", userId));
    await record("communityBlocks", await deleteRowsByIndex(ctx, "communityBlocks", "by_user", "userId", userId));
    await record("communitySubscriptions", await deleteRowsByIndex(ctx, "communitySubscriptions", "by_user", "userId", userId));
    await record("communityMessageReactions", await deleteRowsByIndex(ctx, "communityMessageReactions", "by_user", "userId", userId));
    await record("communityTypingPresence", await deleteRowsByIndex(ctx, "communityTypingPresence", "by_user", "userId", userId));
    await record("communityMemberSettings", await deleteRowsByIndex(ctx, "communityMemberSettings", "by_user", "userId", userId));
    await record("communityResources", await deleteRowsByIndex(ctx, "communityResources", "by_createdBy", "createdByUserId", userId));
    await record("communityEvents", await deleteRowsByIndex(ctx, "communityEvents", "by_createdBy", "createdByUserId", userId));
    await record("userPlatformAppMounts", await deleteRowsByIndex(ctx, "userPlatformAppMounts", "by_user", "userId", userId));
    await record("userPlatformSkillInstalls", await deleteRowsByIndex(ctx, "userPlatformSkillInstalls", "by_user", "userId", userId));
    await record("communityAiFeedReactions", await deleteRowsByIndex(ctx, "communityAiFeedReactions", "by_actorUser", "actorUserId", userId));
    await record("partnerAttributions", await deleteRowsByIndex(ctx, "partnerAttributions", "by_referredUser", "referredUserId", userId));
    const referredPartnerCommissions = await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_referredUser", (q: any) => q.eq("referredUserId", userId))
      .collect();
    for (const commission of referredPartnerCommissions) {
      await record("partnerCommissionAdjustments", await deleteRowsByIndex(ctx, "partnerCommissionAdjustments", "by_commission", "commissionId", commission._id));
    }
    await record("partnerCommissionLedger", await deleteRowsByIndex(ctx, "partnerCommissionLedger", "by_referredUser", "referredUserId", userId));

    const builderPartners = await ctx.db
      .query("builderPartners")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const partner of builderPartners) {
      await record("partnerAttributions", await deleteRowsByIndex(ctx, "partnerAttributions", "by_partner_status", "partnerId", partner._id));
      await record("partnerCommissionAdjustments", await deleteRowsByIndex(ctx, "partnerCommissionAdjustments", "by_partner_createdAt", "partnerId", partner._id));
      await record("partnerCommissionLedger", await deleteRowsByIndex(ctx, "partnerCommissionLedger", "by_partner_status", "partnerId", partner._id));
      await record("builderPartners", 1);
      await ctx.db.delete(partner._id);
    }

    const developerApps = await ctx.db
      .query("developerApps")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    for (const app of developerApps) {
      await record("appConnections", await deleteRowsByIndex(ctx, "appConnections", "by_app", "developerAppId", app._id));
      await record("appToolSnapshots", await deleteRowsByIndex(ctx, "appToolSnapshots", "by_app", "developerAppId", app._id));
      await record("developerApps", 1);
      await ctx.db.delete(app._id);
    }

    const skillPackages = await ctx.db
      .query("skillPackages")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    for (const skill of skillPackages) {
      await record("skillPackageRevisions", await deleteRowsByIndex(ctx, "skillPackageRevisions", "by_skill", "skillPackageId", skill._id));
      await record("skillPackages", 1);
      await ctx.db.delete(skill._id);
    }

    const terminalSessions = await ctx.db
      .query("workspaceTerminalSessions")
      .withIndex("by_owner_project", (q) => q.eq("ownerId", userId))
      .collect();
    for (const row of terminalSessions) {
      await ctx.db.delete(row._id);
    }
    await record("workspaceTerminalSessions", terminalSessions.length);

    const runtimeEvents = await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_seq", (q) => q.eq("ownerId", userId))
      .collect();
    for (const row of runtimeEvents) {
      await ctx.db.delete(row._id);
    }
    await record("runtimeRunEvents", runtimeEvents.length);

    const runtimeRuns = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q) => q.eq("ownerId", userId))
      .collect();
    for (const row of runtimeRuns) {
      await ctx.db.delete(row._id);
    }
    await record("runtimeRuns", runtimeRuns.length);

    const cloudMessages = await ctx.db
      .query("cloudMessages")
      .withIndex("by_owner_messageKey", (q) => q.eq("ownerId", userId))
      .collect();
    for (const row of cloudMessages) {
      await ctx.db.delete(row._id);
    }
    await record("cloudMessages", cloudMessages.length);

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    for (const row of threads) {
      await ctx.db.delete(row._id);
    }
    await record("threads", threads.length);

    await record("cloudProjects", await deleteRowsByIndex(ctx, "cloudProjects", "by_owner", "ownerId", userId));

    const communityMessages = await ctx.db
      .query("communityChatMessages")
      .withIndex("by_sender", (q) => q.eq("senderUserId", userId))
      .collect();
    for (const row of communityMessages) {
      await ctx.db.delete(row._id);
    }
    await record("communityChatMessages", communityMessages.length);

    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `account_delete_completed:${userId}:${nowMs}`,
      eventType: "account_delete_completed",
      status: "succeeded",
      actorUserId: userId,
      subjectUserId: userId,
      provider: "polynet",
      metadata: { deleted },
      createdAt: nowMs,
    });

    await ctx.db.delete(userId);

    return {
      deleted,
    };
  },
});
