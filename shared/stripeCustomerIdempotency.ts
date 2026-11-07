export type WorkspacePaymentMethodStatus = "active" | "missing" | "detached";

export type StripeCustomerPatch = Record<string, unknown>;

function normalizeStripeCustomerId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("cus_") ? normalized : undefined;
}

function normalizeStripeCustomerEmail(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.includes("@") ? normalized.slice(0, 320) : undefined;
}

export function buildAttachStripeCustomerPatchForExisting(args: {
  existing: Record<string, unknown>;
  providerCustomerId: unknown;
  email?: unknown;
  nowMs: number;
}): StripeCustomerPatch | null {
  const providerCustomerId = normalizeStripeCustomerId(args.providerCustomerId);
  if (!providerCustomerId) return null;
  const email = normalizeStripeCustomerEmail(args.email);
  const existingCustomerId = normalizeStripeCustomerId(args.existing.providerCustomerId);
  const customerChanged = existingCustomerId !== providerCustomerId;
  const patch: StripeCustomerPatch = {};

  if (customerChanged) {
    patch.providerCustomerId = providerCustomerId;
    patch.paymentMethodStatus = "missing";
    patch.providerDefaultPaymentMethodId = undefined;
    patch.paymentMethodCheckedAt = args.nowMs;
    patch.cardBrand = undefined;
    patch.cardLast4 = undefined;
    patch.cardExpMonth = undefined;
    patch.cardExpYear = undefined;
    patch.cardRemovedAt = args.nowMs;
  }

  if (email && normalizeStripeCustomerEmail(args.existing.email) !== email) {
    patch.email = email;
  }

  if (Object.keys(patch).length === 0) return null;
  patch.updatedAt = args.nowMs;
  return patch;
}

