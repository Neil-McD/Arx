import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { requireOperatorRole } from "./operatorAccess";

const operatorRange = v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all")));
const operatorSeverity = v.optional(v.union(v.literal("info"), v.literal("warning"), v.literal("error")));
const accountSetupStep = v.optional(
  v.union(
    v.literal("identity"),
    v.literal("inference"),
    v.literal("agent"),
    v.literal("direction"),
    v.literal("complete"),
  ),
);

async function requireOperatorAccess(ctx: any, authSubject: string | null | undefined) {
  return await requireOperatorRole(ctx, authSubject, "readonly");
}

async function requireOperatorWriteAccess(ctx: any, authSubject: string | null | undefined) {
  return await requireOperatorRole(ctx, authSubject, "operator");
}

export const getOperatorAccess = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ userId: string; email: string | null; displayName: string | null; role: string; source: string }> => {
    const operator = await requireOperatorAccess(ctx, args.authSubject);
    return {
      userId: operator.userId,
      email: operator.email,
      displayName: operator.displayName,
      role: operator.role,
      source: operator.source,
    };
  },
});

export const getOperatorOverview = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorOverviewInternal, {
      range: args.range,
    });
  },
});

export const listOperatorCommunities = query({
  args: {
    authSubject: v.optional(v.string()),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.listOperatorCommunitiesInternal, {
      query: args.query,
      limit: args.limit,
    });
  },
});

export const getOperatorAccountSetupSnapshot = query({
  args: {
    authSubject: v.optional(v.string()),
    query: v.optional(v.string()),
    currentStep: accountSetupStep,
    completed: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorAccountSetupSnapshotInternal, {
      query: args.query,
      currentStep: args.currentStep,
      completed: args.completed,
      limit: args.limit,
    });
  },
});

export const listDeveloperAppPolicyAudit = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.listOperatorDeveloperAppPolicyAuditInternal, {
      limit: args.limit,
    });
  },
});

export const listHarnessAppSourceProvenanceAudit = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
    maxPairs: v.optional(v.number()),
    maxCommunityAppMounts: v.optional(v.number()),
    maxRecipientsPerCommunity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).userPlatformAppMounts.listCommunityAppSourceProvenanceAuditInternal, {
      limit: args.limit,
      maxPairs: args.maxPairs,
      maxCommunityAppMounts: args.maxCommunityAppMounts,
      maxRecipientsPerCommunity: args.maxRecipientsPerCommunity,
    });
  },
});

export const backfillHarnessAppSourceProvenance = mutation({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
    maxPairs: v.optional(v.number()),
    maxCommunityAppMounts: v.optional(v.number()),
    maxRecipientsPerCommunity: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const operator = await requireOperatorWriteAccess(ctx, args.authSubject);
    const startedAt = Date.now();
    const dryRun = args.dryRun !== false;
    try {
      const result = await ctx.runMutation((internal as any).userPlatformAppMounts.backfillCommunityAppSourceProvenanceInternal, {
        limit: args.limit,
        maxPairs: args.maxPairs,
        maxCommunityAppMounts: args.maxCommunityAppMounts,
        maxRecipientsPerCommunity: args.maxRecipientsPerCommunity,
        dryRun: args.dryRun,
      });
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `harness_app_source_provenance_backfill:${String(operator.dbUserId)}:${startedAt}`,
        eventType: "harness_app_source_provenance_backfill",
        severity: dryRun ? "info" : "warning",
        status: "succeeded",
        actorUserId: operator.dbUserId,
        provider: "polynet",
        metadata: {
          dryRun: Boolean(result?.dry_run ?? dryRun),
          limit: result?.limits?.findingLimit,
          maxPairs: result?.limits?.maxPairs,
          maxCommunityAppMounts: result?.limits?.maxCommunityAppMounts,
          maxRecipientsPerCommunity: result?.limits?.maxRecipientsPerCommunity,
          communityAppMountsScanned: result?.summary?.communityAppMountsScanned,
          disabledCommunityAppMountsSkipped: result?.summary?.disabledCommunityAppMountsSkipped,
          recipientPairsScanned: result?.summary?.recipientPairsScanned,
          existingCommunitySourcePairs: result?.summary?.existingCommunitySourcePairs,
          missingCommunitySourcePairs: result?.summary?.missingCommunitySourcePairs,
          missingUserHarnessAppPairs: result?.summary?.missingUserHarnessAppPairs,
          missingCommunityRecords: result?.summary?.missingCommunityRecords,
          missingDeveloperAppRecords: result?.summary?.missingDeveloperAppRecords,
          repairedCommunitySourcePairs: result?.summary?.repairedCommunitySourcePairs,
          truncated: Boolean(result?.truncated),
        },
        createdAt: startedAt,
      });
      return result;
    } catch (error) {
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `harness_app_source_provenance_backfill:${String(operator.dbUserId)}:${startedAt}`,
        eventType: "harness_app_source_provenance_backfill",
        severity: "error",
        status: "failed",
        actorUserId: operator.dbUserId,
        provider: "polynet",
        metadata: {
          dryRun,
          limit: args.limit,
          maxPairs: args.maxPairs,
          maxCommunityAppMounts: args.maxCommunityAppMounts,
          maxRecipientsPerCommunity: args.maxRecipientsPerCommunity,
          errorMessage: error instanceof Error ? error.message : String(error ?? ""),
        },
        createdAt: startedAt,
      });
      throw error;
    }
  },
});

