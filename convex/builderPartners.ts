import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  evaluateLegacyBuilderPartnerRetirement,
  LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION,
  LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE,
  LEGACY_COMMUNITY_INFERENCE_STATUS,
  LEGACY_PARTNER_EXPECTED_COUNT,
  LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT,
  LEGACY_PARTNER_GRANT_KEY,
  LEGACY_PARTNER_SOURCE_PROGRAM,
  LEGACY_PARTNER_TERMS_DOCUMENT_KEY,
  LEGACY_PARTNER_TERMS_VERSION,
} from "./builderPartnerRetirementPolicy";

const LEGACY_PARTNER_INSPECTION_LIMIT = 1000;

function retiredProgramSnapshot() {
  return {
    programVersion: LEGACY_PARTNER_SOURCE_PROGRAM,
    programStatus: "retired" as const,
    state: "retired" as const,
    isUnlocked: false,
    eligible: false,
    requirements: [],
    partner: null,
    payout: {
      ready: false,
      status: "retired",
      label: "Program retired",
    },
    commissionSummary: {
      pendingUsd: 0,
      bufferedUsd: 0,
      readyUsd: 0,
      paidUsd: 0,
      totalUsd: 0,
      clawbackDebtUsd: 0,
      pendingCount: 0,
      bufferedCount: 0,
      readyCount: 0,
      paidCount: 0,
      clawbackDebtCount: 0,
    },
    attributionSummary: {
      activeCount: 0,
      boundCount: 0,
    },
    payoutHistory: {
      transfers: [],
    },
  };
}

async function readLegacyPartnerGrant(ctx: any, userId: any) {
  return await ctx.db
    .query("legacyProgramGrants")
    .withIndex("by_user_grantKey", (q: any) =>
      q.eq("userId", userId).eq("grantKey", LEGACY_PARTNER_GRANT_KEY),
    )
    .first();
}

async function readBuilderPartnerTermsAcceptance(ctx: any, userId: any) {
  return await ctx.db
    .query("legalAcceptances")
    .withIndex("by_user_document_version", (q: any) =>
      q
        .eq("userId", userId)
        .eq("documentKey", LEGACY_PARTNER_TERMS_DOCUMENT_KEY)
        .eq("documentVersion", LEGACY_PARTNER_TERMS_VERSION),
    )
    .first();
}

async function takeInspectionRows(ctx: any, table: string) {
  const rows = await ctx.db
    .query(table)
    .order("asc")
    .take(LEGACY_PARTNER_INSPECTION_LIMIT + 1);
  return {
    rows: rows.slice(0, LEGACY_PARTNER_INSPECTION_LIMIT),
    isTruncated: rows.length > LEGACY_PARTNER_INSPECTION_LIMIT,
  };
}

async function takeLegacyPartnerGrantInspectionRows(ctx: any) {
  const rows = await ctx.db
    .query("legacyProgramGrants")
    .withIndex("by_grantKey_capturedAt", (q: any) =>
      q.eq("grantKey", LEGACY_PARTNER_GRANT_KEY),
    )
    .order("asc")
    .take(LEGACY_PARTNER_INSPECTION_LIMIT + 1);
  return {
    rows: rows.slice(0, LEGACY_PARTNER_INSPECTION_LIMIT),
    isTruncated: rows.length > LEGACY_PARTNER_INSPECTION_LIMIT,
  };
}

async function takeOwnedCommunityInspectionRows(
  ctx: any,
  relevantUsers: ReadonlyMap<string, any>,
) {
  const rows: any[] = [];
  let isTruncated = false;
  for (const userId of relevantUsers.values()) {
    const owned = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
      .take(LEGACY_PARTNER_INSPECTION_LIMIT + 1);
    if (owned.length > LEGACY_PARTNER_INSPECTION_LIMIT) isTruncated = true;
    rows.push(...owned.slice(0, LEGACY_PARTNER_INSPECTION_LIMIT));
  }
  return { rows, isTruncated };
}

async function readCommunityInferencePoliciesForCommunity(ctx: any, communityId: any) {
  return await ctx.db
    .query("communityInferencePolicies")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect();
}

