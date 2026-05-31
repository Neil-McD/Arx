import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getStripeClient } from "./stripeCore";
import {
  newOpaqueToken,
  requireCanonicalCheckoutReturnUrl,
} from "./billingCore";
import { resolveAuthenticatedActor } from "./authActor";
import {
  buildAttachStripeCustomerPatchForExisting,
  buildSyncStripeCustomerPaymentMethodPatch,
} from "../shared/stripeCustomerIdempotency";

type WorkspacePaymentMethodStatus = "active" | "missing" | "detached";

type WorkspacePaymentMethodSnapshot = {
  status: WorkspacePaymentMethodStatus;
  providerDefaultPaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
};

function normalizeStripeCustomerId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("cus_") ? normalized : undefined;
}

function normalizeStripePaymentMethodId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("pm_") ? normalized : undefined;
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

function readStripePaymentMethod(value: unknown): any | null {
  if (!value || typeof value !== "object") return null;
  const id = normalizeStripePaymentMethodId((value as { id?: unknown }).id);
  const record = value as { type?: unknown; card?: unknown };
  const type = String(record.type ?? "").trim();
  const hasCardPayload = Boolean(record.card && typeof record.card === "object");
  if (type !== "card" && !hasCardPayload) return null;
  return id ? value : null;
}

function readStripeCardSnapshot(paymentMethod: any | null): WorkspacePaymentMethodSnapshot {
  const paymentMethodId = normalizeStripePaymentMethodId(paymentMethod?.id);
  if (!paymentMethodId) {
    return {
      status: "missing",
      providerDefaultPaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
    };
  }
  const card = paymentMethod?.card && typeof paymentMethod.card === "object"
    ? paymentMethod.card
    : null;
  const cardBrand = String(card?.brand ?? "").trim().slice(0, 80) || null;
  const cardLast4 = String(card?.last4 ?? "").trim().slice(0, 8) || null;
  const expMonth = Math.floor(Number(card?.exp_month ?? 0));
  const expYear = Math.floor(Number(card?.exp_year ?? 0));
  return {
    status: "active",
    providerDefaultPaymentMethodId: paymentMethodId,
    cardBrand,
    cardLast4,
    cardExpMonth: Number.isFinite(expMonth) && expMonth > 0 ? expMonth : null,
    cardExpYear: Number.isFinite(expYear) && expYear > 0 ? expYear : null,
  };
}

