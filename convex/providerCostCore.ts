import type {
  ProviderCostBillingDisposition,
  ProviderCostCategory,
  ProviderCostComponent,
  ProviderCostEvidenceType,
} from "../shared/providerCostAccounting";
import {
  roundProviderCostQuantity,
  roundProviderCostUsd,
} from "../shared/providerCostAccounting";

export type ProviderCostEntryInput = {
  costKey: string;
  userId?: any;
  projectId?: any;
  communityId?: any;
  runId?: string | null;
  category: ProviderCostCategory;
  component: ProviderCostComponent;
  provider: string;
  resourceId?: string | null;
  periodStart: number;
  periodEnd: number;
  quantityKind: string;
  quantity: number;
  rawVendorCostUsd: number;
  evidence: ProviderCostEvidenceType;
  billingDisposition: ProviderCostBillingDisposition;
  linkedCreditKey?: string | null;
  metadata?: unknown;
  nowMs?: number;
};

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeObjectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

const PROVIDER_COST_EVIDENCE_RANK: Record<ProviderCostEvidenceType, number> = {
  estimated: 1,
  provider_reported: 2,
  exact: 3,
};

function resolveProviderCostEvidenceRank(value: unknown): number {
  const normalized = normalizeOptionalString(value);
  if (
    normalized === "estimated" ||
    normalized === "provider_reported" ||
    normalized === "exact"
  ) {
    return PROVIDER_COST_EVIDENCE_RANK[normalized];
  }
  return 0;
}

function normalizeProviderCostIdentityValue(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

function createProviderCostEntryRow(
  args: ProviderCostEntryInput,
  costKey: string,
  nowMs: number,
) {
  const periodStart = normalizeOptionalNumber(args.periodStart) ?? nowMs;
  const periodEnd = Math.max(
    periodStart,
    normalizeOptionalNumber(args.periodEnd) ?? periodStart,
  );
  return {
    costKey,
    ...(args.userId ? { userId: args.userId } : {}),
    ...(args.projectId ? { projectId: args.projectId } : {}),
    ...(args.communityId ? { communityId: args.communityId } : {}),
    ...(normalizeOptionalString(args.runId)
      ? { runId: normalizeOptionalString(args.runId) }
      : {}),
    category: args.category,
    component: args.component,
    provider: String(args.provider ?? "").trim() || "unknown",
    ...(normalizeOptionalString(args.resourceId)
      ? { resourceId: normalizeOptionalString(args.resourceId) }
      : {}),
    periodStart,
    periodEnd,
    quantityKind: String(args.quantityKind ?? "").trim() || "unit",
    quantity: roundProviderCostQuantity(Math.max(0, Number(args.quantity) || 0)),
    rawVendorCostUsd: roundProviderCostUsd(
      Math.max(0, Number(args.rawVendorCostUsd) || 0),
    ),
    evidence: args.evidence,
    billingDisposition: args.billingDisposition,
    ...(normalizeOptionalString(args.linkedCreditKey)
      ? { linkedCreditKey: normalizeOptionalString(args.linkedCreditKey) }
      : {}),
    ...(args.metadata === undefined ? {} : { metadata: args.metadata }),
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

function resolveProviderCostIdentityMismatch(
  existing: any,
  incoming: ReturnType<typeof createProviderCostEntryRow>,
): string | null {
  const identityFields = [
    "category",
    "component",
    "billingDisposition",
    "userId",
    "projectId",
    "communityId",
    "linkedCreditKey",
  ] as const;
  for (const field of identityFields) {
    if (
      normalizeProviderCostIdentityValue(existing?.[field]) !==
      normalizeProviderCostIdentityValue(incoming?.[field])
    ) {
      return field;
    }
  }
  return null;
}

function buildProviderCostEvidenceUpgradePatch(
  existing: any,
  incoming: ReturnType<typeof createProviderCostEntryRow>,
  nowMs: number,
): Record<string, unknown> | null {
  if (
    resolveProviderCostEvidenceRank(incoming.evidence) <=
    resolveProviderCostEvidenceRank(existing?.evidence)
  ) {
    return null;
  }
  return {
    provider: incoming.provider,
    ...(normalizeOptionalString(incoming.resourceId)
      ? { resourceId: normalizeOptionalString(incoming.resourceId) }
      : {}),
    periodStart: incoming.periodStart,
    periodEnd: incoming.periodEnd,
    quantityKind: incoming.quantityKind,
    quantity: incoming.quantity,
    rawVendorCostUsd: incoming.rawVendorCostUsd,
    evidence: incoming.evidence,
    metadata: {
      ...normalizeObjectMetadata(existing?.metadata),
      ...normalizeObjectMetadata(incoming.metadata),
      previous_evidence: normalizeOptionalString(existing?.evidence) ?? null,
      previous_raw_vendor_cost_usd:
        normalizeOptionalNumber(existing?.rawVendorCostUsd) ?? null,
      provider_cost_upgraded_at: nowMs,
    },
    updatedAt: nowMs,
  };
}

export async function recordProviderCostEntry(
  ctx: any,
  args: ProviderCostEntryInput,
  options?: { failOnIdentityMismatch?: boolean },
): Promise<any> {
  const costKey = normalizeOptionalString(args.costKey);
  if (!costKey) throw new Error("provider_cost_key_required");
  const nowMs = args.nowMs ?? Date.now();
  const row = createProviderCostEntryRow(args, costKey, nowMs);
  const rows = await ctx.db
    .query("providerCostEntries")
    .withIndex("by_costKey", (q: any) => q.eq("costKey", costKey))
    .take(2);
  if (rows.length > 1) throw new Error("provider_cost_entry_ambiguous");
  const existing = rows[0];
  if (existing) {
    const mismatchField = resolveProviderCostIdentityMismatch(existing, row);
    if (mismatchField) {
      if (options?.failOnIdentityMismatch) {
        throw new Error(`provider_cost_identity_mismatch:${mismatchField}`);
      }
      console.warn("provider_cost_identity_mismatch", {
        cost_key: costKey,
        field: mismatchField,
      });
      return existing;
    }
    const upgradePatch = buildProviderCostEvidenceUpgradePatch(existing, row, nowMs);
    if (!upgradePatch) return existing;
    await ctx.db.patch(existing._id, upgradePatch);
    return await ctx.db.get(existing._id);
  }

  const id = await ctx.db.insert("providerCostEntries", row);
  return await ctx.db.get(id);
}
