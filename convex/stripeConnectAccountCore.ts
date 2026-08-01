import Stripe from "stripe";
import {
  normalizeStripeConnectCountry,
  stripeConnectCountryUsesRecipientServiceAgreement,
} from "../shared/stripeConnectCountries";

export type StripeConnectStatus =
  | "not_connected"
  | "onboarding_required"
  | "pending_requirements"
  | "ready"
  | "restricted";

export type StoredStripeConnectStatus = Exclude<StripeConnectStatus, "not_connected">;

export type StripeConnectRevenueDestinationLike = {
  stripeAccountId?: unknown;
  status?: unknown;
  chargesEnabled?: unknown;
  payoutsEnabled?: unknown;
  transfersEnabled?: unknown;
};

export function normalizeStripeConnectRequirementList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 64);
}

export function normalizeOptionalStripeConnectString(
  raw: unknown,
  maxLen = 300,
): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, maxLen);
}

export function deriveStoredStripeConnectStatus(args: {
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersEnabled: boolean;
  recipientServiceAgreement: boolean;
  requirementsDisabledReason: string | null;
}): StoredStripeConnectStatus {
  const paymentRouteReady = args.recipientServiceAgreement
    ? args.transfersEnabled && args.payoutsEnabled
    : args.chargesEnabled && args.payoutsEnabled;
  if (paymentRouteReady) return "ready";
  if (args.requirementsDisabledReason) return "restricted";
  if (!args.detailsSubmitted) return "onboarding_required";
  return "pending_requirements";
}

export function getStripeConnectDestinationAccountId(
  account: StripeConnectRevenueDestinationLike | null | undefined,
): string | null {
  const accountId = String(account?.stripeAccountId ?? "").trim();
  return accountId || null;
}

export function canReceiveCommunityRevenue(
  account: StripeConnectRevenueDestinationLike | null | undefined,
): boolean {
  const connectStatus = String(account?.status ?? "").trim().toLowerCase();
  return (
    getStripeConnectDestinationAccountId(account) !== null &&
    connectStatus === "ready" &&
    account?.payoutsEnabled === true &&
    account?.chargesEnabled === true
  );
}

export function buildStripeConnectAccountSnapshot(
  account: Stripe.Account,
  args?: { readyAtMs?: number },
): {
  stripeAccountId: string;
  accountType: "express";
  country: string | null;
  serviceAgreement: string | null;
  transfersEnabled: boolean;
  status: StoredStripeConnectStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsDisabledReason: string | null;
  onboardingCompleteAt?: number;
} {
  const detailsSubmitted = account.details_submitted === true;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const country = normalizeStripeConnectCountry(account.country);
  const serviceAgreement = normalizeOptionalStripeConnectString(
    account.tos_acceptance?.service_agreement,
    40,
  );
  const recipientServiceAgreement =
    serviceAgreement === "recipient" || stripeConnectCountryUsesRecipientServiceAgreement(country);
  const transfersEnabled = account.capabilities?.transfers === "active";
  const requirementsDisabledReason = normalizeOptionalStripeConnectString(
    account.requirements?.disabled_reason,
  );
  const status = deriveStoredStripeConnectStatus({
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    transfersEnabled,
    recipientServiceAgreement,
    requirementsDisabledReason,
  });
  return {
    stripeAccountId: account.id,
    accountType: "express",
    country,
    serviceAgreement,
    transfersEnabled,
    status,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    requirementsCurrentlyDue: normalizeStripeConnectRequirementList(
      account.requirements?.currently_due,
    ),
    requirementsEventuallyDue: normalizeStripeConnectRequirementList(
      account.requirements?.eventually_due,
    ),
    requirementsDisabledReason,
    onboardingCompleteAt: status === "ready" ? args?.readyAtMs ?? Date.now() : undefined,
  };
}
