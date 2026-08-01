import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { recordCriticalAuditEvent } from "./criticalAudit";
import {
  COMMUNITY_COGNITION_CLEANUP_FIRST_PHASE,
  inspectDeletedCommunityCognitionCore,
} from "./communityCognitionCleanupCore";
import {
  executeR41nb0wRetirementCore,
  inspectR41nb0wRetirementCore,
  publicR41nb0wRetirementInspection,
  type R41nb0wRetirementTarget,
} from "./r41nb0wRetirementCore";

export const R41NB0W_RETIREMENT_OWNER_USER_ID = "nx723pf5z892gxwzt0r37zpf3h86qzev";
export const R41NB0W_RETIREMENT_COMMUNITY_ID = "jh70hzn8g3rm1zpmr0732hs56d86wvst";
export const R41NB0W_RETIREMENT_FOUNDER_GRANT_ID = "m97s3ywjsawsjf3fm70m4r6q358bnn70";
export const R41NB0W_RETIREMENT_OPENAI_CONNECTION_ID = "nn7cy5x1n48px68hvqkj0myqhh86xb63";
export const R41NB0W_RETIREMENT_CONFIRMATION =
  "retire-r41nb0w-preserve-user-financial-history-v1";

const TARGET: R41nb0wRetirementTarget = {
  ownerUserId: R41NB0W_RETIREMENT_OWNER_USER_ID,
  communityId: R41NB0W_RETIREMENT_COMMUNITY_ID,
  founderGrantId: R41NB0W_RETIREMENT_FOUNDER_GRANT_ID,
  openAiConnectionId: R41NB0W_RETIREMENT_OPENAI_CONNECTION_ID,
  communitySlug: "r41nb0w",
  communityName: "R41NB0W",
};

const exactArgs = {
  ownerUserId: v.id("users"),
  communityId: v.id("communities"),
  founderGrantId: v.id("founderInferenceGrants"),
  openAiConnectionId: v.id("userProviderConnections"),
};

function requireExactTarget(args: {
  ownerUserId: unknown;
  communityId: unknown;
  founderGrantId: unknown;
  openAiConnectionId: unknown;
}): void {
  if (
    String(args.ownerUserId) !== R41NB0W_RETIREMENT_OWNER_USER_ID ||
    String(args.communityId) !== R41NB0W_RETIREMENT_COMMUNITY_ID ||
    String(args.founderGrantId) !== R41NB0W_RETIREMENT_FOUNDER_GRANT_ID ||
    String(args.openAiConnectionId) !== R41NB0W_RETIREMENT_OPENAI_CONNECTION_ID
  ) {
    throw new Error("r41nb0w_retirement_exact_target_required");
  }
}

export const inspectR41nb0wRetirementInternal = internalQuery({
  args: exactArgs,
  handler: async (ctx, args) => {
    requireExactTarget(args);
    const inspection = await inspectR41nb0wRetirementCore({ ctx, target: TARGET });
    const safe = publicR41nb0wRetirementInspection(inspection);
    if (inspection.state_facts.community_present) {
      return { state: inspection.ready ? "ready" : "blocked", ...safe };
    }
    const cognition = await inspectDeletedCommunityCognitionCore({
      db: ctx.db as any,
      communityId: args.communityId,
    });
    const retired =
      inspection.state_facts.owner_present &&
      !inspection.state_facts.founder_grant_present &&
      !inspection.state_facts.openai_connection_present &&
      inspection.state_facts.owner_community_count === 0 &&
      inspection.product_row_count === 0;
    return {
      state: retired && cognition.empty ? "retired" : "cleanup_pending",
      ...safe,
      cognition,
    };
  },
});

export const retireR41nb0wInternal = internalMutation({
  args: {
    ...exactArgs,
    confirmation: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireExactTarget(args);
    if (args.confirmation !== R41NB0W_RETIREMENT_CONFIRMATION) {
      throw new Error("r41nb0w_retirement_confirmation_required");
    }
    const inspection = await inspectR41nb0wRetirementCore({ ctx, target: TARGET });
    if (args.dryRun) {
      return {
        dry_run: true,
        state: inspection.ready ? "ready" : "blocked",
        ...publicR41nb0wRetirementInspection(inspection),
      };
    }
    if (!inspection.ready) {
      throw new Error(
        `r41nb0w_retirement_precondition_failed:${inspection.violations.join(",")}`,
      );
    }

    const result = await executeR41nb0wRetirementCore({
      ctx,
      target: TARGET,
      nowMs: Date.now(),
    });
    const preservedFinancialRowCount =
      result.retained_counts_before.stripe_connect_accounts +
      result.retained_counts_before.community_price_points +
      result.retained_counts_before.checkout_sessions +
      result.retained_counts_before.purchase_claims +
      result.retained_counts_before.critical_audit_events;
    await recordCriticalAuditEvent(ctx, {
      eventKey: "community_operator_retirement:r41nb0w:v1",
      eventType: "community_operator_retirement_completed",
      severity: "warning",
      status: "succeeded",
      actorUserId: args.ownerUserId,
      subjectUserId: args.ownerUserId,
      communityId: args.communityId,
      provider: "convex",
      metadata: {
        policyVersion: result.policy_version,
        communitySlug: "r41nb0w",
        deletedProductRowCount: result.deleted_product_row_count,
        deletedCanonicalControlRowCount: result.deleted_canonical_control_row_count,
        deletedStorageObjectCount: result.deleted_storage_object_count,
        detachedAgentChannelCount: result.detached_agent_channel_count,
        preservedFinancialRowCount,
      },
    });
    await ctx.scheduler.runAfter(
      0,
      (internal as any).communityCognitionCleanup.drainDeletedCommunityCognitionInternal,
      {
        communityId: args.communityId,
        phase: COMMUNITY_COGNITION_CLEANUP_FIRST_PHASE,
      },
    );

    return { dry_run: false, state: "retirement_committed", ...result };
  },
});
