export type WorkspacePaymentMethodStatus = "active" | "missing" | "detached";

export type StripeCustomerPatch = Record<string, unknown>;

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

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeExistingPaymentMethodStatus(value: unknown): WorkspacePaymentMethodStatus {
  const normalized = String(value ?? "").trim();
  if (normalized === "active" || normalized === "detached") return normalized;
  return "missing";
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

export function buildSyncStripeCustomerPaymentMethodPatch(args: {
  existing?: Record<string, unknown> | null;
  providerCustomerId: unknown;
  status: WorkspacePaymentMethodStatus;
  providerDefaultPaymentMethodId?: unknown;
  cardBrand?: unknown;
  cardLast4?: unknown;
  cardExpMonth?: unknown;
  cardExpYear?: unknown;
  nowMs: number;
}): StripeCustomerPatch | null {
  const providerCustomerId = normalizeStripeCustomerId(args.providerCustomerId);
  if (!providerCustomerId) return null;
  const desiredPaymentMethodId =
    normalizeStripePaymentMethodId(args.providerDefaultPaymentMethodId) ?? undefined;
  const active = args.status === "active" && Boolean(desiredPaymentMethodId);
  const paymentMethodStatus: WorkspacePaymentMethodStatus = active
    ? "active"
    : args.status === "active"
      ? "missing"
      : args.status;
  const desired = {
    provider: "stripe" as const,
    providerCustomerId,
    paymentMethodStatus,
    providerDefaultPaymentMethodId: active ? desiredPaymentMethodId : undefined,
    cardBrand: active ? normalizeOptionalString(args.cardBrand) : undefined,
    cardLast4: active ? normalizeOptionalString(args.cardLast4) : undefined,
    cardExpMonth: active ? normalizeOptionalNumber(args.cardExpMonth) : undefined,
    cardExpYear: active ? normalizeOptionalNumber(args.cardExpYear) : undefined,
  };

  if (!args.existing) {
    return {
      ...desired,
      paymentMethodCheckedAt: args.nowMs,
      cardRemovedAt: active ? undefined : args.nowMs,
      updatedAt: args.nowMs,
    };
  }

  const patch: StripeCustomerPatch = {};
  if (String(args.existing.provider ?? "stripe") !== desired.provider) {
    patch.provider = desired.provider;
  }
  if (normalizeStripeCustomerId(args.existing.providerCustomerId) !== providerCustomerId) {
    patch.providerCustomerId = providerCustomerId;
  }
  if (normalizeExistingPaymentMethodStatus(args.existing.paymentMethodStatus) !== paymentMethodStatus) {
    patch.paymentMethodStatus = paymentMethodStatus;
  }
  if (
    normalizeStripePaymentMethodId(args.existing.providerDefaultPaymentMethodId) !==
    desired.providerDefaultPaymentMethodId
  ) {
    patch.providerDefaultPaymentMethodId = desired.providerDefaultPaymentMethodId;
  }
  for (const key of ["cardBrand", "cardLast4"] as const) {
    if (normalizeOptionalString(args.existing[key]) !== desired[key]) {
      patch[key] = desired[key];
    }
  }
  for (const key of ["cardExpMonth", "cardExpYear"] as const) {
    if (normalizeOptionalNumber(args.existing[key]) !== desired[key]) {
      patch[key] = desired[key];
    }
  }

  const hadCardMaterial = Boolean(
    normalizeStripePaymentMethodId(args.existing.providerDefaultPaymentMethodId) ||
      normalizeOptionalString(args.existing.cardBrand) ||
      normalizeOptionalString(args.existing.cardLast4) ||
      normalizeOptionalNumber(args.existing.cardExpMonth) ||
      normalizeOptionalNumber(args.existing.cardExpYear) ||
      normalizeExistingPaymentMethodStatus(args.existing.paymentMethodStatus) === "active",
  );
  const hasRemovedAt = typeof normalizeOptionalNumber(args.existing.cardRemovedAt) === "number";
  if (active) {
    if (hasRemovedAt) patch.cardRemovedAt = undefined;
  } else if (hadCardMaterial && !hasRemovedAt) {
    patch.cardRemovedAt = args.nowMs;
  }

  if (Object.keys(patch).length === 0) return null;
  patch.paymentMethodCheckedAt = args.nowMs;
  patch.updatedAt = args.nowMs;
  return patch;
}