export const backfillCommunityMembershipActiveFlags = mutation({
  args: {
    authSubject: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
    maxPatches: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const operator = await requireOperatorWriteAccess(ctx, args.authSubject);
    const startedAt = Date.now();
    const dryRun = args.dryRun !== false;
    const maxPatches = Math.max(1, Math.min(5000, Math.floor(args.maxPatches ?? 500)));
    try {
      const rows = (await ctx.db.query("communityMemberships").collect()) as Array<{
        _id: any;
        active?: boolean;
        revokedAt?: number;
      }>;
      const missingActiveRows = rows.filter((row) => typeof row.active !== "boolean");
      const patchRows = missingActiveRows.slice(0, maxPatches);
      let markedActive = 0;
      let markedInactive = 0;
      if (!dryRun) {
        for (const row of patchRows) {
          const isRevoked = typeof row.revokedAt === "number" && row.revokedAt > 0;
          await ctx.db.patch(row._id, {
            active: !isRevoked,
          });
          if (isRevoked) markedInactive += 1;
          else markedActive += 1;
        }
      } else {
        for (const row of patchRows) {
          if (typeof row.revokedAt === "number" && row.revokedAt > 0) markedInactive += 1;
          else markedActive += 1;
        }
      }
      const result = {
        dry_run: dryRun,
        scanned_memberships: rows.length,
        missing_active_flags: missingActiveRows.length,
        patch_limit: maxPatches,
        would_mark_active: markedActive,
        would_mark_inactive: markedInactive,
        repaired: dryRun ? 0 : patchRows.length,
        truncated: missingActiveRows.length > patchRows.length,
      };
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `community_membership_active_flags_backfill:${String(operator.dbUserId)}:${startedAt}`,
        eventType: "community_membership_active_flags_backfill",
        severity: dryRun ? "info" : "warning",
        status: "succeeded",
        actorUserId: operator.dbUserId,
        provider: "polynet",
        metadata: result,
        createdAt: startedAt,
      });
      return result;
    } catch (error) {
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `community_membership_active_flags_backfill:${String(operator.dbUserId)}:${startedAt}`,
        eventType: "community_membership_active_flags_backfill",
        severity: "error",
        status: "failed",
        actorUserId: operator.dbUserId,
        provider: "polynet",
        metadata: {
          dryRun,
          maxPatches,
          errorMessage: error instanceof Error ? error.message : String(error ?? ""),
        },
        createdAt: startedAt,
      });
      throw error;
    }
  },
});

export const getOperatorMonetization = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorMonetizationInternal, {
      range: args.range,
    });
  },
});

export const getOperatorWebDeployDiagnostics = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorWebDeployDiagnosticsInternal, {
      range: args.range,
    });
  },
});

export const getOperatorAuthAccessDiagnostics = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorAuthAccessDiagnosticsInternal, {
      range: args.range,
    });
  },
});

export const getOperatorSecurityAuditDiagnostics = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorSecurityAuditDiagnosticsInternal, {
      range: args.range,
    });
  },
});

export const getOperatorRuntimeToolDiagnostics = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorRuntimeToolDiagnosticsInternal, {
      range: args.range,
    });
  },
});

export const getOperatorToolEconomics = query({
  args: {
    authSubject: v.optional(v.string()),
    range: operatorRange,
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.getOperatorToolEconomicsInternal, {
      range: args.range,
    });
  },
});

export const listOperatorRisks = query({
  args: {
    authSubject: v.optional(v.string()),
    severity: v.optional(v.union(v.literal("warning"), v.literal("error"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.listOperatorRisksInternal, {
      severity: args.severity,
      limit: args.limit,
    });
  },
});

export const listOperatorEvents = query({
  args: {
    authSubject: v.optional(v.string()),
    eventType: v.optional(v.string()),
    severity: operatorSeverity,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.listOperatorEventsInternal, {
      eventType: args.eventType,
      severity: args.severity,
      limit: args.limit,
    });
  },
});

export const listCommunityAccessStateAuditFindings = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).communityAccessAudit.listCommunityAccessStateAuditFindingsInternal, {
      limit: args.limit,
    });
  },
});
