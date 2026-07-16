import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const MAX_LEGACY_ROWS = 100;
const RUN_LOOKUP_WINDOW_MS = 10 * 60 * 1_000;
const RUN_LOOKUP_LIMIT = 30;
const RUN_EVENT_LIMIT = 240;
const RETIREMENT_CONFIRMATION = "retire_legacy_community_agent_cycle_ledger_v1";

type LegacyCycleLedgerRow = {
  _id: any;
  communityId: any;
  cycleId: string;
  seq: number;
  role: string;
  content: string;
  createdAt: number;
};

type RetirementMatch = {
  row_id: string;
  cycle_id: string;
  role: string;
  seq: number;
  run_id: string | null;
  event_seq: number | null;
  matched: boolean;
};

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function nestedValueContainsExactString(value: unknown, target: string): boolean {
  if (value === target) return true;
  if (Array.isArray(value)) {
    return value.some((item) => nestedValueContainsExactString(item, target));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      nestedValueContainsExactString(item, target),
    );
  }
  return false;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fingerprintMaterial(rows: LegacyCycleLedgerRow[]): string {
  return rows
    .slice()
    .sort((left, right) => normalizeId(left._id).localeCompare(normalizeId(right._id)))
    .map((row) =>
      JSON.stringify({
        id: normalizeId(row._id),
        community_id: normalizeId(row.communityId),
        cycle_id: row.cycleId,
        seq: Math.floor(row.seq),
        role: row.role,
        content: row.content,
        created_at: Math.floor(row.createdAt),
      }),
    )
    .join("\n");
}

async function readLegacyRows(ctx: any): Promise<LegacyCycleLedgerRow[]> {
  const rows = (await ctx.db
    .query("communityAgentCycleLedgers" as any)
    .take(MAX_LEGACY_ROWS + 1)) as LegacyCycleLedgerRow[];
  if (rows.length > MAX_LEGACY_ROWS) {
    throw new Error("community_agent_cycle_ledger_retirement_row_limit_exceeded");
  }
  return rows;
}

async function findCanonicalMatch(
  ctx: any,
  row: LegacyCycleLedgerRow,
): Promise<RetirementMatch> {
  const candidateRuns = (await ctx.db
    .query("communityAgentRuns" as any)
    .withIndex("by_community_createdAt", (q: any) =>
      q
        .eq("communityId", row.communityId)
        .gte("createdAt", row.createdAt - RUN_LOOKUP_WINDOW_MS)
        .lte("createdAt", row.createdAt + RUN_LOOKUP_WINDOW_MS),
    )
    .take(RUN_LOOKUP_LIMIT)) as Array<Record<string, unknown>>;
  const matchingRuns = candidateRuns.filter(
    (run) => run.heartbeatId === row.cycleId && run.role === row.role,
  );
  if (matchingRuns.length !== 1) {
    return {
      row_id: normalizeId(row._id),
      cycle_id: row.cycleId,
      role: row.role,
      seq: Math.floor(row.seq),
      run_id: null,
      event_seq: null,
      matched: false,
    };
  }

  const runId = normalizeId(matchingRuns[0]?._id);
  const events = (await ctx.db
    .query("communityAgentRunEvents" as any)
    .withIndex("by_run_seq", (q: any) => q.eq("runId", runId))
    .take(RUN_EVENT_LIMIT)) as Array<Record<string, unknown>>;
  const matchingEvents = events.filter((event) => {
    if (event.kind !== "tool_call" || event.toolName !== "note") return false;
    try {
      return nestedValueContainsExactString(JSON.parse(String(event.content ?? "")), row.content);
    } catch {
      return false;
    }
  });
  if (matchingEvents.length !== 1) {
    return {
      row_id: normalizeId(row._id),
      cycle_id: row.cycleId,
      role: row.role,
      seq: Math.floor(row.seq),
      run_id: runId,
      event_seq: null,
      matched: false,
    };
  }

  return {
    row_id: normalizeId(row._id),
    cycle_id: row.cycleId,
    role: row.role,
    seq: Math.floor(row.seq),
    run_id: runId,
    event_seq: Math.floor(Number(matchingEvents[0]?.seq ?? 0)),
    matched: true,
  };
}

async function inspectRetirement(ctx: any) {
  const rows = await readLegacyRows(ctx);
  const matches: RetirementMatch[] = [];
  for (const row of rows) {
    matches.push(await findCanonicalMatch(ctx, row));
  }
  const rowIds = rows.map((row) => normalizeId(row._id)).sort();
  const unmatched = matches.filter((match) => !match.matched);
  return {
    row_count: rows.length,
    matched_count: matches.length - unmatched.length,
    unmatched_count: unmatched.length,
    fingerprint: await sha256Hex(fingerprintMaterial(rows)),
    row_ids: rowIds,
    cycles: Array.from(new Set(rows.map((row) => row.cycleId))).sort(),
    unmatched_rows: unmatched,
  };
}

export const auditCommunityAgentCycleLedgerRetirementInternal = internalQuery({
  args: {},
  handler: async (ctx) => await inspectRetirement(ctx),
});

export const retireCommunityAgentCycleLedgerInternal = internalMutation({
  args: {
    confirmation: v.literal(RETIREMENT_CONFIRMATION),
    expectedFingerprint: v.string(),
    rowIds: v.array(v.id("communityAgentCycleLedgers")),
  },
  handler: async (ctx, args) => {
    if (args.rowIds.length > MAX_LEGACY_ROWS) {
      throw new Error("community_agent_cycle_ledger_retirement_row_limit_exceeded");
    }
    const inspection = await inspectRetirement(ctx);
    if (inspection.row_count === 0) {
      return {
        deleted: 0,
        remaining: 0,
        fingerprint: inspection.fingerprint,
      };
    }
    if (inspection.unmatched_count !== 0) {
      throw new Error("community_agent_cycle_ledger_retirement_canonical_match_failed");
    }
    if (inspection.fingerprint !== args.expectedFingerprint.trim().toLowerCase()) {
      throw new Error("community_agent_cycle_ledger_retirement_fingerprint_changed");
    }
    const expectedRowIds = args.rowIds.map(normalizeId).sort();
    if (
      expectedRowIds.length !== inspection.row_ids.length ||
      expectedRowIds.some((rowId, index) => rowId !== inspection.row_ids[index])
    ) {
      throw new Error("community_agent_cycle_ledger_retirement_row_set_changed");
    }

    for (const rowId of args.rowIds) {
      const row = await ctx.db.get(rowId);
      if (!row) {
        throw new Error("community_agent_cycle_ledger_retirement_row_missing");
      }
      await ctx.db.delete(rowId);
    }
    const remaining = await ctx.db
      .query("communityAgentCycleLedgers" as any)
      .take(1);
    if (remaining.length !== 0) {
      throw new Error("community_agent_cycle_ledger_retirement_incomplete");
    }
    return {
      deleted: args.rowIds.length,
      remaining: 0,
      fingerprint: inspection.fingerprint,
    };
  },
});
