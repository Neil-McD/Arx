import { query } from "./_generated/server";
import { v } from "convex/values";
import { findAuthenticatedActorState } from "./authActor";
import {
  resolveCanonicalGatePolicy,
} from "../shared/canonicalGateEngine";
import { readCanonicalAccountTier } from "./accountEntitlementCore";

type CanonicalTier = "free" | "architect";
type EffectiveTier = "anon_free" | "auth_free" | "architect";
type GateCode =
  | "ok"
  | "auth_required"
  | "tier_required"
  | "provider_connection_required"
  | "plan_required"
  | "community_entitlement_required"
  | "community_role_required"
  | "project_required"
  | "runner_unavailable";
type GateCta = "none" | "sign_in" | "upgrade" | "connect_provider" | "join" | "checkout";
type GateLane = "public" | "platform" | "chatgpt";
type RequestedFundingSource = "demo_public" | "user_key" | "user_chatgpt" | "platform";
type CapabilityFamily =
  | "product_docs"
  | "community_tools"
  | "web_research"
  | "sandbox_tools"
  | "workspace_tools";

async function getCanonicalTierByActor(params: {
  ctx: any;
  actor: { dbUserId: any; email: string | null } | null;
  nowMs: number;
}): Promise<{ userId: string | null; canonicalTier: CanonicalTier; email: string | null }> {
  if (!params.actor) return { userId: null, canonicalTier: "free", email: null };
  return {
    userId: params.actor.dbUserId,
    canonicalTier: await readCanonicalAccountTier(params.ctx, params.actor.dbUserId, params.nowMs),
    email: params.actor.email,
  };
}

export const resolveGateDecision = query({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    surface: v.literal("web"),
    executionMode: v.literal("cloud"),
    requestedFundingSource: v.union(
      v.literal("demo_public"),
      v.literal("user_key"),
      v.literal("user_chatgpt"),
      v.literal("platform"),
    ),
    hasUserKeyConnection: v.optional(v.boolean()),
    hasUserChatGptConnection: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const authSubjectInput = String(args.authSubject ?? "").trim();
    const authState = args.authState;
    let userId: string | null = null;
    let userEmail: string | null = null;
    let canonicalTier: CanonicalTier = "free";
    let authSubject: string | null = authSubjectInput || null;

    if (authState === "authenticated") {
      const resolvedActor = await findAuthenticatedActorState({
        ctx,
        authSubject: authSubjectInput || null,
      });
      authSubject = resolvedActor.authSubject;
      const resolved = await getCanonicalTierByActor({
        ctx,
        actor: resolvedActor.actor,
        nowMs,
      });
      userId = resolved.userId;
      canonicalTier = resolved.canonicalTier;
      userEmail = resolved.email;
    }

    const policy = resolveCanonicalGatePolicy({
      authState,
      surface: args.surface,
      executionMode: args.executionMode,
      requestedFundingSource: args.requestedFundingSource,
      tier: canonicalTier,
      hasUserKeyConnection: Boolean(args.hasUserKeyConnection),
      hasUserChatGptConnection: Boolean(args.hasUserChatGptConnection),
    });
    const decision = policy.decision;

    return {
      allowed: Boolean(decision.allowed),
      code: decision.code as GateCode,
      cta: decision.cta as GateCta,
      lane: (decision.lane ?? null) as GateLane | null,
      fundingSource: (decision.fundingSource ?? null) as RequestedFundingSource | null,
      authState,
      authSubject,
      userId,
      email: userEmail,
      canonicalTier,
      effectiveTier: policy.decision.effectiveTier as EffectiveTier,
      entitledCapabilityFamilies: policy.entitledCapabilityFamilies as CapabilityFamily[],
    };
  },
});
