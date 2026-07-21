import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
} from "./communityCore";
import type { CommunityJoinRequestLike } from "./communityJoinRequestCore";

const JOIN_REQUEST_MIGRATION_SCAN_LIMIT = 10_001;

type LegacyStatus = "pending" | "denied" | "approved" | "canceled" | "unknown";

type JoinRequestMigrationReport = {
  total_rows: number;
  scan_truncated: boolean;
  status_counts: Record<LegacyStatus, number>;
  duplicate_pairs: number;
  max_rows_per_pair: number;
  owner_rows: number;
  missing_community_rows: number;
  missing_user_rows: number;
  membership_pair_not_unique_rows: number;
  active_current_request_rows: number;
  approved_with_active_membership_rows: number;
  approved_without_active_membership_rows: number;
  malformed_pending_rows: number;
  malformed_denied_rows: number;
  message_field_rows: number;
  safe_to_migrate: boolean;
};

function legacyStatus(raw: unknown): LegacyStatus {
  const status = String(raw ?? "").trim().toLowerCase();
  return status === "pending" ||
    status === "denied" ||
    status === "approved" ||
    status === "canceled"
    ? status
    : "unknown";
}

async function buildJoinRequestMigrationReport(ctx: any): Promise<{
  report: JoinRequestMigrationReport;
  rows: CommunityJoinRequestLike[];
}> {
  const scanned = (await ctx.db
    .query("communityJoinRequests")
    .take(JOIN_REQUEST_MIGRATION_SCAN_LIMIT)) as CommunityJoinRequestLike[];
  const scanTruncated = scanned.length === JOIN_REQUEST_MIGRATION_SCAN_LIMIT;
  const rows = scanTruncated ? scanned.slice(0, -1) : scanned;
  const statusCounts: Record<LegacyStatus, number> = {
    pending: 0,
    denied: 0,
    approved: 0,
    canceled: 0,
    unknown: 0,
  };
  const pairCounts = new Map<string, number>();
  const communityCache = new Map<string, CommunityLike | null>();
  const userExistsCache = new Map<string, boolean>();
  let ownerRows = 0;
  let missingCommunityRows = 0;
  let missingUserRows = 0;
  let membershipPairNotUniqueRows = 0;
  let activeCurrentRequestRows = 0;
  let approvedWithActiveMembershipRows = 0;
  let approvedWithoutActiveMembershipRows = 0;
  let malformedPendingRows = 0;
  let malformedDeniedRows = 0;
  let messageFieldRows = 0;

  for (const row of rows) {
    const status = legacyStatus(row.status);
    statusCounts[status] += 1;
    const pairKey = `${String(row.communityId)}:${String(row.userId)}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    if (Object.prototype.hasOwnProperty.call(row, "message")) messageFieldRows += 1;
    if (status === "pending" && (row.deniedAt !== undefined || row.reapplyAt !== undefined)) {
      malformedPendingRows += 1;
    }
    if (
      status === "denied" &&
      (typeof row.deniedAt !== "number" ||
        !Number.isFinite(row.deniedAt) ||
        typeof row.reapplyAt !== "number" ||
        !Number.isFinite(row.reapplyAt) ||
        row.reapplyAt <= row.deniedAt)
    ) {
      malformedDeniedRows += 1;
    }

    const communityKey = String(row.communityId);
    let community = communityCache.get(communityKey);
    if (community === undefined) {
      community = (await ctx.db.get(row.communityId)) as CommunityLike | null;
      communityCache.set(communityKey, community);
    }
    if (!community) {
      missingCommunityRows += 1;
    } else if (String(community.ownerId) === String(row.userId)) {
      ownerRows += 1;
    }

    const userKey = String(row.userId);
    let userExists = userExistsCache.get(userKey);
    if (userExists === undefined) {
      userExists = Boolean(await ctx.db.get(row.userId));
      userExistsCache.set(userKey, userExists);
    }
    if (!userExists) missingUserRows += 1;

    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", row.communityId).eq("userId", row.userId),
      )
      .take(2)) as CommunityMembershipLike[];
    if (memberships.length > 1) membershipPairNotUniqueRows += 1;
    const activeMemberships = memberships.filter(communityMembershipRowIsActive);
    if (status === "pending" || status === "denied") {
      if (activeMemberships.length > 0) activeCurrentRequestRows += 1;
    } else if (status === "approved") {
      if (activeMemberships.length === 1 && memberships.length === 1) {
        approvedWithActiveMembershipRows += 1;
      } else {
        approvedWithoutActiveMembershipRows += 1;
      }
    }
  }

  const pairValues = Array.from(pairCounts.values());
  const duplicatePairs = pairValues.filter((count) => count > 1).length;
  const maxRowsPerPair = pairValues.length > 0 ? Math.max(...pairValues) : 0;
  const safeToMigrate =
    !scanTruncated &&
    duplicatePairs === 0 &&
    ownerRows === 0 &&
    missingCommunityRows === 0 &&
    missingUserRows === 0 &&
    membershipPairNotUniqueRows === 0 &&
    activeCurrentRequestRows === 0 &&
    approvedWithoutActiveMembershipRows === 0 &&
    malformedPendingRows === 0 &&
    malformedDeniedRows === 0 &&
    messageFieldRows === 0 &&
    statusCounts.unknown === 0;

  return {
    rows,
    report: {
      total_rows: rows.length,
      scan_truncated: scanTruncated,
      status_counts: statusCounts,
      duplicate_pairs: duplicatePairs,
      max_rows_per_pair: maxRowsPerPair,
      owner_rows: ownerRows,
      missing_community_rows: missingCommunityRows,
      missing_user_rows: missingUserRows,
      membership_pair_not_unique_rows: membershipPairNotUniqueRows,
      active_current_request_rows: activeCurrentRequestRows,
      approved_with_active_membership_rows: approvedWithActiveMembershipRows,
      approved_without_active_membership_rows: approvedWithoutActiveMembershipRows,
      malformed_pending_rows: malformedPendingRows,
      malformed_denied_rows: malformedDeniedRows,
      message_field_rows: messageFieldRows,
      safe_to_migrate: safeToMigrate,
    },
  };
}

export const preflightCanonicalJoinRequestsInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await buildJoinRequestMigrationReport(ctx)).report,
});

export const migrateCanonicalJoinRequestsInternal = internalMutation({
  args: {
    expectedTotalRows: v.number(),
    expectedPendingRows: v.number(),
    expectedDeniedRows: v.number(),
    expectedApprovedRows: v.number(),
    expectedCanceledRows: v.number(),
  },
  handler: async (ctx, args) => {
    const { report, rows } = await buildJoinRequestMigrationReport(ctx);
    if (!report.safe_to_migrate) throw new Error("join_request_migration_preflight_failed");
    if (
      report.total_rows !== args.expectedTotalRows ||
      report.status_counts.pending !== args.expectedPendingRows ||
      report.status_counts.denied !== args.expectedDeniedRows ||
      report.status_counts.approved !== args.expectedApprovedRows ||
      report.status_counts.canceled !== args.expectedCanceledRows
    ) {
      throw new Error("join_request_migration_expectation_mismatch");
    }
    let deletedApproved = 0;
    let deletedCanceled = 0;
    for (const row of rows) {
      const status = legacyStatus(row.status);
      if (status === "approved") {
        await ctx.db.delete(row._id);
        deletedApproved += 1;
      } else if (status === "canceled") {
        await ctx.db.delete(row._id);
        deletedCanceled += 1;
      }
    }
    return {
      deleted_approved_rows: deletedApproved,
      deleted_canceled_rows: deletedCanceled,
      remaining_rows: rows.length - deletedApproved - deletedCanceled,
    };
  },
});
