import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { ensureAuthenticatedActor } from "./authActor";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";

type AccountDeleteBlockerCode =
  | "account_delete_owned_communities_blocked"
  | "account_delete_active_community_subscription_blocked"
  | "account_delete_active_payout_account_blocked"
  | "account_delete_partner_finance_pending_blocked"
  | "account_delete_mounted_apps_blocked"
  | "account_delete_attached_skills_blocked";

const accountDeleteBlockerCodes = new Set<string>([
  "account_delete_owned_communities_blocked",
  "account_delete_active_community_subscription_blocked",
  "account_delete_active_payout_account_blocked",
  "account_delete_partner_finance_pending_blocked",
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

async function listRowsByPartnerStatus(ctx: any, tableName: string, partnerId: any, statuses: string[]) {
  const groups = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query(tableName)
        .withIndex("by_partner_status", (q: any) => q.eq("partnerId", partnerId).eq("status", status))
        .collect(),
    ),
  );
  return groups.flat();
}

function roundSignedPartnerFinanceUsd(value: number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.round(normalized * 10000) / 10000;
}

function signedPartnerFinanceUsdToCents(amountUsd: number): number {
  const normalized = roundSignedPartnerFinanceUsd(Number(amountUsd ?? 0));
  if (!Number.isFinite(normalized)) return 0;
  if (normalized > 0) return Math.floor(normalized * 100 + 0.000001);
  if (normalized < 0) return Math.ceil(normalized * 100 - 0.000001);
  return 0;
}

async function readBuilderPartnerFinanceDeletionState(ctx: any, partner: any) {
  const commissionRows = await listRowsByPartnerStatus(ctx, "partnerCommissionLedger", partner._id, [
    "locked",
    "risk_hold",
    "payable",
    "voided",
  ]);
  const [adjustments, payoutItems, payoutTransfers] = await Promise.all([
    ctx.db
      .query("partnerCommissionAdjustments" as any)
      .withIndex("by_partner_createdAt", (q: any) => q.eq("partnerId", partner._id))
      .collect(),
    ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_partner_createdAt", (q: any) => q.eq("partnerId", partner._id))
      .collect(),
    ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_partner_createdAt", (q: any) => q.eq("partnerId", partner._id))
      .collect(),
  ]);
  const adjustmentTotalByCommissionId = new Map<string, number>();
  for (const adjustment of adjustments) {
    if (adjustment.status !== "applied") continue;
    const commissionId = String(adjustment.commissionId ?? "");
    adjustmentTotalByCommissionId.set(
      commissionId,
      roundSignedPartnerFinanceUsd(
        Number(adjustmentTotalByCommissionId.get(commissionId) ?? 0) +
          Number(adjustment.amountUsd ?? 0),
      ),
    );
  }
  const reservedOrSettledPayoutTotalByCommissionId = new Map<string, number>();
  for (const item of payoutItems) {
    if (item.status !== "reserved" && item.status !== "settled") continue;
    const commissionId = String(item.commissionId ?? "");
    reservedOrSettledPayoutTotalByCommissionId.set(
      commissionId,
      roundSignedPartnerFinanceUsd(
        Number(reservedOrSettledPayoutTotalByCommissionId.get(commissionId) ?? 0) +
          Number(item.amountUsd ?? 0),
      ),
    );
  }
  const unresolvedCommissionRows = commissionRows.filter((row: any) => {
    if (row.status === "voided") return false;
    const netCents = signedPartnerFinanceUsdToCents(
      Number(row.commissionAmountUsd ?? 0) +
        Number(adjustmentTotalByCommissionId.get(String(row._id)) ?? 0) -
        Number(reservedOrSettledPayoutTotalByCommissionId.get(String(row._id)) ?? 0),
    );
    return netCents !== 0;
  });
  const reservedPayoutItems = payoutItems.filter((row: any) => row.status === "reserved");
  const inFlightPayoutTransfers = payoutTransfers.filter((row: any) => row.status === "processing");
  const financeAttributionIds = new Set<string>();
  for (const row of commissionRows) {
    if (row.attributionId) financeAttributionIds.add(String(row.attributionId));
  }
  return {
    hasFinanceHistory:
      commissionRows.length > 0 ||
      adjustments.length > 0 ||
      payoutItems.length > 0 ||
      payoutTransfers.length > 0,
    hasUnresolvedFinance:
      unresolvedCommissionRows.length > 0 ||
      reservedPayoutItems.length > 0 ||
      inFlightPayoutTransfers.length > 0,
    financeAttributionIds,
  };
}

