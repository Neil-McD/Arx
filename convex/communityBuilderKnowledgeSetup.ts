import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

import {
  getCommunityAndMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  communityFounderWelcomeIdempotencyKey,
} from "../shared/communityFounderWelcome";
import { applyCommunityWikiArchitectProposalCore } from "./communityWikiArchitect";

const BUILDER_KNOWLEDGE_BUILD_LEASE_MS = 15 * 60 * 1000;

const SAFE_BUILDER_KNOWLEDGE_FAILURE_CODES = new Set([
  "no_ready_sources",
  "provider_inference_misconfigured",
  "provider_inference_unavailable",
  "provider_inference_error",
  "provider_token_usage_missing",
  "invalid_architect_output",
  "invalid_architect_proposal",
  "builder_knowledge_content_incomplete",
  "builder_knowledge_build_lease_lost",
]);

const SAFE_ARCHITECT_FAILURE_REASONS = new Set([
  "json_parse_failed",
  "proposal_validation_failed",
  "source_lineage_invalid",
  "page_window_truncated",
]);

function normalizeSafeFailureCode(value: unknown): string {
  const code = String(value ?? "").trim();
  return SAFE_BUILDER_KNOWLEDGE_FAILURE_CODES.has(code)
    ? code
    : "builder_knowledge_build_failed";
}

function normalizeSafeArchitectFailureReason(value: unknown): string | null {
  const reason = String(value ?? "").trim();
  return SAFE_ARCHITECT_FAILURE_REASONS.has(reason) ? reason : null;
}

async function requireBuilderKnowledgeOwner(ctx: any, args: {
  authSubject?: string | null;
  communityId: any;
}) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx,
    authSubject: args.authSubject ?? null,
  });
  const { community } = await getCommunityAndMembership({
    ctx,
    communityId: args.communityId,
    userId,
  });
  if (String(community.ownerId) !== String(userId)) {
    throw new Error("community_owner_required");
  }
  return { community, userId };
}

async function completeBuilderKnowledgeSetupCore(ctx: any, args: {
  community: any;
  userId: any;
  nowMs: number;
}) {
  const changed = args.community.builderKnowledgeSetupPending === true;
  const hasBuildState = Boolean(
    args.community.builderKnowledgeBuildStage ||
    args.community.builderKnowledgeBuildLeaseToken ||
    args.community.builderKnowledgeBuildLeaseExpiresAt,
  );
  if (changed || hasBuildState) {
    await ctx.db.patch(args.community._id as any, {
      builderKnowledgeSetupPending: false,
      builderKnowledgeBuildStage: undefined,
      builderKnowledgeBuildLeaseToken: undefined,
      builderKnowledgeBuildLeaseExpiresAt: undefined,
      updatedAt: args.nowMs,
    });
  }
  await ctx.scheduler.runAfter(
    0,
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: args.userId,
      communityId: args.community._id,
      idempotencyKey: communityFounderWelcomeIdempotencyKey(args.community._id),
      founderBootstrap: true,
    },
  );
  return {
    ok: true,
    changed,
    community_id: String(args.community._id),
    builder_knowledge_setup_pending: false as const,
  };
}

export const completeBuilderKnowledgeSetup = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community, userId } = await requireBuilderKnowledgeOwner(ctx, args);
    const nowMs = Date.now();
    if (
      community.builderKnowledgeBuildLeaseToken &&
      Number(community.builderKnowledgeBuildLeaseExpiresAt ?? 0) > nowMs
    ) {
      throw new Error("builder_knowledge_build_in_progress");
    }
    return await completeBuilderKnowledgeSetupCore(ctx, { community, userId, nowMs });
  },
});

