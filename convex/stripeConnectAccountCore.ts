import Stripe from "stripe";
import { normalizeStripeConnectCountry } from "../shared/stripeConnectCountries";

export type StripeConnectStatus =
  | "not_connected"
  | "onboarding_required"
  | "pending_requirements"
  | "ready"
  | "restricted";

export type StoredStripeConnectStatus = Exclude<StripeConnectStatus, "not_connected">;

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
  requirementsDisabledReason: string | null;
}): StoredStripeConnectStatus {
  if (args.chargesEnabled && args.payoutsEnabled) return "ready";
  if (args.requirementsDisabledReason) return "restricted";
  if (!args.detailsSubmitted) return "onboarding_required";
  return "pending_requirements";
}

export function buildStripeConnectAccountSnapshot(
  account: Stripe.Account,
  args?: { readyAtMs?: number },
): {
  stripeAccountId: string;
  accountType: "express";
  country: string | null;
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
  const requirementsDisabledReason = normalizeOptionalStripeConnectString(
    account.requirements?.disabled_reason,
  );
  const status = deriveStoredStripeConnectStatus({
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    requirementsDisabledReason,
  });
  return {
    stripeAccountId: account.id,
    accountType: "express",
    country: normalizeStripeConnectCountry(account.country),
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
