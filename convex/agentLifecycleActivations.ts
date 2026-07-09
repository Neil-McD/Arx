import {
  describeRuntimeSkillLifecycleTrigger,
  type RuntimeSkillLifecycleTrigger,
} from "../shared/runtimeSkillLifecycle";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export type AgentLifecycleActivationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

type AgentLifecycleActivationRow = {
  _id: any;
  userId: any;
  trigger: RuntimeSkillLifecycleTrigger;
  scopeType: "user" | "community" | "project";
  scopeKey: string;
  status: AgentLifecycleActivationStatus;
  threadId?: any;
  runId?: string;
  processingAt?: number;
};

const ONBOARDING_ACTIVATION_PROCESSING_STALE_MS = 10 * 60 * 1000;

function isOnboardingActivationClaimable(
  activation: Pick<AgentLifecycleActivationRow, "status" | "processingAt">,
  nowMs: number,
): boolean {
  if (activation.status === "pending" || activation.status === "failed") return true;
  if (activation.status !== "processing") return false;
  const processingAt =
    typeof activation.processingAt === "number" ? activation.processingAt : null;
  return (
    processingAt === null ||
    processingAt <= 0 ||
    nowMs - processingAt >= ONBOARDING_ACTIVATION_PROCESSING_STALE_MS
  );
}

function communityScopeKey(communityId: any): string {
  return String(communityId ?? "").trim();
}

async function findLifecycleActivation(args: {
  ctx: any;
  userId: any;
  trigger: RuntimeSkillLifecycleTrigger;
  scopeType: "user" | "community" | "project";
  scopeKey: string;
}): Promise<AgentLifecycleActivationRow | null> {
  return ((await args.ctx.db
    .query("agentLifecycleActivations")
    .withIndex("by_user_trigger_scope", (q: any) =>
      q
        .eq("userId", args.userId)
        .eq("trigger", args.trigger)
        .eq("scopeType", args.scopeType)
        .eq("scopeKey", args.scopeKey),
    )
    .first()) as AgentLifecycleActivationRow | null) ?? null;
}

export async function ensureCommunityOnboardingCompletedAgentLifecycleActivation(args: {
  ctx: any;
  userId: any;
  communityId: any;
  nowMs: number;
  source?: string | null;
}): Promise<{
  activationId: any;
  created: boolean;
  status: AgentLifecycleActivationStatus;
  threadId: any | null;
  runId: string | null;
  processingAt: number | null;
  claimable: boolean;
}> {
  const trigger: RuntimeSkillLifecycleTrigger = "onboarding_completed";
  const scopeType = "community" as const;
  const scopeKey = communityScopeKey(args.communityId);
  if (!scopeKey) throw new Error("agent_lifecycle_activation_community_required");

  const existing = await findLifecycleActivation({
    ctx: args.ctx,
    userId: args.userId,
    trigger,
    scopeType,
    scopeKey,
  });
  if (existing) {
    return {
      activationId: existing._id,
      created: false,
      status: existing.status,
      threadId: existing.threadId ?? null,
      runId: existing.runId ?? null,
      processingAt:
        typeof existing.processingAt === "number" ? existing.processingAt : null,
      claimable: isOnboardingActivationClaimable(existing, args.nowMs),
    };
  }

  const activationId = await args.ctx.db.insert("agentLifecycleActivations", {
    userId: args.userId,
    trigger,
    scopeType,
    scopeKey,
    status: "pending",
    activationRoute: "lifecycle_trigger",
    activationReason: describeRuntimeSkillLifecycleTrigger(trigger),
    source: String(args.source ?? "").trim() || "community_onboarding_completed",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return {
    activationId,
    created: true,
    status: "pending",
    threadId: null,
    runId: null,
    processingAt: null,
    claimable: true,
  };
}

export const ensureCommunityOnboardingActivationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    source: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ensureCommunityOnboardingCompletedAgentLifecycleActivation({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      source: args.source ?? null,
      nowMs: args.nowMs ?? Date.now(),
    }),
});

export const getCommunityOnboardingActivationInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const activation = await findLifecycleActivation({
      ctx,
      userId: args.userId,
      trigger: "onboarding_completed",
      scopeType: "community",
      scopeKey: communityScopeKey(args.communityId),
    });
    if (!activation) return null;
    return {
      activationId: activation._id,
      status: activation.status,
      threadId: activation.threadId ?? null,
      runId: activation.runId ?? null,
      processingAt:
        typeof activation.processingAt === "number" ? activation.processingAt : null,
      claimable: isOnboardingActivationClaimable(activation, nowMs),
    };
  },
});

export const claimOnboardingCompletedAgentLifecycleActivationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    scopeType: v.literal("community"),
    scopeKey: v.string(),
    threadId: v.id("threads"),
    runId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const trigger: RuntimeSkillLifecycleTrigger = "onboarding_completed";
    const activation = await findLifecycleActivation({
      ctx,
      userId: args.userId,
      trigger,
      scopeType: args.scopeType,
      scopeKey: args.scopeKey,
    });
    if (!activation) {
      return {
        ok: false as const,
        status: "missing" as const,
        activationId: null,
      };
    }
    if (activation.status === "completed") {
      return {
        ok: false as const,
        status: "completed" as const,
        activationId: activation._id,
        threadId: activation.threadId ?? args.threadId,
        runId: activation.runId ?? null,
      };
    }
    if (activation.status === "processing") {
      if (isOnboardingActivationClaimable(activation, nowMs)) {
        await ctx.db.patch(activation._id, {
          status: "processing",
          threadId: args.threadId,
          runId: args.runId,
          processingAt: nowMs,
          error: undefined,
          updatedAt: nowMs,
        });
        return {
          ok: true as const,
          status: "processing" as const,
          activationId: activation._id,
          threadId: args.threadId,
          runId: args.runId,
          reclaimed: true as const,
        };
      }
      return {
        ok: false as const,
        status: "processing" as const,
        activationId: activation._id,
        threadId: activation.threadId ?? args.threadId,
        runId: activation.runId ?? null,
      };
    }
    await ctx.db.patch(activation._id, {
      status: "processing",
      threadId: args.threadId,
      runId: args.runId,
      processingAt: nowMs,
      error: undefined,
      updatedAt: nowMs,
    });
    return {
      ok: true as const,
      status: "processing" as const,
      activationId: activation._id,
      threadId: args.threadId,
      runId: args.runId,
    };
  },
});

export const completeOnboardingCompletedAgentLifecycleActivationInternal = internalMutation({
  args: {
    activationId: v.id("agentLifecycleActivations"),
    threadId: v.id("threads"),
    runId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const activation = await ctx.db.get(args.activationId);
    if (!activation) return { ok: false, status: "missing" };
    if (activation.runId && activation.runId !== args.runId) {
      return {
        ok: false,
        status: activation.status,
        reason: "run_mismatch",
      };
    }
    await ctx.db.patch(args.activationId, {
      status: "completed",
      threadId: args.threadId,
      runId: args.runId,
      completedAt: nowMs,
      error: undefined,
      updatedAt: nowMs,
    });
    return { ok: true, status: "completed" };
  },
});

export const failOnboardingCompletedAgentLifecycleActivationInternal = internalMutation({
  args: {
    activationId: v.id("agentLifecycleActivations"),
    threadId: v.optional(v.id("threads")),
    runId: v.optional(v.string()),
    error: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const activation = await ctx.db.get(args.activationId);
    if (!activation) return { ok: false, status: "missing" };
    if (activation.status === "completed") {
      return { ok: false, status: "completed", reason: "already_completed" };
    }
    if (args.runId && activation.runId && activation.runId !== args.runId) {
      return {
        ok: false,
        status: activation.status,
        reason: "run_mismatch",
      };
    }
    await ctx.db.patch(args.activationId, {
      status: "failed",
      ...(args.threadId ? { threadId: args.threadId } : {}),
      ...(args.runId ? { runId: args.runId } : {}),
      error: String(args.error ?? "").slice(0, 1_000),
      failedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, status: "failed" };
  },
});