async function listPartnerAttributions(ctx: any, partnerId: any) {
  return await listRowsByPartnerStatus(ctx, "partnerAttributions", partnerId, [
    "active",
    "bound",
    "expired",
    "voided",
  ]);
}

async function scrubFinanceLinkedPartnerAttribution(ctx: any, attribution: any, nowMs: number) {
  await ctx.db.patch(attribution._id, {
    anonymousVisitorKeyHash: undefined,
    firstTouchUrl: undefined,
    lastTouchUrl: undefined,
    status:
      attribution.status === "active" || attribution.status === "bound"
        ? "voided"
        : attribution.status,
    voidReason:
      attribution.status === "active" || attribution.status === "bound"
        ? "account_deleted"
        : attribution.voidReason,
    updatedAt: nowMs,
  });
}

function tombstoneBuilderPartnerCode(partner: any): string {
  const raw = String(partner?._id ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `deleted-${raw.slice(-40) || "partner"}`;
}

function isActiveCommunitySubscription(row: any): boolean {
  return row?.status === "active" || row?.status === "past_due" || row?.status === "cancel_at_period_end";
}

function hasBlockingPayoutAccountState(row: any): boolean {
  if (!row) return false;
  return (
    row.status === "ready" ||
    row.detailsSubmitted === true ||
    row.chargesEnabled === true ||
    row.payoutsEnabled === true ||
    Number.isFinite(row.onboardingCompleteAt)
  );
}

async function listLiveCommunityAppMountRowsForApp(ctx: any, developerAppId: any) {
  const mounts = await ctx.db
    .query("communityAppMounts")
    .withIndex("by_app", (q: any) => q.eq("developerAppId", developerAppId))
    .collect();
  const liveMounts: any[] = [];
  for (const mount of mounts) {
    const community = await ctx.db.get(mount.communityId);
    if (community) liveMounts.push(mount);
  }
  return liveMounts;
}

async function deleteOrphanCommunityAppMountRowsForApp(ctx: any, developerAppId: any) {
  const mounts = await ctx.db
    .query("communityAppMounts")
    .withIndex("by_app", (q: any) => q.eq("developerAppId", developerAppId))
    .collect();
  const deleted = {
    communityAppMounts: 0,
    userPlatformAppMountSources: 0,
  };
  for (const mount of mounts) {
    const community = await ctx.db.get(mount.communityId);
    if (community) continue;
    deleted.userPlatformAppMountSources += await deleteRowsByIndex(
      ctx,
      "userPlatformAppMountSources",
      "by_community_mount",
      "communityAppMountId",
      mount._id,
    );
    await ctx.db.delete(mount._id);
    deleted.communityAppMounts += 1;
  }
  return deleted;
}

async function listLiveCommunitySkillAttachmentRowsForSkill(ctx: any, skillPackageId: any) {
  const attachments = await ctx.db
    .query("communitySkillAttachments")
    .withIndex("by_skill", (q: any) => q.eq("skillPackageId", skillPackageId))
    .collect();
  const liveAttachments: any[] = [];
  for (const attachment of attachments) {
    const community = await ctx.db.get(attachment.communityId);
    if (community) liveAttachments.push(attachment);
  }
  return liveAttachments;
}

async function deleteOrphanCommunitySkillAttachmentRowsForSkill(ctx: any, skillPackageId: any) {
  const attachments = await ctx.db
    .query("communitySkillAttachments")
    .withIndex("by_skill", (q: any) => q.eq("skillPackageId", skillPackageId))
    .collect();
  let deleted = 0;
  for (const attachment of attachments) {
    const community = await ctx.db.get(attachment.communityId);
    if (community) continue;
    await ctx.db.delete(attachment._id);
    deleted += 1;
  }
  return deleted;
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
  if (stripeConnectAccounts.some(hasBlockingPayoutAccountState)) {
    throwAccountDeleteBlocker("account_delete_active_payout_account_blocked");
  }

  const builderPartners = await ctx.db
    .query("builderPartners")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  for (const partner of builderPartners) {
    const financeState = await readBuilderPartnerFinanceDeletionState(ctx, partner);
    if (financeState.hasUnresolvedFinance) {
      throwAccountDeleteBlocker("account_delete_partner_finance_pending_blocked");
    }
  }

  const developerApps = await ctx.db
    .query("developerApps")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId))
    .collect();
  for (const app of developerApps) {
    const liveCommunityMounts = await listLiveCommunityAppMountRowsForApp(ctx, app._id);
    if (liveCommunityMounts.length > 0) {
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
    const liveCommunityAttachments = await listLiveCommunitySkillAttachmentRowsForSkill(ctx, skill._id);
    if (liveCommunityAttachments.length > 0) {
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
    const preserved: Record<string, number> = {};
    const preserve = async (tableName: string, count: number) => {
      preserved[tableName] = (preserved[tableName] ?? 0) + count;
    };

    const referredPartnerCommissions = await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_referredUser", (q: any) => q.eq("referredUserId", userId))
      .collect();
    const financeLinkedReferredAttributionIds = new Set<string>();
    for (const commission of referredPartnerCommissions) {
      if (commission.attributionId) financeLinkedReferredAttributionIds.add(String(commission.attributionId));
    }

    await record("authSessions", await deleteRowsByIndex(ctx, "authSessions", "by_user", "userId", userId));
    await record("userEntitlements", await deleteRowsByIndex(ctx, "userEntitlements", "by_user", "userId", userId));
    await record("userStripeConnectAccounts", await deleteRowsByIndex(ctx, "userStripeConnectAccounts", "by_user", "userId", userId));
    await record("workspaceCreditBalances", await deleteRowsByIndex(ctx, "workspaceCreditBalances", "by_user", "userId", userId));
    await record("workspaceComputeCharges", await deleteRowsByIndex(ctx, "workspaceComputeCharges", "by_user", "userId", userId));
    await record("workspaceUsageCollections", await deleteRowsByIndex(ctx, "workspaceUsageCollections", "by_user_createdAt", "userId", userId));
    const creditLedgerEntries = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .collect();
    for (const entry of creditLedgerEntries) {
      await ctx.db.delete(entry._id);
      await record("creditLedgerEntries", 1);
    }
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
    await record("dmTypingPresence", await deleteRowsByIndex(ctx, "dmTypingPresence", "by_user", "userId", userId));
    await record("communityMemberSettings", await deleteRowsByIndex(ctx, "communityMemberSettings", "by_user", "userId", userId));
    await record("communityResources", await deleteRowsByIndex(ctx, "communityResources", "by_createdBy", "createdByUserId", userId));
    await record("communityEvents", await deleteRowsByIndex(ctx, "communityEvents", "by_createdBy", "createdByUserId", userId));
    await record("userPlatformAppMountSources", await deleteRowsByIndex(ctx, "userPlatformAppMountSources", "by_user_mount", "userId", userId));
    await record("userPlatformAppMounts", await deleteRowsByIndex(ctx, "userPlatformAppMounts", "by_user", "userId", userId));
    await record("userPlatformSkillInstalls", await deleteRowsByIndex(ctx, "userPlatformSkillInstalls", "by_user", "userId", userId));
    await record("communityAiFeedReactions", await deleteRowsByIndex(ctx, "communityAiFeedReactions", "by_actorUser", "actorUserId", userId));
    const referredAttributions = await ctx.db
      .query("partnerAttributions")
      .withIndex("by_referredUser", (q: any) => q.eq("referredUserId", userId))
      .collect();
    for (const attribution of referredAttributions) {
      if (financeLinkedReferredAttributionIds.has(String(attribution._id))) {
        await scrubFinanceLinkedPartnerAttribution(ctx, attribution, nowMs);
        await preserve("partnerAttributions", 1);
        continue;
      }
      await ctx.db.delete(attribution._id);
      await record("partnerAttributions", 1);
    }
    await preserve("partnerCommissionLedger", referredPartnerCommissions.length);

    const builderPartners = await ctx.db
      .query("builderPartners")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const partner of builderPartners) {
      const financeState = await readBuilderPartnerFinanceDeletionState(ctx, partner);
      if (financeState.hasUnresolvedFinance) {
        throwAccountDeleteBlocker("account_delete_partner_finance_pending_blocked");
      }
      const attributions = await listPartnerAttributions(ctx, partner._id);
      for (const attribution of attributions) {
        if (financeState.financeAttributionIds.has(String(attribution._id))) {
          await scrubFinanceLinkedPartnerAttribution(ctx, attribution, nowMs);
          await preserve("partnerAttributions", 1);
          continue;
        }
        await ctx.db.delete(attribution._id);
        await record("partnerAttributions", 1);
      }
      if (financeState.hasFinanceHistory) {
        await ctx.db.patch(partner._id, {
          code: tombstoneBuilderPartnerCode(partner),
          status: "disabled",
          disabledReason: "account_deleted",
          updatedAt: nowMs,
        });
        await preserve("builderPartners", 1);
        continue;
      }
      await ctx.db.delete(partner._id);
      await record("builderPartners", 1);
    }

    const developerApps = await ctx.db
      .query("developerApps")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    for (const app of developerApps) {
      const staleCommunityMountDeletes = await deleteOrphanCommunityAppMountRowsForApp(ctx, app._id);
      await record("appConnections", await deleteRowsByIndex(ctx, "appConnections", "by_app", "developerAppId", app._id));
      await record("appToolSnapshots", await deleteRowsByIndex(ctx, "appToolSnapshots", "by_app", "developerAppId", app._id));
      await record("userPlatformAppMountSources", staleCommunityMountDeletes.userPlatformAppMountSources);
      await record("communityAppMounts", staleCommunityMountDeletes.communityAppMounts);
      await record("developerApps", 1);
      await ctx.db.delete(app._id);
    }

    const skillPackages = await ctx.db
      .query("skillPackages")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    for (const skill of skillPackages) {
      await record("skillPackageRevisions", await deleteRowsByIndex(ctx, "skillPackageRevisions", "by_skill", "skillPackageId", skill._id));
      await record("communitySkillAttachments", await deleteOrphanCommunitySkillAttachmentRowsForSkill(ctx, skill._id));
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

    const memberAgentChannels = await ctx.db
      .query("memberAgentChannels")
      .withIndex("by_owner_community", (q) => q.eq("ownerId", userId))
      .collect();
    let deletedMemberAgentEpisodes = 0;
    for (const channel of memberAgentChannels) {
      const episodes = await ctx.db
        .query("memberAgentEpisodes")
        .withIndex("by_channel_ordinal", (q) => q.eq("channelId", channel._id))
        .collect();
      for (const episode of episodes) {
        await ctx.db.delete(episode._id);
        deletedMemberAgentEpisodes += 1;
      }
      await ctx.db.delete(channel._id);
    }
    await record("memberAgentEpisodes", deletedMemberAgentEpisodes);
    await record("memberAgentChannels", memberAgentChannels.length);

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    for (const row of threads) {
      await ctx.db.delete(row._id);
    }
    await record("threads", threads.length);

    const dmParticipantRows = [
      ...(await ctx.db
        .query("dmParticipants")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .collect()),
      ...(await ctx.db
        .query("dmParticipants")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "left"))
        .collect()),
    ];
    const dmConversationIds = Array.from(new Set(dmParticipantRows.map((row) => String(row.conversationId))));
    let deletedDmMessages = 0;
    let deletedDmParticipants = 0;
    let deletedDmConversations = 0;
    let deletedDmTypingPresence = 0;
    for (const conversationId of dmConversationIds) {
      const messages = await ctx.db
        .query("dmMessages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId as any))
        .collect();
      for (const row of messages) {
        await ctx.db.delete(row._id);
      }
      deletedDmMessages += messages.length;

      const participants = await ctx.db
        .query("dmParticipants")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId as any))
        .collect();
      for (const row of participants) {
        await ctx.db.delete(row._id);
      }
      deletedDmParticipants += participants.length;

      const typingRows = await ctx.db
        .query("dmTypingPresence")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId as any))
        .collect();
      for (const row of typingRows) {
        await ctx.db.delete(row._id);
      }
      deletedDmTypingPresence += typingRows.length;

      const conversation = await ctx.db.get(conversationId as any);
      if (conversation) {
        await ctx.db.delete(conversation._id);
        deletedDmConversations += 1;
      }
    }
    await record("dmMessages", deletedDmMessages);
    await record("dmParticipants", deletedDmParticipants);
    await record("dmTypingPresence", deletedDmTypingPresence);
    await record("dmConversations", deletedDmConversations);

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
      metadata: { deleted, preserved },
      createdAt: nowMs,
    });

    await ctx.db.delete(userId);

    return {
      deleted,
    };
  },
});
