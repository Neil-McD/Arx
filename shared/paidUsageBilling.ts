import type { PaidToolKind } from "./workspaceCredits.ts";

export type PaidUsageBillingMode =
  | "card_required"
  | "card_preferred"
  | "prepaid_required";

export type WorkspaceStorageBillingAction =
  | "funding_required"
  | "card_required";

export type PaidUsageFailureCode =
  | "workspace_card_required_for_additional_volume"
  | "workspace_volume_funding_required"
  | "workspace_credits_exhausted"
  | "workspace_credits_unavailable"
  | "workspace_uncollected_usage_blocked";

export type PaidUsageFailureClassification =
  | {
      isPaidUsageFailure: true;
      code: PaidUsageFailureCode | null;
      paidUsageBillingMode: PaidUsageBillingMode;
      toolKind: PaidToolKind | null;
    }
  | {
      isPaidUsageFailure: false;
      code: null;
      paidUsageBillingMode: null;
      toolKind: PaidToolKind | null;
    };

export function normalizePaidUsageBillingMode(
  value: unknown,
): PaidUsageBillingMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "card_required") return "card_required";
  if (normalized === "card_preferred") return "card_preferred";
  if (normalized === "prepaid_required") return "prepaid_required";
  return null;
}

export function normalizePaidUsageFailureCode(
  value: unknown,
): PaidUsageFailureCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "workspace_card_required_for_additional_volume") {
    return "workspace_card_required_for_additional_volume";
  }
  if (normalized === "workspace_volume_funding_required") {
    return "workspace_volume_funding_required";
  }
  if (normalized === "workspace_credits_exhausted") {
    return "workspace_credits_exhausted";
  }
  if (normalized === "workspace_credits_unavailable") {
    return "workspace_credits_unavailable";
  }
  if (normalized === "workspace_uncollected_usage_blocked") {
    return "workspace_uncollected_usage_blocked";
  }
  if (normalized === "credits_exhausted") return "workspace_credits_exhausted";
  if (normalized === "credits_unavailable") return "workspace_credits_unavailable";
  return null;
}

export function paidUsageBillingModeForWorkspaceStorageAction(
  action: WorkspaceStorageBillingAction,
): PaidUsageBillingMode {
  return action === "card_required" ? "card_required" : "card_preferred";
}

export function paidUsageBillingModeForPaidToolFailure(
  _toolKind?: PaidToolKind | null,
): PaidUsageBillingMode {
  return "prepaid_required";
}

export function classifyPaidUsageFailure(params: {
  code?: unknown;
  paidUsageBillingMode?: unknown;
  toolKind?: PaidToolKind | null;
}): PaidUsageFailureClassification {
  const code = normalizePaidUsageFailureCode(params.code);
  const explicitMode = normalizePaidUsageBillingMode(
    params.paidUsageBillingMode,
  );
  const toolKind = params.toolKind ?? null;

  if (code === "workspace_card_required_for_additional_volume") {
    return {
      isPaidUsageFailure: true,
      code,
      paidUsageBillingMode: "card_required",
      toolKind,
    };
  }

  if (code === "workspace_volume_funding_required") {
    return {
      isPaidUsageFailure: true,
      code,
      paidUsageBillingMode: "card_preferred",
      toolKind,
    };
  }

  if (code) {
    return {
      isPaidUsageFailure: true,
      code,
      paidUsageBillingMode:
        explicitMode ?? paidUsageBillingModeForPaidToolFailure(toolKind),
      toolKind,
    };
  }

  if (explicitMode) {
    return {
      isPaidUsageFailure: true,
      code: null,
      paidUsageBillingMode: explicitMode,
      toolKind,
    };
  }

  return {
    isPaidUsageFailure: false,
    code: null,
    paidUsageBillingMode: null,
    toolKind,
  };
}
