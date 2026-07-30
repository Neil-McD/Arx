import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const principalKindValidator = v.union(
  v.literal("personal_agent"),
  v.literal("external_mcp"),
  v.literal("community_agent"),
);

const mutatingToolNameValidator = v.union(
  v.literal("polynet_write"),
  v.literal("polynet_call"),
);

async function findReceipt(ctx: any, args: {
  communityId: any;
  userId: any;
  principalKind: "personal_agent" | "external_mcp" | "community_agent";
  toolName: "polynet_write" | "polynet_call";
  idempotencyKey: string;
}) {
  return await ctx.db
    .query("polynetCanonicalOperationReceipts" as any)
    .withIndex("by_scope_key", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("userId", args.userId)
        .eq("principalKind", args.principalKind)
        .eq("toolName", args.toolName)
        .eq("idempotencyKey", args.idempotencyKey),
    )
    .first();
}

export const reserveCanonicalOperationReceiptInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    principalKind: principalKindValidator,
    toolName: mutatingToolNameValidator,
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await findReceipt(ctx, args);
    if (existing) {
      if (existing.requestFingerprint !== args.requestFingerprint) {
        return {
          ok: false,
          code: "idempotency_key_conflict",
          message:
            "This idempotency key was already reserved for a different request.",
        };
      }
      return {
        ok: true,
        status: existing.status,
        ...(existing.status === "completed"
          ? { result: existing.result ?? null }
          : {}),
      };
    }
    const nowMs = Date.now();
    await ctx.db.insert("polynetCanonicalOperationReceipts" as any, {
      ...args,
      status: "executing",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, status: "executing" };
  },
});

export const completeCanonicalOperationReceiptInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    principalKind: principalKindValidator,
    toolName: mutatingToolNameValidator,
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await findReceipt(ctx, args);
    if (!existing) {
      throw new Error("polynet_operation_receipt_reservation_missing");
    }
    if (existing.requestFingerprint !== args.requestFingerprint) {
      throw new Error("idempotency_key_conflict");
    }
    if (existing.status === "completed") {
      return {
        ok: true,
        deduped: true,
        result: existing.result ?? null,
      };
    }
    await ctx.db.patch(existing._id, {
      status: "completed",
      result: args.result,
      updatedAt: Date.now(),
    });
    return { ok: true, deduped: false, result: args.result };
  },
});
