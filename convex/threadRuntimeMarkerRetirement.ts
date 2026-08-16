import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const THREAD_RUNTIME_MARKER_RETIREMENT_VERSION =
  "thread_runtime_marker_retirement_v1" as const;

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function normalizePageSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("thread_runtime_marker_page_size_invalid");
  }
  return Math.min(MAX_PAGE_SIZE, Math.floor(value));
}

function residueQuery(db: any): any {
  return db
    .query("threads")
    .filter((q: any) => q.neq(q.field("runtimeEngine"), undefined));
}

function documentIds(rows: Array<Record<string, unknown>>): string[] {
  return rows.map((row) => String(row._id));
}

function requireExpectedDocumentIds(
  expected: string[] | undefined,
  actual: string[],
): void {
  if (!expected || expected.length !== actual.length) {
    throw new Error("thread_runtime_marker_expected_documents_required");
  }
  if (expected.some((id, index) => id !== actual[index])) {
    throw new Error("thread_runtime_marker_batch_changed");
  }
}

export const inspectThreadRuntimeMarkerPageInternal = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await residueQuery(ctx.db).paginate({
      cursor: args.cursor ?? null,
      numItems: normalizePageSize(args.pageSize),
    });
    return {
      version: THREAD_RUNTIME_MARKER_RETIREMENT_VERSION,
      residueCount: page.page.length,
      candidateDocumentIds: documentIds(page.page),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const cleanThreadRuntimeMarkerBatchInternal = internalMutation({
  args: {
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    expectedDocumentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun !== false;
    const rows = await residueQuery(ctx.db).take(normalizePageSize(args.pageSize));
    const candidateDocumentIds = documentIds(rows);

    if (!dryRun) {
      requireExpectedDocumentIds(args.expectedDocumentIds, candidateDocumentIds);
      for (const row of rows) {
        await ctx.db.patch(row._id as any, { runtimeEngine: undefined });
      }
    }

    return {
      version: THREAD_RUNTIME_MARKER_RETIREMENT_VERSION,
      dryRun,
      wouldPatch: rows.length,
      patched: dryRun ? 0 : rows.length,
      candidateDocumentIds,
      isDone: rows.length === 0,
    };
  },
});