export const claimBuilderKnowledgeBuildInternal = internalMutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    leaseToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const { community, userId } = await requireBuilderKnowledgeOwner(ctx, args);
    if (community.builderKnowledgeSetupPending !== true) {
      return { ok: true, complete: true, user_id: String(userId), stage: null };
    }
    const activeLease = String(community.builderKnowledgeBuildLeaseToken ?? "").trim();
    if (
      activeLease &&
      activeLease !== args.leaseToken &&
      Number(community.builderKnowledgeBuildLeaseExpiresAt ?? 0) > args.nowMs
    ) {
      return { ok: false, code: "builder_knowledge_build_in_progress" };
    }
    const stage = community.builderKnowledgeBuildStage === "content" ? "content" : "architecture";
    await ctx.db.patch(community._id as any, {
      builderKnowledgeBuildStage: stage,
      builderKnowledgeBuildLeaseToken: args.leaseToken,
      builderKnowledgeBuildLeaseExpiresAt: args.nowMs + BUILDER_KNOWLEDGE_BUILD_LEASE_MS,
      updatedAt: args.nowMs,
    });
    return { ok: true, complete: false, user_id: String(userId), stage };
  },
});

export const applyBuilderKnowledgeArchitectureInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    leaseToken: v.string(),
    proposal: v.any(),
    expectedSourceRevisions: v.array(v.object({
      source_resource_id: v.string(),
      revision_hash: v.string(),
    })),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || community.builderKnowledgeSetupPending !== true) {
      throw new Error("builder_knowledge_setup_not_pending");
    }
    if (String(community.ownerId) !== String(args.userId)) {
      throw new Error("community_owner_required");
    }
    if (community.builderKnowledgeBuildLeaseToken !== args.leaseToken) {
      throw new Error("builder_knowledge_build_lease_lost");
    }
    if (community.builderKnowledgeBuildStage !== "architecture") {
      throw new Error("builder_knowledge_build_architecture_required");
    }
    const applied = await applyCommunityWikiArchitectProposalCore(ctx, {
      userId: args.userId,
      communityId: args.communityId,
      proposal: args.proposal,
      expectedSourceRevisions: args.expectedSourceRevisions,
    });
    if (applied.ok !== true) return applied;
    await ctx.db.patch(community._id, {
      builderKnowledgeBuildStage: "content",
      builderKnowledgeBuildLeaseExpiresAt: args.nowMs + BUILDER_KNOWLEDGE_BUILD_LEASE_MS,
      updatedAt: args.nowMs,
    });
    return { ...applied, stage: "content" as const };
  },
});

export const releaseBuilderKnowledgeBuildInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    leaseToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || community.builderKnowledgeBuildLeaseToken !== args.leaseToken) {
      return { ok: true, changed: false };
    }
    await ctx.db.patch(community._id, {
      builderKnowledgeBuildLeaseToken: undefined,
      builderKnowledgeBuildLeaseExpiresAt: undefined,
      updatedAt: args.nowMs,
    });
    return { ok: true, changed: true };
  },
});

export const completeBuilderKnowledgeBuildInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    leaseToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.userId)) {
      throw new Error("community_owner_required");
    }
    if (community.builderKnowledgeSetupPending !== true) {
      throw new Error("builder_knowledge_setup_not_pending");
    }
    if (community.builderKnowledgeBuildLeaseToken !== args.leaseToken) {
      throw new Error("builder_knowledge_build_lease_lost");
    }
    if (community.builderKnowledgeBuildStage !== "content") {
      throw new Error("builder_knowledge_build_content_required");
    }
    return await completeBuilderKnowledgeSetupCore(ctx, {
      community,
      userId: args.userId,
      nowMs: args.nowMs,
    });
  },
});

