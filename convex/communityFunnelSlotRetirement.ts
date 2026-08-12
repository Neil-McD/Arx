import { paginationOptsValidator } from "convex/server";

import { normalizeCommunityFunnelContentV2 } from "../shared/communityFunnel";
import { internalMutation, internalQuery } from "./_generated/server";

const MAX_BATCH_SIZE = 50;

type FunnelRow = {
  _id: any;
  communityId: any;
  slot?: "custom_1" | "custom_2";
  heroMediaUrl?: string;
  heroMediaKind?: "image" | "video";
  liveMode?: "default" | "custom";
  draftVslUrl?: string | null;
  publishedVslUrl?: string | null;
  draftContentV2?: unknown;
  publishedContentV2?: unknown;
  draftDocumentV1?: unknown;
  publishedDocumentV1?: unknown;
  draftRevision?: number;
  draftUpdatedAt?: number;
  draftUpdatedByUserId?: any;
  publishedDraftRevision?: number;
  publishedAt?: number;
  publishedByUserId?: any;
  createdAt: number;
  updatedAt: number;
};

function boundedPaginationOpts(args: { cursor: string | null; numItems: number }) {
  const requested = Math.floor(Number(args.numItems));
  const numItems = Number.isFinite(requested)
    ? Math.max(1, Math.min(MAX_BATCH_SIZE, requested))
    : MAX_BATCH_SIZE;
  return { cursor: args.cursor, numItems };
}

function timestamp(row: FunnelRow, field: "draft" | "published" | "updated") {
  if (field === "draft") return Number(row.draftUpdatedAt ?? row.updatedAt ?? 0);
  if (field === "published") return Number(row.publishedAt ?? row.updatedAt ?? 0);
  return Number(row.updatedAt ?? row.createdAt ?? 0);
}

function newest(rows: FunnelRow[], field: "draft" | "published" | "updated") {
  return [...rows].sort((left, right) => timestamp(right, field) - timestamp(left, field))[0] ?? null;
}

export function resolveCommunityFunnelSlotCollapse(community: any, rows: FunnelRow[]) {
  const validDraftRows = rows.filter((row) => normalizeCommunityFunnelContentV2(row.draftContentV2));
  const validPublishedRows = rows.filter((row) => normalizeCommunityFunnelContentV2(row.publishedContentV2));
  const explicitActiveSlot =
    community.activeFunnelSlot === "custom_1" || community.activeFunnelSlot === "custom_2"
      ? community.activeFunnelSlot
      : null;
  const activePublishedRow = explicitActiveSlot
    ? validPublishedRows.find((row) => row.slot === explicitActiveSlot) ?? null
    : null;
  const canonicalLiveRow = validPublishedRows.find((row) => row.liveMode === "custom") ?? null;
  const historicalImplicitLiveRow = community.activeFunnelSlot === undefined && rows.length === 1
    ? validPublishedRows[0] ?? null
    : null;
  const livePublishedRow = activePublishedRow ?? canonicalLiveRow ?? historicalImplicitLiveRow;
  const publishedSource = livePublishedRow ?? newest(validPublishedRows, "published");
  const draftSource = newest(validDraftRows, "draft");
  const freshestSource = newest(rows, "updated");
  const target = livePublishedRow ?? draftSource ?? publishedSource ?? freshestSource;
  if (!target) return null;

  const mediaSource = newest(
    rows.filter((row) => Boolean(row.heroMediaUrl)),
    "updated",
  ) ?? freshestSource;
  const liveMode = livePublishedRow ? "custom" : "default";
  return {
    target,
    patch: {
      slot: undefined,
      liveMode,
      heroMediaUrl: mediaSource?.heroMediaUrl,
      heroMediaKind: mediaSource?.heroMediaUrl ? (mediaSource.heroMediaKind ?? "image") : undefined,
      draftVslUrl: draftSource?.draftVslUrl,
      draftContentV2: normalizeCommunityFunnelContentV2(draftSource?.draftContentV2) ?? undefined,
      draftRevision: draftSource?.draftRevision,
      draftUpdatedAt: draftSource?.draftUpdatedAt,
      draftUpdatedByUserId: draftSource?.draftUpdatedByUserId,
      publishedVslUrl: publishedSource?.publishedVslUrl,
      publishedContentV2:
        normalizeCommunityFunnelContentV2(publishedSource?.publishedContentV2) ?? undefined,
      publishedDraftRevision: publishedSource?.publishedDraftRevision,
      publishedAt: publishedSource?.publishedAt,
      publishedByUserId: publishedSource?.publishedByUserId,
      draftDocumentV1: undefined,
      publishedDocumentV1: undefined,
      updatedAt: Math.max(...rows.map((row) => timestamp(row, "updated"))),
    },
    deleteIds: rows.filter((row) => row._id !== target._id).map((row) => row._id),
  };
}

async function processPage(ctx: any, args: any, apply: boolean) {
  const page = await ctx.db
    .query("communities")
    .paginate(boundedPaginationOpts(args.paginationOpts));
  const counts = {
    scannedCommunities: page.page.length,
    communitiesWithFunnels: 0,
    duplicateCommunities: 0,
    funnelRows: 0,
    rowsToPatch: 0,
    rowsToDelete: 0,
    legacySlotRows: 0,
    legacyV1Rows: 0,
    legacyCommunitySelectors: 0,
    customLiveCommunities: 0,
  };

  for (const community of page.page) {
    const rows = (await ctx.db
      .query("communityFunnels")
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as FunnelRow[];
    if (community.activeFunnelSlot !== undefined) counts.legacyCommunitySelectors += 1;
    if (rows.length === 0) {
      if (apply && community.activeFunnelSlot !== undefined) {
        await ctx.db.patch(community._id, { activeFunnelSlot: undefined });
      }
      continue;
    }
    counts.communitiesWithFunnels += 1;
    counts.funnelRows += rows.length;
    if (rows.length > 1) counts.duplicateCommunities += 1;
    counts.legacySlotRows += rows.filter((row) => row.slot !== undefined).length;
    counts.legacyV1Rows += rows.filter(
      (row) => row.draftDocumentV1 !== undefined || row.publishedDocumentV1 !== undefined,
    ).length;
    const collapse = resolveCommunityFunnelSlotCollapse(community, rows);
    if (!collapse) continue;
    counts.rowsToPatch += 1;
    counts.rowsToDelete += collapse.deleteIds.length;
    if (collapse.patch.liveMode === "custom") counts.customLiveCommunities += 1;
    if (apply) {
      await ctx.db.patch(collapse.target._id, collapse.patch);
      for (const rowId of collapse.deleteIds) await ctx.db.delete(rowId);
      if (community.activeFunnelSlot !== undefined) {
        await ctx.db.patch(community._id, { activeFunnelSlot: undefined });
      }
    }
  }

  return {
    ok: true,
    applied: apply,
    ...counts,
    continueCursor: page.continueCursor,
    isDone: page.isDone,
  };
}

export const auditPageInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => processPage(ctx, args, false),
});

export const collapsePageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => processPage(ctx, args, true),
});
