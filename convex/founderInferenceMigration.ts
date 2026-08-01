import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { EXISTING_FOUNDER_INFERENCE_COHORT_KEY } from "../shared/founderInference";

const EXPECTED_EXISTING_FOUNDER_COUNT = 9;
const EXPECTED_LEGACY_POLICY_COUNT = 8;

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

export const initializeExistingFounderInferenceCohortInternal = internalMutation({
  args: {
    ownerUserIds: v.array(v.id("users")),
    deleteLegacyPartnerPolicies: v.boolean(),
    dryRun: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerIds = args.ownerUserIds.map(normalizedId);
    const uniqueOwnerIds = new Set(ownerIds);
    if (ownerIds.length !== EXPECTED_EXISTING_FOUNDER_COUNT) {
      throw new Error("existing_founder_cohort_requires_exactly_9_owners");
    }
    if (uniqueOwnerIds.size !== EXPECTED_EXISTING_FOUNDER_COUNT || ownerIds.some((id) => !id)) {
      throw new Error("existing_founder_cohort_owner_ids_must_be_unique");
    }

    const allCommunities = await ctx.db.query("communities" as any).collect();
    const currentOwnerIds = new Set(
      (allCommunities as Array<Record<string, unknown>>)
        .map((community) => normalizedId(community.ownerId))
        .filter(Boolean),
    );
    if (currentOwnerIds.size !== EXPECTED_EXISTING_FOUNDER_COUNT) {
      throw new Error("existing_founder_current_owner_count_mismatch");
    }
    if (
      [...currentOwnerIds].some((ownerId) => !uniqueOwnerIds.has(ownerId)) ||
      ownerIds.some((ownerId) => !currentOwnerIds.has(ownerId))
    ) {
      throw new Error("existing_founder_owner_set_mismatch");
    }

    const ownerEvidence: Array<{ userId: any; ownedCommunityCount: number }> = [];
    for (const userId of args.ownerUserIds) {
      const [user, communities] = await Promise.all([
        ctx.db.get(userId),
        ctx.db
          .query("communities" as any)
          .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
          .collect(),
      ]);
      if (!user) throw new Error(`existing_founder_user_missing:${normalizedId(userId)}`);
      if (communities.length < 1) {
        throw new Error(`existing_founder_must_own_community:${normalizedId(userId)}`);
      }
      ownerEvidence.push({ userId, ownedCommunityCount: communities.length });
    }

    const existingGrants = await ctx.db
      .query("founderInferenceGrants" as any)
      .withIndex("by_cohort", (q: any) => q.eq("cohortKey", EXISTING_FOUNDER_INFERENCE_COHORT_KEY))
      .collect();
    const unexpectedGrant = existingGrants.find(
      (grant: any) => !uniqueOwnerIds.has(normalizedId(grant.userId)),
    );
    if (unexpectedGrant) throw new Error("existing_founder_cohort_contains_unexpected_grant");

    const legacyPolicies = await ctx.db.query("communityInferencePolicies" as any).collect();
    if (args.deleteLegacyPartnerPolicies) {
      if (legacyPolicies.length !== EXPECTED_LEGACY_POLICY_COUNT) {
        throw new Error("legacy_partner_policy_count_mismatch");
      }
      for (const policy of legacyPolicies as Array<Record<string, unknown>>) {
        if (
          policy.fundingMode !== "owner_api_key" ||
          policy.status !== "pending_credential" ||
          policy.sourceProgram !== "builder_partner_v1"
        ) {
          throw new Error("legacy_partner_policy_shape_mismatch");
        }
      }
    }

    const nowMs = args.nowMs ?? Date.now();
    if (args.dryRun !== true) {
      for (const evidence of ownerEvidence) {
        const existing = existingGrants.find(
          (grant: any) => normalizedId(grant.userId) === normalizedId(evidence.userId),
        );
        if (existing) continue;
        await ctx.db.insert("founderInferenceGrants" as any, {
          userId: evidence.userId,
          cohortKey: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
          status: "approved",
          approvedAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      if (args.deleteLegacyPartnerPolicies) {
        for (const policy of legacyPolicies as Array<Record<string, any>>) {
          await ctx.db.delete(policy._id);
        }
      }
    }

    return {
      ok: true,
      dry_run: args.dryRun === true,
      cohort_key: EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
      expected_founders: EXPECTED_EXISTING_FOUNDER_COUNT,
      current_distinct_owners: currentOwnerIds.size,
      existing_grants: existingGrants.length,
      grants_to_create: EXPECTED_EXISTING_FOUNDER_COUNT - existingGrants.length,
      legacy_policies_inspected: legacyPolicies.length,
      legacy_policies_to_delete: args.deleteLegacyPartnerPolicies ? legacyPolicies.length : 0,
      owners: ownerEvidence.map((row) => ({
        user_id: normalizedId(row.userId),
        owned_community_count: row.ownedCommunityCount,
      })),
    };
  },
});
