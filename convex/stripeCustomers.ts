import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getStripeClient } from "./stripeCore";
import { buildAttachStripeCustomerPatchForExisting } from "../shared/stripeCustomerIdempotency";

function normalizeStripeCustomerId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("cus_") ? normalized : undefined;
}

function normalizeStripeCustomerEmail(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.includes("@") ? normalized.slice(0, 320) : undefined;
}

function stripeErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; type?: unknown };
  return String(candidate?.code ?? candidate?.type ?? "").trim();
}

function stripeCustomerIsDeleted(customer: unknown): boolean {
  return Boolean((customer as { deleted?: unknown } | null)?.deleted);
}

export async function attachStripeCustomerToUser(args: {
  ctx: any;
  userId: unknown;
  providerCustomerId: unknown;
  email?: unknown;
  replaceExisting?: boolean;
  nowMs?: number;
}) {
  const userId = args.userId;
  const providerCustomerId = normalizeStripeCustomerId(args.providerCustomerId);
  if (!userId || !providerCustomerId) return null;
  const nowMs = args.nowMs ?? Date.now();
  const email = normalizeStripeCustomerEmail(args.email);
  const existingByCustomer = await args.ctx.db
    .query("userStripeCustomers")
    .withIndex("by_providerCustomerId", (q: any) =>
      q.eq("providerCustomerId", providerCustomerId),
    )
    .first();
  if (existingByCustomer && String(existingByCustomer.userId) !== String(userId)) {
    throw new Error("stripe_customer_user_conflict");
  }

  const existingByUser = await args.ctx.db
    .query("userStripeCustomers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (existingByUser) {
    const existingCustomerId = normalizeStripeCustomerId(existingByUser.providerCustomerId);
    if (
      existingCustomerId &&
      existingCustomerId !== providerCustomerId &&
      args.replaceExisting !== true
    ) {
      return existingByUser;
    }
    const patch = buildAttachStripeCustomerPatchForExisting({
      existing: existingByUser,
      providerCustomerId,
      email,
      nowMs,
    });
    if (!patch) return existingByUser;
    await args.ctx.db.patch(existingByUser._id, patch);
    return await args.ctx.db.get(existingByUser._id);
  }

  const id = await args.ctx.db.insert("userStripeCustomers", {
    userId,
    provider: "stripe",
    providerCustomerId,
    email,
    paymentMethodStatus: "missing",
    paymentMethodCheckedAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return await args.ctx.db.get(id);
}

export async function ensureStripeCustomerForUser(args: {
  ctx: any;
  userId: unknown;
  email?: unknown;
  nowMs?: number;
}): Promise<string> {
  const userId = args.userId;
  if (!userId) throw new Error("stripe_customer_user_required");
  const nowMs = args.nowMs ?? Date.now();
  const email = normalizeStripeCustomerEmail(args.email);
  const existing = (await args.ctx.runQuery(
    (internal as any).stripeCustomers.getUserStripeCustomerInternal,
    { userId },
  )) as { providerCustomerId?: string | null; email?: string | null } | null;
  const stripe = getStripeClient();
  const existingCustomerId = normalizeStripeCustomerId(existing?.providerCustomerId);
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!stripeCustomerIsDeleted(customer)) {
        const customerEmail = normalizeStripeCustomerEmail((customer as any)?.email);
        if (email && !customerEmail) {
          await stripe.customers.update(existingCustomerId, { email });
        }
        await args.ctx.runMutation(
          (internal as any).stripeCustomers.attachUserStripeCustomerInternal,
          {
            userId,
            providerCustomerId: existingCustomerId,
            email: customerEmail ?? email ?? existing?.email ?? null,
            replaceExisting: true,
            nowMs,
          },
        );
        return existingCustomerId;
      }
    } catch (error) {
      if (stripeErrorCode(error) !== "resource_missing") throw error;
    }
  }

  const customer = await stripe.customers.create(
    {
      email,
      metadata: {
        user_id: String(userId),
      },
    },
    {
      idempotencyKey: `polynet-user-stripe-customer:${String(userId)}`,
    },
  );
  const providerCustomerId = normalizeStripeCustomerId(customer.id);
  if (!providerCustomerId) throw new Error("stripe_customer_id_missing");
  await args.ctx.runMutation(
    (internal as any).stripeCustomers.attachUserStripeCustomerInternal,
    {
      userId,
      providerCustomerId,
      email: normalizeStripeCustomerEmail(customer.email) ?? email ?? null,
      replaceExisting: true,
      nowMs,
    },
  );
  return providerCustomerId;
}

export const getUserStripeCustomerInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userStripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      provider: row.provider,
      providerCustomerId: row.providerCustomerId,
      email: row.email ?? null,
      paymentMethodStatus: row.paymentMethodStatus ?? null,
      providerDefaultPaymentMethodId: row.providerDefaultPaymentMethodId ?? null,
      paymentMethodCheckedAt: row.paymentMethodCheckedAt ?? null,
      cardBrand: row.cardBrand ?? null,
      cardLast4: row.cardLast4 ?? null,
      cardExpMonth: row.cardExpMonth ?? null,
      cardExpYear: row.cardExpYear ?? null,
      cardRemovedAt: row.cardRemovedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

export const attachUserStripeCustomerInternal = internalMutation({
  args: {
    userId: v.id("users"),
    providerCustomerId: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
    replaceExisting: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await attachStripeCustomerToUser({
      ctx,
      userId: args.userId,
      providerCustomerId: args.providerCustomerId,
      email: args.email ?? null,
      replaceExisting: args.replaceExisting,
      nowMs: args.nowMs,
    });
  },
});
