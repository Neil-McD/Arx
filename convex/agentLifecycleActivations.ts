import {
  describeRuntimeSkillLifecycleTrigger,
  type RuntimeSkillLifecycleTrigger,
} from "../shared/runtimeSkillLifecycle";

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
};

function userScopeKey(userId: any): string {
  return String(userId ?? "").trim();
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

export async function ensureOnboardingCompletedAgentLifecycleActivation(args: {
  ctx: any;
  userId: any;
  nowMs: number;
}): Promise<{
  activationId: any;
  created: boolean;
  status: AgentLifecycleActivationStatus;
}> {
  const trigger: RuntimeSkillLifecycleTrigger = "onboarding_completed";
  const scopeType = "user" as const;
  const scopeKey = userScopeKey(args.userId);
  if (!scopeKey) throw new Error("agent_lifecycle_activation_user_required");

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
    source: "account_onboarding_completed",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return {
    activationId,
    created: true,
    status: "pending",
  };
}