async function readLegacyBuilderPartnerRetirementState(ctx: any) {
  const [
    partnerInspection,
    grantInspection,
    communityPolicyInspection,
    attributionInspection,
    commissionInspection,
    adjustmentInspection,
    payoutBatchInspection,
    payoutTransferInspection,
    payoutItemInspection,
  ] = await Promise.all([
    takeInspectionRows(ctx, "builderPartners"),
    takeLegacyPartnerGrantInspectionRows(ctx),
    takeInspectionRows(ctx, "communityInferencePolicies"),
    takeInspectionRows(ctx, "partnerAttributions"),
    takeInspectionRows(ctx, "partnerCommissionLedger"),
    takeInspectionRows(ctx, "partnerCommissionAdjustments"),
    takeInspectionRows(ctx, "partnerPayoutBatches"),
    takeInspectionRows(ctx, "partnerPayoutTransfers"),
    takeInspectionRows(ctx, "partnerPayoutItems"),
  ]);
  const grandfatherGrants = grantInspection.rows;
  const relevantUsers = new Map<string, any>();
  for (const row of [...partnerInspection.rows, ...grandfatherGrants]) {
    relevantUsers.set(String(row.userId), row.userId);
  }
  const [legalAcceptancePairs, ownedCommunityInspection] = await Promise.all([
    Promise.all(
      [...relevantUsers.entries()].map(async ([userId, internalUserId]) => [
        userId,
        await readBuilderPartnerTermsAcceptance(ctx, internalUserId),
      ] as const),
    ),
    takeOwnedCommunityInspectionRows(ctx, relevantUsers),
  ]);
  const legalAcceptedUserIds = new Set(
    legalAcceptancePairs
      .filter(([, acceptance]) => Boolean(acceptance))
      .map(([userId]) => userId),
  );
  const financeCounts = {
    attributions: attributionInspection.rows.length,
    commissions: commissionInspection.rows.length,
    adjustments: adjustmentInspection.rows.length,
    payoutBatches: payoutBatchInspection.rows.length,
    payoutTransfers: payoutTransferInspection.rows.length,
    payoutItems: payoutItemInspection.rows.length,
  };
  const isTruncated = [
    partnerInspection,
    grantInspection,
    communityPolicyInspection,
    ownedCommunityInspection,
    attributionInspection,
    commissionInspection,
    adjustmentInspection,
    payoutBatchInspection,
    payoutTransferInspection,
    payoutItemInspection,
  ].some((inspection) => inspection.isTruncated);
  const evaluation = evaluateLegacyBuilderPartnerRetirement({
    partners: partnerInspection.rows,
    grandfatherGrants,
    ownedCommunities: ownedCommunityInspection.rows,
    communityInferencePolicies: communityPolicyInspection.rows,
    legalAcceptedUserIds,
    financeCounts,
    isTruncated,
  });
  return {
    partnerRows: partnerInspection.rows,
    grandfatherGrants,
    ownedCommunities: ownedCommunityInspection.rows,
    communityInferencePolicies: communityPolicyInspection.rows,
    evaluation,
  };
}

export const inspectLegacyBuilderPartnerRetirementInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const state = await readLegacyBuilderPartnerRetirementState(ctx);
    return {
      grantKey: LEGACY_PARTNER_GRANT_KEY,
      sourceProgram: LEGACY_PARTNER_SOURCE_PROGRAM,
      communityFundingMode: LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE,
      communityFundingStatus: LEGACY_COMMUNITY_INFERENCE_STATUS,
      communityContractVersion: LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION,
      ...state.evaluation,
      inspectedAt: Date.now(),
    };
  },
});

export const captureLegacyBuilderPartnerFoundationInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await readLegacyBuilderPartnerRetirementState(ctx);
    if (state.evaluation.sourceDeletionComplete) {
      return {
        ok: true,
        grantKey: LEGACY_PARTNER_GRANT_KEY,
        scanned: 0,
        created: 0,
        alreadyCaptured: LEGACY_PARTNER_EXPECTED_COUNT,
        communitiesScanned: 0,
        communityPoliciesCreated: 0,
        communityPoliciesAlreadyCaptured: LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT,
        sourceDeleted: true,
        capturedAt: Date.now(),
      };
    }
    if (state.evaluation.isTruncated) {
      throw new Error("legacy_builder_partner_migration_inspection_truncated");
    }
    if (state.evaluation.partners.total !== LEGACY_PARTNER_EXPECTED_COUNT) {
      throw new Error("legacy_builder_partner_source_count_mismatch");
    }
    if (
      state.evaluation.partners.nonActive !== 0 ||
      state.evaluation.partners.sourceTermsEvidenceInvalidCount !== 0 ||
      state.evaluation.partners.duplicateSourceUserCount !== 0
    ) {
      throw new Error("legacy_builder_partner_source_evidence_mismatch");
    }
    if (state.evaluation.financialRows !== 0) {
      throw new Error("legacy_builder_partner_financial_rows_present");
    }
    if (
      state.evaluation.ownedCommunities.total !== LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT ||
      state.evaluation.ownedCommunities.distributionMatches !== true ||
      state.evaluation.ownedCommunities.duplicateOwnedCommunityCount !== 0 ||
      state.evaluation.ownedCommunities.unexpectedOwnerCount !== 0
    ) {
      throw new Error("legacy_builder_partner_owned_community_boundary_mismatch");
    }
    if (
      state.evaluation.grandfatherGrants.unexpectedGrantUserCount !== 0 ||
      state.evaluation.grandfatherGrants.mismatchedGrantCount !== 0 ||
      state.evaluation.grandfatherGrants.duplicateGrantUserCount !== 0 ||
      state.evaluation.grandfatherGrants.duplicateSourceRecordIdCount !== 0
    ) {
      throw new Error("legacy_builder_partner_grant_conflict");
    }
    if (
      state.evaluation.communityInferencePolicies.unexpectedPolicyCommunityCount !== 0 ||
      state.evaluation.communityInferencePolicies.mismatchedCommunityPolicyCount !== 0 ||
      state.evaluation.communityInferencePolicies.duplicateCommunityPolicyCount !== 0
    ) {
      throw new Error("legacy_builder_partner_community_inference_policy_conflict");
    }

    const capturedAt = Date.now();
    let created = 0;
    let alreadyCaptured = 0;
    for (const partner of state.partnerRows) {
      const legalAcceptance = await readBuilderPartnerTermsAcceptance(ctx, partner.userId);
      if (!legalAcceptance) {
        throw new Error("legacy_builder_partner_legal_acceptance_missing");
      }
      const existing = await readLegacyPartnerGrant(ctx, partner.userId);
      if (existing) {
        if (
          existing.sourceRecordId !== String(partner._id) ||
          existing.sourceProgram !== LEGACY_PARTNER_SOURCE_PROGRAM ||
          existing.sourceStatus !== "active" ||
          existing.acceptedTermsVersion !== LEGACY_PARTNER_TERMS_VERSION ||
          existing.acceptedTermsAt !== partner.acceptedTermsAt
        ) {
          throw new Error("legacy_builder_partner_grant_conflict");
        }
        alreadyCaptured += 1;
        continue;
      }
      await ctx.db.insert("legacyProgramGrants", {
        userId: partner.userId,
        grantKey: LEGACY_PARTNER_GRANT_KEY,
        sourceProgram: LEGACY_PARTNER_SOURCE_PROGRAM,
        sourceRecordId: String(partner._id),
        sourceStatus: "active",
        acceptedTermsVersion: LEGACY_PARTNER_TERMS_VERSION,
        acceptedTermsAt: partner.acceptedTermsAt,
        capturedAt,
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
      created += 1;
    }

    const partnerByUserId = new Map(
      state.partnerRows.map((partner: any) => [String(partner.userId), partner]),
    );
    let communityPoliciesCreated = 0;
    let communityPoliciesAlreadyCaptured = 0;
    for (const community of state.ownedCommunities) {
      const partner = partnerByUserId.get(String(community.ownerId)) as any;
      if (!partner) {
        throw new Error("legacy_builder_partner_owned_community_boundary_mismatch");
      }
      const existingRows = await readCommunityInferencePoliciesForCommunity(
        ctx,
        community._id,
      );
      if (existingRows.length > 1) {
        throw new Error("legacy_builder_partner_community_inference_policy_conflict");
      }
      const existing = existingRows[0] ?? null;
      if (existing) {
        if (
          existing.payerUserId !== community.ownerId ||
          existing.fundingMode !== LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE ||
          existing.status !== LEGACY_COMMUNITY_INFERENCE_STATUS ||
          existing.contractVersion !== LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION ||
          existing.sourceGrantKey !== LEGACY_PARTNER_GRANT_KEY ||
          existing.sourceProgram !== LEGACY_PARTNER_SOURCE_PROGRAM ||
          existing.sourcePartnerRecordId !== String(partner._id)
        ) {
          throw new Error("legacy_builder_partner_community_inference_policy_conflict");
        }
        communityPoliciesAlreadyCaptured += 1;
        continue;
      }
      await ctx.db.insert("communityInferencePolicies", {
        communityId: community._id,
        payerUserId: community.ownerId,
        fundingMode: LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE,
        status: LEGACY_COMMUNITY_INFERENCE_STATUS,
        contractVersion: LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION,
        sourceGrantKey: LEGACY_PARTNER_GRANT_KEY,
        sourceProgram: LEGACY_PARTNER_SOURCE_PROGRAM,
        sourcePartnerRecordId: String(partner._id),
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
      communityPoliciesCreated += 1;
    }

    return {
      ok: true,
      grantKey: LEGACY_PARTNER_GRANT_KEY,
      scanned: state.partnerRows.length,
      created,
      alreadyCaptured,
      communitiesScanned: state.ownedCommunities.length,
      communityPoliciesCreated,
      communityPoliciesAlreadyCaptured,
      sourceDeleted: false,
      capturedAt,
    };
  },
});

export const deleteLegacyBuilderPartnerSourceInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await readLegacyBuilderPartnerRetirementState(ctx);
    if (state.evaluation.sourceDeletionComplete) {
      return {
        ok: true,
        alreadyDeleted: true,
        deletedSourcePartners: 0,
        retainedGrandfatherGrants: LEGACY_PARTNER_EXPECTED_COUNT,
        retainedCommunityInferencePolicies: LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT,
        deletedAt: Date.now(),
      };
    }
    if (!state.evaluation.readyForSourceDeletion) {
      throw new Error("legacy_builder_partner_source_deletion_not_ready");
    }
    for (const partner of state.partnerRows) {
      await ctx.db.delete(partner._id);
    }
    return {
      ok: true,
      alreadyDeleted: false,
      deletedSourcePartners: state.partnerRows.length,
      retainedGrandfatherGrants: state.grandfatherGrants.length,
      retainedCommunityInferencePolicies: state.communityInferencePolicies.length,
      deletedAt: Date.now(),
    };
  },
});

