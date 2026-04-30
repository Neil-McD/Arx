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

async function deleteRowsByFieldScan(ctx: any, tableName: string, fieldName: string, value: any) {
  const rows = await ctx.db.query(tableName).collect();
  const matches = rows.filter((row: any) => row[fieldName] === value);
  for (const row of matches) {
    await ctx.db.delete(row._id);
  }
  return matches.length;
}

export const deleteOwnAccount = mutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
      nowMs: Date.now(),
    });
    const userId = actor.dbUserId;

    const ownedCommunity = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (ownedCommunity) {
      throw new Error("account_delete_owned_communities_blocked");
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
    await record("communityTypingPresence", await deleteRowsByFieldScan(ctx, "communityTypingPresence", "userId", userId));
    await record("communityMemberSettings", await deleteRowsByIndex(ctx, "communityMemberSettings", "by_user", "userId", userId));
    await record("communityResources", await deleteRowsByIndex(ctx, "communityResources", "by_createdBy", "createdByUserId", userId));
    await record("userPlatformAppMounts", await deleteRowsByIndex(ctx, "userPlatformAppMounts", "by_user", "userId", userId));
    await record("userPlatformSkillInstalls", await deleteRowsByIndex(ctx, "userPlatformSkillInstalls", "by_user", "userId", userId));
    await record("communityAiFeedReactions", await deleteRowsByFieldScan(ctx, "communityAiFeedReactions", "actorUserId", userId));

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
