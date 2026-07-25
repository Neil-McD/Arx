import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const ACKNOWLEDGEMENT = "delete_routine_success_diagnostics_v1" as const;
const RETIRED_EVENT_TYPES = [
  "auth.session_established",
  "auth.session_refreshed",
  "auth.session_logged_out",
  "access.operator_access_granted",
] as const;

function normalizeDeleteLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 500;
  return Math.min(500, Math.max(1, Math.floor(value as number)));
}

function normalizeAuditLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1_000;
  return Math.min(5_000, Math.max(1, Math.floor(value as number)));
}

export const auditRoutineSuccessDiagnosticsInternal = internalQuery({
  args: {
    acknowledgement: v.literal(ACKNOWLEDGEMENT),
    perTypeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const perTypeLimit = normalizeAuditLimit(args.perTypeLimit);
    const counts: Record<string, { observed: number; truncated: boolean }> = {};
    for (const eventType of RETIRED_EVENT_TYPES) {
      const rows = await ctx.db
        .query("platformDiagnosticEvents")
        .withIndex("by_type_createdAt", (q) => q.eq("eventType", eventType))
        .take(perTypeLimit + 1);
      counts[eventType] = {
        observed: Math.min(rows.length, perTypeLimit),
        truncated: rows.length > perTypeLimit,
      };
    }
    return {
      retiredEventTypes: RETIRED_EVENT_TYPES,
      perTypeLimit,
      counts,
    };
  },
});

export const deleteRoutineSuccessDiagnosticsInternal = internalMutation({
  args: {
    acknowledgement: v.literal(ACKNOWLEDGEMENT),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeDeleteLimit(args.limit);
    let remaining = limit;
    const deletedByType: Record<string, number> = {};

    for (const eventType of RETIRED_EVENT_TYPES) {
      if (remaining <= 0) break;
      const rows = await ctx.db
        .query("platformDiagnosticEvents")
        .withIndex("by_type_createdAt", (q) => q.eq("eventType", eventType))
        .take(remaining);
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      deletedByType[eventType] = rows.length;
      remaining -= rows.length;
    }

    const deleted = limit - remaining;
    const continuationScheduled = deleted === limit;
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).c4RoutineSuccessDiagnosticCleanup.deleteRoutineSuccessDiagnosticsInternal,
        {
          acknowledgement: ACKNOWLEDGEMENT,
          limit,
        },
      );
    }

    return {
      retiredEventTypes: RETIRED_EVENT_TYPES,
      deleted,
      deletedByType,
      limit,
      continuationScheduled,
      doneForNow: !continuationScheduled,
    };
  },
});
