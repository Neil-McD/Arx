import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { ensureAuthenticatedActor } from "./authActor";

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

function isActiveBuilderEntitlement(row: any, nowMs: number): boolean {
  if (!row || row.source !== "stripe") return false;
  if (row.tier !== "builder" && row.tier !== "architect") return false;
  if (typeof row.endsAt === "number" && row.endsAt <= nowMs) return false;
  return true;
}

function isActiveCommunitySubscription(row: any): boolean {
  return row?.status === "active" || row?.status === "past_due" || row?.status === "cancel_at_period_end";
}

function hasPayoutAccountState(row: any): boolean {
  return Boolean(row);
}

async function assertAccountDeletionAllowed(ctx: any, userId: any, nowMs: number) {
  const ownedCommunity = await ctx.db
    .query("communities")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
    .first();
  if (ownedCommunity) {
    throw new Error("account_delete_owned_communities_blocked");
  }

  const entitlements = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (entitlements.some((row: any) => isActiveBuilderEntitlement(row, nowMs))) {
    throw new Error("account_delete_active_builder_subscription_blocked");
  }

  const communitySubscriptions = await ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (communitySubscriptions.some(isActiveCommunitySubscription)) {
    throw new Error("account_delete_active_community_subscription_blocked");
  }

  const stripeConnectAccounts = await ctx.db
    .query("userStripeConnectAccounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (stripeConnectAccounts.some(hasPayoutAccountState)) {
    throw new Error("account_delete_active_payout_account_blocked");
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
      throw new Error("account_delete_mounted_apps_blocked");
    }
    const otherUserMounts = await ctx.db
      .query("userPlatformAppMounts")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", app._id))
      .collect();
    if (otherUserMounts.some((mount: any) => mount.userId !== userId)) {
      throw new Error("account_delete_mounted_apps_blocked");
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
      throw new Error("account_delete_attached_skills_blocked");
    }
    const otherUserInstalls = await ctx.db
      .query("userPlatformSkillInstalls")
      .withIndex("by_skill", (q: any) => q.eq("skillPackageId", skill._id))
      .collect();
    if (otherUserInstalls.some((install: any) => install.userId !== userId)) {
      throw new Error("account_delete_attached_skills_blocked");
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

    await assertAccountDeletionAllowed(ctx, userId, nowMs);

    const deleted: Record<string, number> = {};
    const record = async (tableName: string, count: number) => {
      deleted[tableName] = (deleted[tableName] ?? 0) + count;
    };

    await record("authSessions", await deleteRowsByIndex(ctx, "authSessions", "by_user", "userId", userId));
    await record("userEntitlements", await deleteRowsByIndex(ctx, "userEntitlements", "by_user", "userId", userId));
    await record("userStripeConnectAccounts", await deleteRowsByIndex(ctx, "userStripeConnectAccounts", "by_user", "userId", userId));
    await record("workspaceCreditBalances", await deleteRowsByIndex(ctx, "workspaceCreditBalances", "by_user", "userId", userId));
    await record("workspaceComputeCharges", await deleteRowsByIndex(ctx, "workspaceComputeCharges", "by_user", "userId", userId));
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
    await record("userPlatformAppMounts", await deleteRowsByIndex(ctx, "userPlatformAppMounts", "by_user", "userId", userId));
    await record("userPlatformSkillInstalls", await deleteRowsByIndex(ctx, "userPlatformSkillInstalls", "by_user", "userId", userId));
    await record("communityAiFeedReactions", await deleteRowsByIndex(ctx, "communityAiFeedReactions", "by_actorUser", "actorUserId", userId));

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

    await ctx.db.delete(userId);

    return {
      deleted,
    };
  },
});
