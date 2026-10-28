import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveAuthenticatedActor } from "./authActor";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { recordPlatformDiagnosticEventBestEffort } from "./platformDiagnostics";

const OPERATOR_ROLE_VALIDATOR = v.union(v.literal("owner"), v.literal("operator"), v.literal("readonly"));

type OperatorRole = "owner" | "operator" | "readonly";

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAccessErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("operator_access_forbidden")) return "operator_access_forbidden";
  if (normalized.includes("auth") || normalized.includes("identity")) return "auth_required";
  return normalized.replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 96) || "operator_access_failed";
}

function roleRank(role: OperatorRole): number {
  switch (role) {
    case "owner":
      return 3;
    case "operator":
      return 2;
    case "readonly":
      return 1;
  }
}

async function readOperatorRole(ctx: any, actor: { dbUserId: unknown; email: string | null | undefined }) {
  const userRole = await ctx.db
    .query("operatorRoles")
    .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
    .first();
  if (userRole?.active) return userRole;
  if (userRole) return null;

  const normalizedEmail = normalizeEmail(actor.email);
  if (normalizedEmail) {
    const emailRoles = await ctx.db
      .query("operatorRoles")
      .withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", normalizedEmail))
      .collect();
    const activeEmailRole = emailRoles.find((roleRow: any) => roleRow.active);
    if (activeEmailRole) return activeEmailRole;
  }
  return null;
}

async function readOperatorAccess(
  ctx: any,
  authSubject: string | null | undefined,
  minimumRole: OperatorRole = "readonly",
) {
  const actor = await resolveAuthenticatedActor({
    ctx,
    authSubject: authSubject ?? null,
  });
  const roleRow = await readOperatorRole(ctx, actor);
  const role = (roleRow?.role ?? null) as OperatorRole | null;

  if (!role || roleRank(role) < roleRank(minimumRole)) {
    return null;
  }

  return {
    userId: String(actor.dbUserId),
    dbUserId: actor.dbUserId,
    email: actor.email ?? null,
    displayName: actor.displayName ?? null,
    role,
    source: "operator_role",
  };
}

function toOperatorAccessSnapshot(operator: Awaited<ReturnType<typeof readOperatorAccess>>) {
  if (!operator) return null;
  return {
    userId: operator.userId,
    email: operator.email,
    displayName: operator.displayName,
    role: operator.role,
    source: operator.source,
  };
}

export async function requireOperatorRole(
  ctx: any,
  authSubject: string | null | undefined,
  minimumRole: OperatorRole = "readonly",
) {
  const operator = await readOperatorAccess(ctx, authSubject, minimumRole);
  if (!operator) {
    throw new Error("operator_access_forbidden");
  }
  return operator;
}

async function recordOperatorAudit(
  ctx: any,
  input: {
    eventType: string;
    status: "succeeded" | "blocked";
    actorUserId?: unknown;
    subjectUserId?: unknown;
    metadata?: unknown;
  },
) {
  const nowMs = Date.now();
  await recordCriticalAuditEventBestEffort(ctx, {
    eventKey: `${input.eventType}:${input.status}:${String(input.actorUserId ?? "unknown")}:${nowMs}`,
    eventType: input.eventType,
    severity: input.status === "blocked" ? "warning" : "info",
    status: input.status,
    actorUserId: input.actorUserId,
    subjectUserId: input.subjectUserId,
    provider: "polynet",
    metadata: input.metadata,
    createdAt: nowMs,
  });
}

export const getMyOperatorAccess = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "readonly");
    return {
      userId: operator.userId,
      email: operator.email,
      displayName: operator.displayName,
      role: operator.role,
      source: operator.source,
    };
  },
});

export const getMyOperatorAccessOptional = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      return toOperatorAccessSnapshot(await readOperatorAccess(ctx, args.authSubject, "readonly"));
    } catch (error) {
      const code = normalizeAccessErrorCode(error);
      if (code === "auth_required" || code === "operator_access_forbidden") return null;
      throw error;
    }
  },
});

export const recordOperatorDashboardAccess = mutation({
  args: {
    authSubject: v.optional(v.string()),
    surface: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const operator = await requireOperatorRole(ctx, args.authSubject, "readonly");
      await recordOperatorAudit(ctx, {
        eventType: "operator_dashboard_accessed",
        status: "succeeded",
        actorUserId: operator.dbUserId,
        metadata: {
          surface: args.surface ?? "operator_dashboard",
          role: operator.role,
          source: operator.source,
        },
      });
      await recordPlatformDiagnosticEventBestEffort(ctx, {
        eventKey: `access.operator_access_granted:${String(operator.dbUserId)}:${Date.now()}`,
        eventType: "access.operator_access_granted",
        subsystem: "access",
        severity: "info",
        status: "succeeded",
        surface: args.surface ?? "operator_dashboard",
        userId: operator.dbUserId,
        metadata: {
          role: operator.role,
          source: operator.source,
        },
        createdAt: Date.now(),
      });
      return {
        ok: true,
        role: operator.role,
      };
    } catch (error) {
      await recordOperatorAudit(ctx, {
        eventType: "operator_dashboard_accessed",
        status: "blocked",
        metadata: {
          surface: args.surface ?? "operator_dashboard",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await recordPlatformDiagnosticEventBestEffort(ctx, {
        eventKey: `access.operator_access_denied:unknown:${Date.now()}`,
        eventType: "access.operator_access_denied",
        subsystem: "access",
        severity: "warning",
        status: "blocked",
        surface: args.surface ?? "operator_dashboard",
        errorCode: normalizeAccessErrorCode(error),
        createdAt: Date.now(),
      });
      throw error;
    }
  },
});

export const listOperatorRoles = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "owner");
    const rows = await ctx.db.query("operatorRoles").collect();
    return rows.map((row: any) => ({
      id: String(row._id),
      userId: String(row.userId),
      email: row.email ?? null,
      role: row.role,
      active: row.active,
      createdBy: row.createdBy ? String(row.createdBy) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const upsertOperatorRole = mutation({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.id("users"),
    role: OPERATOR_ROLE_VALIDATOR,
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "owner");
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("operator_role_target_not_found");

    const nowMs = Date.now();
    const existing = await ctx.db
      .query("operatorRoles")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    const patch = {
      email: targetUser.email ?? undefined,
      normalizedEmail: normalizeEmail(targetUser.email) || undefined,
      role: args.role,
      active: args.active ?? true,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("operatorRoles", {
        userId: args.userId,
        ...patch,
        createdBy: operator.dbUserId,
        createdAt: nowMs,
      });
    }
    await recordOperatorAudit(ctx, {
      eventType: "operator_role_upserted",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      subjectUserId: args.userId,
      metadata: {
        role: args.role,
        active: args.active ?? true,
      },
    });
    return { ok: true };
  },
});

export const deactivateOperatorRole = mutation({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "owner");
    const existing = await ctx.db
      .query("operatorRoles")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!existing) return { ok: true };
    if (String(operator.dbUserId) === String(args.userId) && existing.role === "owner") {
      throw new Error("operator_owner_self_deactivation_blocked");
    }
    await ctx.db.patch(existing._id, {
      active: false,
      updatedAt: Date.now(),
    });
    await recordOperatorAudit(ctx, {
      eventType: "operator_role_deactivated",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      subjectUserId: args.userId,
      metadata: {
        previousRole: existing.role,
      },
    });
    return { ok: true };
  },
});
