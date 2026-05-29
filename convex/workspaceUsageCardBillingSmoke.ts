"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripeClient } from "./stripeCore.ts";
import {
  WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
} from "../shared/workspaceCredits.ts";

type SmokeEvidence = {
  stagingOnly: boolean;
  stripeTestMode: boolean;
  stripeCustomerCreated: boolean;
  stripePaymentMethodAttached: boolean;
  smokeRowsCreated: boolean;
  collectionRan: boolean;
  collectionSucceeded: boolean;
  balanceSettled: boolean;
  paymentIntentVerified: boolean;
  cleanupOk: boolean;
};

type SmokeFailure = {
  code: string;
  message?: string;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeDeploymentKind(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function safeFailure(error: unknown, code = "workspace_usage_card_billing_smoke_error"): SmokeFailure {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : code;
  return {
    code,
    message: message.slice(0, 240),
  };
}

function initialEvidence(): SmokeEvidence {
  return {
    stagingOnly: false,
    stripeTestMode: false,
    stripeCustomerCreated: false,
    stripePaymentMethodAttached: false,
    smokeRowsCreated: false,
    collectionRan: false,
    collectionSucceeded: false,
    balanceSettled: false,
    paymentIntentVerified: false,
    cleanupOk: false,
  };
}

export const smokeWorkspaceUsageCardBilling = action({
  args: {
    uncollectedCredits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const evidence = initialEvidence();
    const failures: SmokeFailure[] = [];
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    evidence.stagingOnly = deploymentKind === "staging";
    if (!evidence.stagingOnly) {
      return {
        ok: false,
        code: "workspace_usage_card_billing_smoke_staging_only",
        deploymentKind,
        evidence,
        failures: [{ code: "not_staging_deployment" }],
      };
    }

    const stripeSecretKey = readEnv("STRIPE_SECRET_KEY") || readEnv("ARX_STRIPE_SECRET_KEY");
    evidence.stripeTestMode = stripeSecretKey.startsWith("sk_test_");
    if (!evidence.stripeTestMode) {
      return {
        ok: false,
        code: "workspace_usage_card_billing_smoke_test_stripe_only",
        deploymentKind,
        evidence,
        failures: [{ code: "stripe_secret_key_must_be_test_mode" }],
      };
    }

    const nowMs = Date.now();
    const runId = randomUUID().slice(0, 12);
    const authSubject = `smoke:workspace-usage-card-billing:${runId}`;
    const email = `workspace-usage-card-billing-${runId}@smoke.polynet.ai`;
    const uncollectedCredits = Math.max(
      WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
      Math.floor(Number(args.uncollectedCredits ?? WORKSPACE_CARD_COLLECTION_MIN_CREDITS) || 0),
    );
    let providerCustomerId: string | null = null;
    let providerPaymentMethodId: string | null = null;
    let collectionKey: string | null = null;
    let userId: unknown = null;

    try {
      const stripe = getStripeClient();
      const customer = await stripe.customers.create({
        email,
        metadata: {
          purpose: "polynet_workspace_usage_card_billing_smoke",
          run_id: runId,
        },
      });
      providerCustomerId = normalizeOptionalString(customer.id);
      evidence.stripeCustomerCreated = Boolean(providerCustomerId);
      if (!providerCustomerId) throw new Error("stripe_customer_create_failed");

      const paymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          token: "tok_visa",
        } as any,
        metadata: {
          purpose: "polynet_workspace_usage_card_billing_smoke",
          run_id: runId,
        },
      } as any);
      providerPaymentMethodId = normalizeOptionalString(paymentMethod.id);
      if (!providerPaymentMethodId) throw new Error("stripe_payment_method_create_failed");
      await stripe.paymentMethods.attach(providerPaymentMethodId, {
        customer: providerCustomerId,
      });
      await stripe.customers.update(providerCustomerId, {
        invoice_settings: {
          default_payment_method: providerPaymentMethodId,
        },
      });
      evidence.stripePaymentMethodAttached = true;

      const setup = await ctx.runMutation(
        (internal as any).workspaceUsageCardBillingSmokeRows
          .createWorkspaceUsageCardBillingSmokeRowsInternal,
        {
          authSubject,
          email,
          providerCustomerId,
          providerDefaultPaymentMethodId: providerPaymentMethodId,
          uncollectedCredits,
          nowMs,
        },
      ) as {
        userId: unknown;
        collectionKey: string;
      };
      userId = setup.userId;
      collectionKey = setup.collectionKey;
      evidence.smokeRowsCreated = Boolean(userId && collectionKey);

      const collectionResult = await ctx.runAction(
        (internal as any).workspaceCredits.collectWorkspaceUsageByCardInternal,
        {
          nowMs: nowMs + 1,
          limit: 25,
        },
      ) as Record<string, unknown>;
      evidence.collectionRan = true;
      evidence.collectionSucceeded = Number(collectionResult.succeeded ?? 0) >= 1;
      if (!evidence.collectionSucceeded) {
        failures.push({
          code: "workspace_usage_card_collection_did_not_succeed",
          message: JSON.stringify(collectionResult).slice(0, 240),
        });
      }

      const rows = await ctx.runQuery(
        (internal as any).workspaceUsageCardBillingSmokeRows
          .readWorkspaceUsageCardBillingSmokeRowsInternal,
        {
          userId,
          collectionKey,
        },
      ) as {
        balance?: {
          purchasedCreditsBalance?: number;
          uncollectedCreditsBalance?: number;
          pendingCardCollectionCreditsBalance?: number;
        } | null;
        collection?: {
          status?: string;
          creditsAmount?: number;
          providerPaymentIntentId?: string | null;
        } | null;
      };
      evidence.balanceSettled =
        rows.balance?.purchasedCreditsBalance === 0 &&
        rows.balance?.uncollectedCreditsBalance === 0 &&
        rows.balance?.pendingCardCollectionCreditsBalance === 0;
      if (!evidence.balanceSettled) {
        failures.push({ code: "workspace_usage_card_balance_not_settled" });
      }

      const paymentIntentId = normalizeOptionalString(
        rows.collection?.providerPaymentIntentId,
      );
      if (rows.collection?.status !== "succeeded" || !paymentIntentId) {
        failures.push({ code: "workspace_usage_card_collection_row_not_succeeded" });
      } else {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        evidence.paymentIntentVerified =
          intent.status === "succeeded" &&
          intent.amount === uncollectedCredits &&
          intent.currency === "usd" &&
          String(intent.metadata?.polynet_collection_key ?? "") === collectionKey;
        if (!evidence.paymentIntentVerified) {
          failures.push({ code: "workspace_usage_card_payment_intent_not_verified" });
        }
      }
    } catch (error) {
      failures.push(safeFailure(error));
    } finally {
      try {
        await ctx.runMutation(
          (internal as any).workspaceUsageCardBillingSmokeRows
            .cleanupWorkspaceUsageCardBillingSmokeRowsInternal,
          {
            authSubject,
            collectionKey: collectionKey ?? undefined,
          },
        );
        evidence.cleanupOk = true;
      } catch (error) {
        evidence.cleanupOk = false;
        failures.push(safeFailure(error, "workspace_usage_card_billing_db_cleanup_failed"));
      }
      if (providerCustomerId) {
        try {
          const stripe = getStripeClient();
          await stripe.customers.del(providerCustomerId);
        } catch (error) {
          failures.push(safeFailure(error, "workspace_usage_card_billing_stripe_cleanup_failed"));
        }
      }
    }

    return {
      ok:
        evidence.stagingOnly &&
        evidence.stripeTestMode &&
        evidence.stripeCustomerCreated &&
        evidence.stripePaymentMethodAttached &&
        evidence.smokeRowsCreated &&
        evidence.collectionRan &&
        evidence.collectionSucceeded &&
        evidence.balanceSettled &&
        evidence.paymentIntentVerified &&
        evidence.cleanupOk &&
        failures.length === 0,
      code: "workspace_usage_card_billing_smoke",
      deploymentKind,
      amountCents: uncollectedCredits,
      evidence,
      failures,
    };
  },
});