// Cached-client compatibility only. Builder Partner v1 has no active product surface.
export const getMyBuilderPartnerProgram = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async () => retiredProgramSnapshot(),
});

export const acceptBuilderPartnerTermsAndEnsure = mutation({
  args: {
    authSubject: v.optional(v.string()),
    termsVersion: v.string(),
  },
  handler: async () => {
    throw new Error("builder_partner_program_retired");
  },
});

export const recordBuilderPartnerAttribution = mutation({
  args: {
    referralCode: v.string(),
    visitorKey: v.optional(v.string()),
    authSubject: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
  },
  handler: async () => ({
    ok: false,
    reason: "builder_partner_program_retired" as const,
  }),
});

export const listPartnerPerformanceForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
    limit: v.optional(v.number()),
  },
  handler: async () => ({
    range: "all" as const,
    summary: {
      totalPartners: 0,
      activePartners: 0,
      pausedPartners: 0,
      disabledPartners: 0,
      commissionGeneratedUsd: 0,
      partnerPaidOutUsd: 0,
    },
    topPartners: [],
    evidence: {
      sourceTables: [],
      computedAt: Date.now(),
      rangeStart: null,
      rangeEnd: Date.now(),
      scannedPartnerLimit: 0,
      scannedCommissionLimit: 0,
      scannedTransferLimit: 0,
      isTruncated: false,
      retired: true,
    },
  }),
});

export const listPartnerPayoutCyclesForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async () => ({
    cycles: [],
    evidence: {
      sourceTables: [],
      computedAt: Date.now(),
      retired: true,
    },
  }),
});

function retiredOperatorMutation() {
  throw new Error("builder_partner_program_retired");
}

export const approvePartnerPayoutCycle = mutation({
  args: { authSubject: v.optional(v.string()), batchId: v.any() },
  handler: async () => retiredOperatorMutation(),
});

export const retryPartnerPayoutCycle = mutation({
  args: { authSubject: v.optional(v.string()), batchId: v.any() },
  handler: async () => retiredOperatorMutation(),
});

export const holdPartnerPayoutCycle = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.any(),
    reason: v.optional(v.string()),
  },
  handler: async () => retiredOperatorMutation(),
});

export const rejectPartnerPayoutCycle = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.any(),
    reason: v.optional(v.string()),
  },
  handler: async () => retiredOperatorMutation(),
});
