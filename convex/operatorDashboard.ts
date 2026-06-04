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

export const getCodexBridgeRunForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    ownerId: v.id("users"),
    runId: v.string(),
    threadId: v.optional(v.id("threads")),
    afterSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    const runId = String(args.runId ?? "").trim();
    if (!runId) throw new Error("codex_bridge_run_id_required");
    const run = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_runId", (q: any) => q.eq("ownerId", args.ownerId).eq("runId", runId))
      .first();
    if (!run) return null;
    if (args.threadId && run.threadId !== args.threadId) return null;
    if (String(run.contractName ?? "") !== "codex_blaxel_bridge") {
      throw new Error("codex_bridge_run_contract_mismatch");
    }
    if (String(run.visibility ?? "") !== "internal_hidden") {
      throw new Error("codex_bridge_run_visibility_mismatch");
    }

    const safeLimit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 120)));
    const afterSeq =
      typeof args.afterSeq === "number" && Number.isFinite(args.afterSeq)
        ? Math.max(0, Math.floor(args.afterSeq))
        : null;
    const rows = await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_owner_run_seq", (q: any) =>
        afterSeq === null
          ? q.eq("ownerId", args.ownerId).eq("runId", runId)
          : q.eq("ownerId", args.ownerId).eq("runId", runId).gt("seq", afterSeq),
      )
      .take(safeLimit);
    const events = rows
      .sort((a: any, b: any) => Number(a.seq ?? 0) - Number(b.seq ?? 0))
      .map((event: any) => ({
        id: String(event._id),
        run_id: String(event.runId ?? ""),
        seq: Math.max(0, Math.floor(Number(event.seq ?? 0))),
        event_type: String(event.eventType ?? ""),
        payload: event.payload ?? null,
        created_at: new Date(Number(event.createdAt ?? Date.now())).toISOString(),
      }));

    return {
      run: {
        id: String(run._id),
        run_id: String(run.runId ?? ""),
        thread_id: String(run.threadId ?? ""),
        owner_id: String(run.ownerId ?? ""),
        project_id: String(run.projectId ?? ""),
        community_id: run.communityId ? String(run.communityId) : null,
        status: String(run.status ?? ""),
        error_code: run.errorCode ? String(run.errorCode) : null,
        error_message: run.errorMessage ? String(run.errorMessage) : null,
        started_at: new Date(Number(run.startedAt ?? Date.now())).toISOString(),
        updated_at: new Date(Number(run.updatedAt ?? Date.now())).toISOString(),
        last_event_seq: Math.max(0, Math.floor(Number(run.lastEventSeq ?? 0))),
      },
      events,
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
