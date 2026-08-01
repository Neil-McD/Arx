import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const RETIRED_BUILDER_PARTNER_PROGRAM_VERSION = "builder_partner_v1";

function retiredProgramSnapshot() {
  return {
    programVersion: RETIRED_BUILDER_PARTNER_PROGRAM_VERSION,
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
