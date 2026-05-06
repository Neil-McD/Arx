import { v } from "convex/values";
import { internal } from "./_generated/api";
import { query } from "./_generated/server";
import { requireOperatorRole } from "./operatorAccess";

const operatorRange = v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all")));
const operatorSeverity = v.optional(v.union(v.literal("info"), v.literal("warning"), v.literal("error")));

async function requireOperatorAccess(ctx: any, authSubject: string | null | undefined) {
  return await requireOperatorRole(ctx, authSubject, "readonly");
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

export const listOperatorBuilders = query({
  args: {
    authSubject: v.optional(v.string()),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    await requireOperatorAccess(ctx, args.authSubject);
    return await ctx.runQuery((internal as any).operatorIntelligence.listOperatorBuildersInternal, {
      query: args.query,
      limit: args.limit,
    });
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
