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
    v.literal("complete"),
  ),
);

async function requireOperatorAccess(ctx: any, authSubject: string | null | undefined) {
  return await requireOperatorRole(ctx, authSubject, "readonly");
}

async function requireOperatorWriteAccess(ctx: any, authSubject: string | null | undefined) {
  return await requireOperatorRole(ctx, authSubject, "operator");
}

function isExpectedOperatorAccessProbeMiss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("operator_access_forbidden") ||
    normalized.includes("auth") ||
    normalized.includes("identity")
  );
}

export const getOperatorAccess = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ userId: string; email: string | null; displayName: string | null; role: string; source: string } | null> => {
    try {
      const operator = await requireOperatorAccess(ctx, args.authSubject);
      return {
        userId: operator.userId,
        email: operator.email,
        displayName: operator.displayName,
        role: operator.role,
        source: operator.source,
      };
    } catch (error) {
      if (isExpectedOperatorAccessProbeMiss(error)) return null;
      throw error;
    }
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
