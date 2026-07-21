export type CanonicalAccountTier = "free" | "architect";
export type EffectiveAccountTier = "anon_free" | "auth_free" | "architect";
export type CurrentAccountEntitlementSource = "admin_override" | "premium_subscription";

export type AccountEntitlementRowLike = {
  _id?: unknown;
  tier?: unknown;
  source?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AccountEntitlementResolution = {
  canonicalTier: CanonicalAccountTier;
  source: CurrentAccountEntitlementSource | null;
  startsAt: number | null;
  endsAt: number | null;
  reason:
    | "resolved"
    | "default_free"
    | "too_many_rows"
    | "unsupported_source"
    | "duplicate_source"
    | "invalid_row"
    | "invalid_evaluation_time"
    | "conflicting_revision";
  corrupt: boolean;
};

const CURRENT_SOURCE_SET = new Set<CurrentAccountEntitlementSource>([
  "admin_override",
  "premium_subscription",
]);
const MAX_CURRENT_SOURCE_ROWS = CURRENT_SOURCE_SET.size;
const MAX_COMPATIBILITY_SOURCE_ROWS = 32;

function normalizeTier(value: unknown): CanonicalAccountTier | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "free" || normalized === "architect" ? normalized : null;
}

function normalizeCurrentSource(value: unknown): CurrentAccountEntitlementSource | null {
  const normalized = String(value ?? "").trim();
  return CURRENT_SOURCE_SET.has(normalized as CurrentAccountEntitlementSource)
    ? (normalized as CurrentAccountEntitlementSource)
    : null;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedEndsAt(value: unknown): number | null {
  if (value == null) return null;
  return finiteTimestamp(value);
}

export function accountEntitlementRowIsActiveAt(
  row: AccountEntitlementRowLike,
  nowMs: number,
): boolean {
  const startsAt = finiteTimestamp(row.startsAt);
  const endsAt = normalizedEndsAt(row.endsAt);
  if (startsAt === null || startsAt > nowMs) return false;
  if (row.endsAt != null && endsAt === null) return false;
  if (endsAt !== null && endsAt < startsAt) return false;
  return endsAt === null || nowMs < endsAt;
}

function corruptResolution(
  reason: Exclude<AccountEntitlementResolution["reason"], "resolved" | "default_free">,
): AccountEntitlementResolution {
  return {
    canonicalTier: "free",
    source: null,
    startsAt: null,
    endsAt: null,
    reason,
    corrupt: true,
  };
}

export function resolveCanonicalAccountEntitlementFromRows(
  rows: readonly AccountEntitlementRowLike[],
  nowMs: number,
): AccountEntitlementResolution {
  if (!Number.isFinite(nowMs)) {
    return corruptResolution("invalid_evaluation_time");
  }
  if (rows.length > MAX_CURRENT_SOURCE_ROWS) {
    return corruptResolution("too_many_rows");
  }

  const sources = new Set<CurrentAccountEntitlementSource>();
  for (const row of rows) {
    const source = normalizeCurrentSource(row.source);
    if (!source) return corruptResolution("unsupported_source");
    if (sources.has(source)) return corruptResolution("duplicate_source");
    sources.add(source);
    if (!normalizeTier(row.tier)) return corruptResolution("invalid_row");
    const startsAt = finiteTimestamp(row.startsAt);
    const endsAt = normalizedEndsAt(row.endsAt);
    if (
      startsAt === null ||
      (row.endsAt != null && endsAt === null) ||
      (endsAt !== null && endsAt < startsAt)
    ) {
      return corruptResolution("invalid_row");
    }
  }

  const activeRows = rows
    .filter((row) => accountEntitlementRowIsActiveAt(row, nowMs))
    .map((row) => ({
      row,
      source: normalizeCurrentSource(row.source)!,
      tier: normalizeTier(row.tier)!,
      startsAt: finiteTimestamp(row.startsAt)!,
      endsAt: normalizedEndsAt(row.endsAt),
    }))
    .sort((a, b) => b.startsAt - a.startsAt || a.source.localeCompare(b.source));

  if (activeRows.length === 0) {
    return {
      canonicalTier: "free",
      source: null,
      startsAt: null,
      endsAt: null,
      reason: "default_free",
      corrupt: false,
    };
  }

  const latestStartsAt = activeRows[0].startsAt;
  const latestRows = activeRows.filter((row) => row.startsAt === latestStartsAt);
  if (new Set(latestRows.map((row) => row.tier)).size > 1) {
    return corruptResolution("conflicting_revision");
  }
  const selected = latestRows[0];
  return {
    canonicalTier: selected.tier,
    source: selected.source,
    startsAt: selected.startsAt,
    endsAt: selected.endsAt,
    reason: "resolved",
    corrupt: false,
  };
}

export async function readCanonicalAccountEntitlement(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<AccountEntitlementResolution> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(MAX_CURRENT_SOURCE_ROWS + 1);
  return resolveCanonicalAccountEntitlementFromRows(rows, nowMs);
}

export async function readCanonicalAccountTier(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<CanonicalAccountTier> {
  return (await readCanonicalAccountEntitlement(ctx, userId, nowMs)).canonicalTier;
}

function compareRowsNewestFirst(a: AccountEntitlementRowLike, b: AccountEntitlementRowLike): number {
  return (
    Number(b.startsAt ?? 0) - Number(a.startsAt ?? 0) ||
    Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
    String(b._id ?? "").localeCompare(String(a._id ?? ""))
  );
}

export async function upsertCurrentAccountEntitlementSource(args: {
  ctx: any;
  userId: any;
  source: CurrentAccountEntitlementSource;
  tier: CanonicalAccountTier;
  startsAt: number;
  endsAt?: number;
  nowMs: number;
}): Promise<{
  outcome: "inserted" | "updated" | "retry" | "stale" | "conflict_closed";
  rowId: unknown;
}> {
  if (normalizeCurrentSource(args.source) !== args.source) {
    throw new Error("account_entitlement_source_invalid");
  }
  if (normalizeTier(args.tier) !== args.tier) {
    throw new Error("account_entitlement_tier_invalid");
  }
  if (!Number.isFinite(args.startsAt)) throw new Error("account_entitlement_starts_at_invalid");
  if (!Number.isFinite(args.nowMs)) throw new Error("account_entitlement_updated_at_invalid");
  if (
    args.endsAt !== undefined &&
    (!Number.isFinite(args.endsAt) || args.endsAt < args.startsAt)
  ) {
    throw new Error("account_entitlement_ends_at_invalid");
  }

  const rows = await args.ctx.db
    .query("userEntitlements")
    .withIndex("by_user_source", (q: any) =>
      q.eq("userId", args.userId).eq("source", args.source),
    )
    .take(MAX_COMPATIBILITY_SOURCE_ROWS + 1);
  if (rows.length > MAX_COMPATIBILITY_SOURCE_ROWS) {
    throw new Error("account_entitlement_source_history_limit_exceeded");
  }
  rows.sort(compareRowsNewestFirst);
  const current = rows[0] ?? null;
  if (!current) {
    const rowId = await args.ctx.db.insert("userEntitlements", {
      userId: args.userId,
      tier: args.tier,
      source: args.source,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { outcome: "inserted", rowId };
  }

  const currentStartsAt = Number(current.startsAt);
  if (args.startsAt < currentStartsAt) {
    return { outcome: "stale", rowId: current._id };
  }
  if (args.startsAt === currentStartsAt) {
    const currentEndsAt = normalizedEndsAt(current.endsAt);
    const incomingEndsAt = args.endsAt ?? null;
    if (normalizeTier(current.tier) === args.tier && currentEndsAt === incomingEndsAt) {
      return { outcome: "retry", rowId: current._id };
    }
    await args.ctx.db.patch(current._id, {
      tier: "free",
      startsAt: args.startsAt,
      endsAt: args.startsAt,
      updatedAt: args.nowMs,
    });
    return { outcome: "conflict_closed", rowId: current._id };
  }

  await args.ctx.db.patch(current._id, {
    tier: args.tier,
    startsAt: args.startsAt,
    endsAt: args.endsAt,
    updatedAt: args.nowMs,
  });
  return { outcome: "updated", rowId: current._id };
}
