import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { EXISTING_FOUNDER_INFERENCE_COHORT_KEY } from "../shared/founderInference";
import { COMMUNITY_FUNDING_POLICY_MANAGED } from "../shared/founderInference";

function normalizedId(value: unknown): string {
  return String(value ?? "").trim();
}

export const transitionExistingFounderToManagedInternal = internalMutation({
  args: {
    userId: v.id("users"),
    expectedHandle: v.string(),
    expectedCommunitySlugs: v.array(v.string()),
    dryRun: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("founder_transition_user_missing");
    const expectedHandle = String(args.expectedHandle ?? "").trim().toLowerCase();
    if (!expectedHandle || String(user.normalizedHandle ?? user.handle ?? "").trim().toLowerCase() !== expectedHandle) {
      throw new Error("founder_transition_handle_mismatch");
    }

    const communities = await ctx.db
      .query("communities" as any)
      .withIndex("by_owner", (q: any) => q.eq("ownerId", args.userId))
      .collect();
    const expectedSlugs = args.expectedCommunitySlugs
      .map((value) => String(value ?? "").trim().toLowerCase())
      .sort();
    const actualSlugs = communities
      .map((community: any) => String(community.slug ?? "").trim().toLowerCase())
      .sort();
    if (
      expectedSlugs.length === 0 ||
      new Set(expectedSlugs).size !== expectedSlugs.length ||
      expectedSlugs.length !== actualSlugs.length ||
      expectedSlugs.some((slug, index) => slug !== actualSlugs[index])
    ) {
      throw new Error("founder_transition_community_set_mismatch");
    }

    const grant = await ctx.db
      .query("founderInferenceGrants" as any)
      .withIndex("by_user_cohort", (q: any) =>
        q.eq("userId", args.userId).eq("cohortKey", EXISTING_FOUNDER_INFERENCE_COHORT_KEY),
      )
      .first();
    const alreadyTransitioned =
      !grant &&
      communities.every(
        (community: any) =>
          community.inferenceFundingPolicy === COMMUNITY_FUNDING_POLICY_MANAGED,
      );
    if (alreadyTransitioned) {
      return {
        ok: true,
        dry_run: args.dryRun === true,
        already_transitioned: true,
        user_id: normalizedId(args.userId),
        handle: expectedHandle,
        communities: actualSlugs,
      };
    }
    if (
      !grant ||
      grant.status !== "approved" ||
      grant.activationAcceptanceId ||
      grant.activatedAt
    ) {
      throw new Error("founder_transition_grant_not_pristine");
    }

    const [subscriptions, receipts] = await Promise.all([
      ctx.db
        .query("founderSubscriptions" as any)
        .withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.userId))
        .collect(),
      ctx.db
        .query("communityInferenceReceipts" as any)
        .withIndex("by_payer_createdAt", (q: any) => q.eq("payerUserId", args.userId))
        .collect(),
    ]);
    if (subscriptions.length > 0) {
      throw new Error("founder_transition_subscription_exists");
    }
    if (receipts.some((receipt: any) => receipt.status === "authorized" || receipt.status === "indeterminate")) {
      throw new Error("founder_transition_inference_in_flight");
    }

    const nowMs = args.nowMs ?? Date.now();
    if (args.dryRun !== true) {
      for (const community of communities as Array<Record<string, any>>) {
        await ctx.db.patch(community._id, {
          inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,
          updatedAt: nowMs,
        });
      }
      await ctx.db.delete(grant._id);
    }

    return {
      ok: true,
      dry_run: args.dryRun === true,
      already_transitioned: false,
      user_id: normalizedId(args.userId),
      handle: expectedHandle,
      grant_id: normalizedId(grant._id),
      communities: communities.map((community: any) => ({
        slug: String(community.slug),
        previous_visibility: String(community.visibility),
        next_visibility: String(community.visibility),
        next_funding_policy: COMMUNITY_FUNDING_POLICY_MANAGED,
      })),
    };
  },
});
