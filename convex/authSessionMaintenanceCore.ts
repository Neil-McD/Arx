const DEFAULT_AUTH_SESSION_PRUNE_BATCH_SIZE = 100;
export const MAX_AUTH_SESSION_PRUNE_BATCH_SIZE = 100;

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function normalizeAuthSessionPruneLimit(value: unknown): number {
  const parsed = normalizePositiveInteger(value);
  if (parsed === null) return DEFAULT_AUTH_SESSION_PRUNE_BATCH_SIZE;
  return Math.min(MAX_AUTH_SESSION_PRUNE_BATCH_SIZE, parsed);
}

export function normalizeAuthSessionPruneCutoff(value: unknown): number {
  const parsed = normalizePositiveInteger(value);
  if (parsed === null) throw new Error("auth_session_maintenance_cutoff_invalid");
  return parsed;
}

export function requireAuthSessionMaintenanceSecret(args: {
  expectedSecret: unknown;
  providedSecret: unknown;
}): void {
  if (
    typeof args.expectedSecret !== "string"
    || !args.expectedSecret
    || typeof args.providedSecret !== "string"
    || args.providedSecret !== args.expectedSecret
  ) {
    throw new Error("auth_session_maintenance_unauthorized");
  }
}

function readRevokedAt(row: { revokedAt?: unknown }): number | null {
  return normalizePositiveInteger(row.revokedAt);
}

export async function pruneRevokedAuthSessionsBatch(args: {
  ctx: any;
  revokedBeforeMs: unknown;
  limit?: unknown;
  dryRun?: boolean;
}): Promise<{
  scanned: number;
  eligible: number;
  deleted: number;
  has_more: boolean;
  done: boolean;
  dry_run: boolean;
  cutoff_ms: number;
  batch_limit: number;
}> {
  const cutoff = normalizeAuthSessionPruneCutoff(args.revokedBeforeMs);
  const limit = normalizeAuthSessionPruneLimit(args.limit);
  const dryRun = args.dryRun !== false;
  const rows = await args.ctx.db
    .query("authSessions")
    .withIndex("by_revokedAt", (q: any) =>
      q.gt("revokedAt", 0).lte("revokedAt", cutoff),
    )
    .order("asc")
    .take(limit + 1);
  const candidates = rows.slice(0, limit);

  for (const row of candidates) {
    const revokedAt = readRevokedAt(row);
    if (revokedAt === null || revokedAt > cutoff) {
      throw new Error("auth_session_maintenance_index_contract_invalid");
    }
  }

  if (!dryRun) {
    for (const row of candidates) await args.ctx.db.delete(row._id);
  }

  const hasMore = rows.length > limit;
  return {
    scanned: rows.length,
    eligible: candidates.length,
    deleted: dryRun ? 0 : candidates.length,
    has_more: hasMore,
    done: !hasMore,
    dry_run: dryRun,
    cutoff_ms: cutoff,
    batch_limit: limit,
  };
}
