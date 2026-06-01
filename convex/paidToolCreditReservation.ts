import { internal } from "./_generated/api";
import type { PaidUsageBillingMode } from "../shared/paidUsageBilling";
import {
  creditsToUsd,
  PAID_TOOL_DEFINITIONS,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
  type PaidToolKind,
  type PaidToolLedgerToolName,
} from "../shared/workspaceCredits";
import {
  evaluatePaidToolStartAdmission,
  resolveWorkspaceResourceAccountTier,
} from "../shared/workspaceResourceAdmission";

type PaidToolCreditReservationFailure = {
  ok: false;
  code: "workspace_credits_exhausted" | "workspace_credits_unavailable" | "workspace_uncollected_usage_blocked";
  message: string;
  details: Record<string, unknown>;
};

type PaidToolCreditReservationSuccess = {
  ok: true;
  creditKey: string;
  hasCardOnFile: boolean;
  metadata: Record<string, unknown>;
};

function hasPersistedWorkspaceCardOnFile(stripeCustomer: any): boolean {
  return Boolean(
    stripeCustomer?.paymentMethodStatus === "active" &&
      String(stripeCustomer.providerDefaultPaymentMethodId ?? "").trim().startsWith("pm_") &&
      !(Number(stripeCustomer.cardRemovedAt ?? 0) > 0),
  );
}

function paidToolBillingModeForFailure(hasCardOnFile: boolean): PaidUsageBillingMode {
  return hasCardOnFile ? "prepaid_required" : "card_preferred";
}

function paidToolCreditFailure(params: {
  code: PaidToolCreditReservationFailure["code"];
  message: string;
  toolKind: PaidToolKind;
  requiredCredits: number;
  paidUsageBillingMode: PaidUsageBillingMode;
  details?: Record<string, unknown>;
}): PaidToolCreditReservationFailure {
  return {
    ok: false,
    code: params.code,
    message: params.message,
    details: {
      ...(params.details ?? {}),
      tool_kind: params.toolKind,
      required_credits: params.requiredCredits,
      paid_usage_billing_mode: params.paidUsageBillingMode,
    },
  };
}

export async function reservePaidToolCredits(params: {
  ctx: any;
  creditKey: string;
  userId: any;
  communityId?: any;
  projectId?: any;
  runId?: string | null;
  toolKind: PaidToolKind;
  toolName: PaidToolLedgerToolName;
  action?: string | null;
  vendor?: string | null;
  credits: number;
  rawVendorCostUsd: number;
  polynetPriceUsd?: number;
  metadata?: Record<string, unknown>;
  expiresAt?: number;
  nowMs?: number;
}): Promise<PaidToolCreditReservationSuccess | PaidToolCreditReservationFailure> {
  const nowMs = params.nowMs ?? Date.now();
  const definition = PAID_TOOL_DEFINITIONS[params.toolKind];
  const toolLabel = definition.operatorLabel || "Premium tools";
  const toolBalanceMessage = toolLabel.toLowerCase().endsWith("tools")
    ? `${toolLabel} need tool balance before they run.`
    : `${toolLabel} needs tool balance before it runs.`;
  const requiredCredits = Math.max(0, Number(params.credits) || 0);

  let workspaceCreditBalance: any = null;
  try {
    workspaceCreditBalance = await params.ctx.runQuery(
      internal.workspaceCredits.getWorkspaceCreditBalanceInternal as any,
      { userId: params.userId },
    );
  } catch {
    return paidToolCreditFailure({
      code: "workspace_credits_unavailable",
      message: `Tool balance is unavailable for ${toolLabel.toLowerCase()}.`,
      toolKind: params.toolKind,
      requiredCredits,
      paidUsageBillingMode: "prepaid_required",
    });
  }

  let stripeCustomer: any = null;
  try {
    stripeCustomer = await params.ctx.runQuery(
      internal.stripeCustomers.getUserStripeCustomerInternal as any,
      { userId: params.userId },
    );
  } catch {
    stripeCustomer = null;
  }
  const hasCardOnFile = hasPersistedWorkspaceCardOnFile(stripeCustomer);
  const paidUsageBillingMode = paidToolBillingModeForFailure(hasCardOnFile);
  const billingMode = hasCardOnFile ? "card_backed" : "prepaid_balance";
  const fundingSource = hasCardOnFile ? "card_on_file" : "prepaid_balance";

  const admission = evaluatePaidToolStartAdmission({
    accountTier: resolveWorkspaceResourceAccountTier({
      hasCardOnFile,
      workspaceCreditBalance,
    }),
    hasCardOnFile,
    workspaceCreditBalance,
    requiredCredits,
    toolLabel,
  });
  if (!admission.ok) {
    return paidToolCreditFailure({
      code: admission.code === "workspace_uncollected_usage_blocked"
        ? "workspace_uncollected_usage_blocked"
        : "workspace_credits_exhausted",
      message: admission.message,
      toolKind: params.toolKind,
      requiredCredits,
      paidUsageBillingMode,
      details: {
        account_tier: admission.accountTier,
        current_count: admission.currentCount,
        requested_count: admission.requestedCount,
        limit: admission.limit,
      },
    });
  }

  const metadata = {
    pricing_version: PAID_TOOL_PRICING_VERSION,
    target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
    ...(params.metadata ?? {}),
    billing_mode: billingMode,
    funding_source: fundingSource,
    card_backed_uncollected_limit_credits: hasCardOnFile
      ? WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS
      : null,
  };

  try {
    await params.ctx.runMutation(internal.workspaceCredits.reserveCreditsInternal as any, {
      creditKey: params.creditKey,
      userId: params.userId,
      communityId: params.communityId ?? undefined,
      projectId: params.projectId ?? undefined,
      runId: params.runId ?? null,
      toolName: params.toolName,
      action: params.action ?? null,
      vendor: params.vendor ?? null,
      credits: requiredCredits,
      rawVendorCostUsd: params.rawVendorCostUsd,
      polynetPriceUsd: params.polynetPriceUsd ?? creditsToUsd(requiredCredits),
      metadata,
      allowUncollectedReservation: hasCardOnFile,
      uncollectedReservationLimitCredits: hasCardOnFile
        ? WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS
        : undefined,
      expiresAt: params.expiresAt,
      nowMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const exhausted = message === "credits_exhausted";
    return paidToolCreditFailure({
      code: exhausted ? "workspace_credits_exhausted" : "workspace_credits_unavailable",
      message: exhausted
        ? toolBalanceMessage
        : `Tool balance is unavailable for ${toolLabel.toLowerCase()}.`,
      toolKind: params.toolKind,
      requiredCredits,
      paidUsageBillingMode: exhausted ? paidUsageBillingMode : "prepaid_required",
    });
  }

  return {
    ok: true,
    creditKey: params.creditKey,
    hasCardOnFile,
    metadata,
  };
}
