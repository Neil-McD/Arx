import { paginationOptsValidator } from "convex/server";

import { internalMutation, internalQuery } from "./_generated/server";
import {
  DEFAULT_COMMUNITY_LIFECYCLE_GENERATION,
  DEFAULT_COMMUNITY_LIFECYCLE_STATUS,
  normalizeCommunityLifecycleStatus,
} from "../shared/communityLifecycle";

const MAX_BATCH_SIZE = 100;

type CommunityLifecycleMigrationRow = {
  _id: any;
  lifecycleStatus?: "active" | "sunsetting" | "archived";
  lifecycleGeneration?: number;
  archiveRequestedAt?: number;
  archiveEffectiveAt?: number;
  archivedAt?: number;
  archiveRequestedByUserId?: any;
  restoredAt?: number;
};

function boundedPaginationOpts(args: {
  cursor: string | null;
  numItems: number;
}) {
  const numItems = Math.max(
    1,
    Math.min(MAX_BATCH_SIZE, Math.floor(args.numItems)),
  );
  return {
    cursor: args.cursor,
    numItems,
    maximumRowsRead: numItems,
  };
}

function rowHasLifecycleEvidence(row: CommunityLifecycleMigrationRow): boolean {
  return (
    row.archiveRequestedAt !== undefined ||
    row.archiveEffectiveAt !== undefined ||
    row.archivedAt !== undefined ||
    row.archiveRequestedByUserId !== undefined ||
    row.restoredAt !== undefined
  );
}

function generationIsCanonical(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function classifyLifecycleRow(row: CommunityLifecycleMigrationRow) {
  const missingStatus = row.lifecycleStatus === undefined;
  const missingGeneration = row.lifecycleGeneration === undefined;
  const invalidGeneration =
    !missingGeneration && !generationIsCanonical(row.lifecycleGeneration);
  const inconsistent = missingStatus && rowHasLifecycleEvidence(row);
  return {
    status: normalizeCommunityLifecycleStatus(row.lifecycleStatus),
    missingStatus,
    missingGeneration,
    invalidGeneration,
    inconsistent,
  };
}

export const auditCommunityLifecyclePageInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communities")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    const counts = {
      active: 0,
      sunsetting: 0,
      archived: 0,
      missingStatus: 0,
      missingGeneration: 0,
      invalidGeneration: 0,
      inconsistent: 0,
    };
    for (const row of page.page as CommunityLifecycleMigrationRow[]) {
      const classification = classifyLifecycleRow(row);
      counts[classification.status] += 1;
      if (classification.missingStatus) counts.missingStatus += 1;
      if (classification.missingGeneration) counts.missingGeneration += 1;
      if (classification.invalidGeneration) counts.invalidGeneration += 1;
      if (classification.inconsistent) counts.inconsistent += 1;
    }
    return {
      scanned: page.page.length,
      counts,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const backfillCommunityLifecyclePageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communities")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    let patched = 0;
    let alreadyCanonical = 0;
    let blocked = 0;
    for (const row of page.page as CommunityLifecycleMigrationRow[]) {
      const classification = classifyLifecycleRow(row);
      if (classification.inconsistent || classification.invalidGeneration) {
        blocked += 1;
        continue;
      }
      const patch: Record<string, unknown> = {};
      if (classification.missingStatus) {
        patch.lifecycleStatus = DEFAULT_COMMUNITY_LIFECYCLE_STATUS;
      }
      if (classification.missingGeneration) {
        patch.lifecycleGeneration = DEFAULT_COMMUNITY_LIFECYCLE_GENERATION;
      }
      if (Object.keys(patch).length === 0) {
        alreadyCanonical += 1;
        continue;
      }
      await ctx.db.patch(row._id, patch);
      patched += 1;
    }
    return {
      scanned: page.page.length,
      patched,
      alreadyCanonical,
      blocked,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