export async function buildBuilderKnowledgeResourcesCore(
  ctx: any,
  args: { authSubject?: string | null; communityId: any },
): Promise<Record<string, unknown>> {
    const leaseToken = crypto.randomUUID();
    const claim: any = await ctx.runMutation(
      (internal as any).communityBuilderKnowledgeSetup.claimBuilderKnowledgeBuildInternal,
      {
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
        leaseToken,
        nowMs: Date.now(),
      },
    );
    if (!claim?.ok) {
      return {
        ok: false,
        kind: "builder_knowledge_build",
        code: String(claim?.code ?? "builder_knowledge_build_unavailable"),
        message: "Your community knowledge is already being built.",
      };
    }
    if (claim.complete) {
      return {
        ok: true,
        kind: "builder_knowledge_build",
        already_complete: true,
        community_id: String(args.communityId),
        builder_knowledge_setup_pending: false,
      };
    }
    const userId = String(claim.user_id ?? "").trim();
    let failureStage = "architecture_proposal";
    let failureCode = "builder_knowledge_build_failed";
    let failureReason: string | null = null;
    try {
      if (claim.stage === "architecture") {
        failureStage = "architecture_proposal";
        const architect: any = await ctx.runAction(
          (api as any).communityWikiArchitect.runCommunityWikiArchitectProposal,
          {
            userId,
            authSubject: args.authSubject ?? null,
            communityId: args.communityId,
            builderIntent: null,
            requestId: `${leaseToken}:architect`,
          },
        );
        if (!architect?.ok || !architect?.proposal) {
          failureCode = normalizeSafeFailureCode(architect?.code);
          failureReason = normalizeSafeArchitectFailureReason(architect?.failure_reason);
          throw new Error(failureCode);
        }
        failureStage = "architecture_apply";
        const applied: any = await ctx.runMutation(
          (internal as any).communityBuilderKnowledgeSetup.applyBuilderKnowledgeArchitectureInternal,
          {
            userId,
            communityId: args.communityId,
            leaseToken,
            proposal: architect.proposal,
            expectedSourceRevisions: Array.isArray(architect.source_revisions)
              ? architect.source_revisions
              : [],
            nowMs: Date.now(),
          },
        );
        if (!applied?.ok) {
          failureCode = normalizeSafeFailureCode(applied?.code);
          throw new Error(failureCode);
        }
      }

      failureStage = "content_writer";
      for (let batch = 1; batch <= 2; batch += 1) {
        const renewed: any = await ctx.runMutation(
          (internal as any).communityBuilderKnowledgeSetup.claimBuilderKnowledgeBuildInternal,
          {
            authSubject: args.authSubject ?? null,
            communityId: args.communityId,
            leaseToken,
            nowMs: Date.now(),
          },
        );
        if (!renewed?.ok || renewed?.complete || renewed?.stage !== "content") {
          failureCode = "builder_knowledge_build_lease_lost";
          throw new Error("builder_knowledge_build_lease_lost");
        }
        const writer: any = await ctx.runAction(
          (api as any).communityWikiArchitect.draftCommunityResourceContentFromSources,
          {
            userId,
            authSubject: args.authSubject ?? null,
            communityId: args.communityId,
            limit: 8,
            requestId: `${leaseToken}:writer:${batch}`,
          },
        );
        if (Number(writer?.candidates ?? 0) <= 0) break;
        if (writer?.ok !== true && Number(writer?.drafted ?? 0) <= 0) {
          failureCode = normalizeSafeFailureCode(writer?.code);
          throw new Error(failureCode);
        }
      }

      failureStage = "content_completion";
      const remaining: any = await ctx.runQuery(
        (internal as any).communityWikiArchitect.buildCommunityResourceContentWriterRunContextInternal,
        {
          userId,
          authSubject: args.authSubject ?? null,
          communityId: args.communityId,
          limit: 1,
        },
      );
      if (Array.isArray(remaining?.candidates) && remaining.candidates.length > 0) {
        failureCode = "builder_knowledge_content_incomplete";
        throw new Error("builder_knowledge_content_incomplete");
      }

      failureStage = "setup_completion";
      const completed: any = await ctx.runMutation(
        (internal as any).communityBuilderKnowledgeSetup.completeBuilderKnowledgeBuildInternal,
        {
          communityId: args.communityId,
          userId,
          leaseToken,
          nowMs: Date.now(),
        },
      );
      return {
        ...completed,
        kind: "builder_knowledge_build",
      };
    } catch {
      console.warn("builder_knowledge_build_failed", {
        code: failureCode,
        failure_stage: failureStage,
        failure_reason: failureReason,
      });
      await ctx.runMutation(
        (internal as any).communityBuilderKnowledgeSetup.releaseBuilderKnowledgeBuildInternal,
        { communityId: args.communityId, leaseToken, nowMs: Date.now() },
      );
      return {
        ok: false,
        kind: "builder_knowledge_build",
        code: failureCode,
        failure_stage: failureStage,
        ...(failureReason ? { failure_reason: failureReason } : {}),
        message: "Polynet could not finish building your resources. Try again.",
      };
    }
}

export const buildBuilderKnowledgeResources: any = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: buildBuilderKnowledgeResourcesCore,
});