async function findUsableCustomerPaymentMethod(args: {
  stripe: any;
  providerCustomerId: string;
}): Promise<WorkspacePaymentMethodSnapshot> {
  let customer: any;
  try {
    customer = await args.stripe.customers.retrieve(args.providerCustomerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
  } catch (error) {
    if (stripeErrorCode(error) === "resource_missing") {
      return readStripeCardSnapshot(null);
    }
    throw error;
  }
  if (stripeCustomerIsDeleted(customer)) return readStripeCardSnapshot(null);

  const defaultPaymentMethodValue = customer?.invoice_settings?.default_payment_method;
  let paymentMethod = readStripePaymentMethod(defaultPaymentMethodValue);
  const defaultPaymentMethodId = normalizeStripePaymentMethodId(defaultPaymentMethodValue);
  if (!paymentMethod && defaultPaymentMethodId) {
    try {
      paymentMethod = await args.stripe.paymentMethods.retrieve(defaultPaymentMethodId);
    } catch (error) {
      if (stripeErrorCode(error) !== "resource_missing") throw error;
    }
  }

  if (!paymentMethod) {
    const listed = await args.stripe.paymentMethods.list({
      customer: args.providerCustomerId,
      type: "card",
      limit: 1,
    });
    paymentMethod = readStripePaymentMethod(listed?.data?.[0]);
    const paymentMethodId = normalizeStripePaymentMethodId(paymentMethod?.id);
    if (paymentMethodId) {
      await args.stripe.customers.update(args.providerCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }
  }

  return readStripeCardSnapshot(paymentMethod);
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

export const getUserStripeCustomerByProviderCustomerIdInternal = internalQuery({
  args: {
    providerCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerCustomerId = normalizeStripeCustomerId(args.providerCustomerId);
    if (!providerCustomerId) return null;
    const row = await ctx.db
      .query("userStripeCustomers")
      .withIndex("by_providerCustomerId", (q) =>
        q.eq("providerCustomerId", providerCustomerId),
      )
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

export const getUserStripeCustomerByProviderPaymentMethodIdInternal = internalQuery({
  args: {
    providerDefaultPaymentMethodId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerDefaultPaymentMethodId = normalizeStripePaymentMethodId(
      args.providerDefaultPaymentMethodId,
    );
    if (!providerDefaultPaymentMethodId) return null;
    const row = await ctx.db
      .query("userStripeCustomers")
      .withIndex("by_providerDefaultPaymentMethodId", (q) =>
        q.eq("providerDefaultPaymentMethodId", providerDefaultPaymentMethodId),
      )
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

export const syncUserStripeCustomerPaymentMethodInternal = internalMutation({
  args: {
    userId: v.id("users"),
    providerCustomerId: v.string(),
    status: v.union(v.literal("active"), v.literal("missing"), v.literal("detached")),
    providerDefaultPaymentMethodId: v.optional(v.union(v.string(), v.null())),
    cardBrand: v.optional(v.union(v.string(), v.null())),
    cardLast4: v.optional(v.union(v.string(), v.null())),
    cardExpMonth: v.optional(v.union(v.number(), v.null())),
    cardExpYear: v.optional(v.union(v.number(), v.null())),
    checkedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const providerCustomerId = normalizeStripeCustomerId(args.providerCustomerId);
    if (!providerCustomerId) throw new Error("stripe_customer_id_missing");
    const nowMs = args.checkedAt ?? Date.now();
    const existing = await ctx.db
      .query("userStripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const patch = buildSyncStripeCustomerPaymentMethodPatch({
      existing,
      providerCustomerId,
      status: args.status,
      providerDefaultPaymentMethodId: args.providerDefaultPaymentMethodId,
      cardBrand: args.cardBrand,
      cardLast4: args.cardLast4,
      cardExpMonth: args.cardExpMonth,
      cardExpYear: args.cardExpYear,
      nowMs,
    });
    if (existing) {
      if (!patch) return existing;
      await ctx.db.patch(existing._id, patch);
      return await ctx.db.get(existing._id);
    }
    if (!patch) throw new Error("stripe_customer_payment_method_patch_missing");
    const id = await ctx.db.insert("userStripeCustomers", {
      userId: args.userId,
      email: undefined,
      createdAt: nowMs,
      ...(patch as any),
    });
    return await ctx.db.get(id);
  },
});

export const refreshWorkspaceCardOnFileStatus = action({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    const providerCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId,
      email: actor?.email ?? null,
      nowMs,
    });
    const stripe = getStripeClient();
    const snapshot = await findUsableCustomerPaymentMethod({
      stripe,
      providerCustomerId,
    });
    await ctx.runMutation(
      (internal as any).stripeCustomers.syncUserStripeCustomerPaymentMethodInternal,
      {
        userId,
        providerCustomerId,
        status: snapshot.status,
        providerDefaultPaymentMethodId: snapshot.providerDefaultPaymentMethodId,
        cardBrand: snapshot.cardBrand,
        cardLast4: snapshot.cardLast4,
        cardExpMonth: snapshot.cardExpMonth,
        cardExpYear: snapshot.cardExpYear,
        checkedAt: nowMs,
      },
    );
    return {
      ok: true,
      has_card_on_file:
        snapshot.status === "active" && Boolean(snapshot.providerDefaultPaymentMethodId),
      payment_method_status: snapshot.status,
      provider_customer_id: providerCustomerId,
      provider_default_payment_method_id: snapshot.providerDefaultPaymentMethodId,
      checked_at: nowMs,
    };
  },
});

export const getWorkspaceCardOnFileStatus = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const stripeCustomer = await ctx.db
      .query("userStripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", actor.dbUserId))
      .first();
    const status = stripeCustomer?.paymentMethodStatus ?? "missing";
    const paymentMethodId = String(stripeCustomer?.providerDefaultPaymentMethodId ?? "").trim();
    const hasCardOnFile =
      status === "active" &&
      paymentMethodId.startsWith("pm_") &&
      !(Number(stripeCustomer?.cardRemovedAt ?? 0) > 0);
    return {
      ok: true,
      has_card_on_file: hasCardOnFile,
      payment_method_status: hasCardOnFile ? "active" : status,
      card_brand: hasCardOnFile ? stripeCustomer?.cardBrand ?? null : null,
      card_last4: hasCardOnFile ? stripeCustomer?.cardLast4 ?? null : null,
      checked_at: stripeCustomer?.paymentMethodCheckedAt ?? null,
    };
  },
});

export const startWorkspaceCardSetupCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const successUrl = requireCanonicalCheckoutReturnUrl(
      args.successUrl,
      "workspace_card_setup_success_url_invalid",
    );
    const cancelUrl = requireCanonicalCheckoutReturnUrl(
      args.cancelUrl,
      "workspace_card_setup_cancel_url_invalid",
    );
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    const providerCustomerId = await ensureStripeCustomerForUser({
      ctx,
      userId,
      email: actor?.email ?? null,
      nowMs,
    });
    const setupSessionId = newOpaqueToken("cardsetup");
    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: providerCustomerId,
      payment_method_types: ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: setupSessionId,
      setup_intent_data: {
        metadata: {
          checkout_mode: "workspace_card_setup",
          user_id: String(userId),
          local_session_id: setupSessionId,
        },
      },
      metadata: {
        checkout_mode: "workspace_card_setup",
        user_id: String(userId),
        local_session_id: setupSessionId,
      },
    });
    const checkoutUrl = String(checkoutSession.url ?? "").trim();
    if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
    return {
      checkout_url: checkoutUrl,
    };
  },
});
