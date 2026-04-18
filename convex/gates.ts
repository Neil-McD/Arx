import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import {
  normalizeTierForGate,
  resolveCanonicalGatePolicy,
} from "../shared/canonicalGateEngine";

type CanonicalTier = "free" | "builder";
type EffectiveTier = "anon_free" | "auth_free" | "builder";
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
type CapabilityFamily = "community_tools" | "web_research" | "workspace_tools";

type GateDecision = {
  allowed: boolean;
  code: GateCode;
  cta: GateCta;
  lane: GateLane | null;
  fundingSource: RequestedFundingSource | null;
};

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

async function getCanonicalTierBySubject(params: {
  ctx: any;
  authSubject: string;
  nowMs: number;
}): Promise<{ userId: string | null; canonicalTier: CanonicalTier; email: string | null }> {
  const user = await params.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", params.authSubject))
    .first();
  if (!user) return { userId: null, canonicalTier: "free", email: null };
  const rows = await params.ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  const activeRows = rows
    .filter((row: any) => isActiveWindow(params.nowMs, row.startsAt, row.endsAt))
    .sort((a: any, b: any) => b.startsAt - a.startsAt);
  return {
    userId: user._id,
    canonicalTier: normalizeTierForGate(activeRows[0]?.tier ?? "free"),
    email: user.email ?? null,
  };
}

function evaluateDecision(input: {
  authState: "anonymous" | "authenticated";
  surface: "web";
  executionMode: "cloud";
  requestedFundingSource: RequestedFundingSource;
  canonicalTier: CanonicalTier;
  hasUserKeyConnection: boolean;
  hasUserChatGptConnection: boolean;
}): GateDecision & { effectiveTier: EffectiveTier } {
  const policy = resolveCanonicalGatePolicy({
    authState: input.authState,
    surface: input.surface,
    executionMode: input.executionMode,
    requestedFundingSource: input.requestedFundingSource,
    tier: input.canonicalTier,
    hasUserKeyConnection: input.hasUserKeyConnection,
    hasUserChatGptConnection: input.hasUserChatGptConnection,
  });
  const decision = policy.decision;
  return {
    allowed: Boolean(decision.allowed),
    code: decision.code as GateCode,
    cta: decision.cta as GateCta,
    lane: (decision.lane ?? null) as GateLane | null,
    fundingSource: (decision.fundingSource ?? null) as RequestedFundingSource | null,
    effectiveTier: decision.effectiveTier as EffectiveTier,
  };
}

export const resolveGateContext = query({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const authSubjectInput = String(args.authSubject ?? "").trim();
    if (args.authState === "anonymous") {
      const anonymousPolicy = resolveCanonicalGatePolicy({
        authState: "anonymous",
        surface: "web",
        executionMode: "cloud",
        requestedFundingSource: "demo_public",
      });
      return {
        authState: "anonymous" as const,
        authSubject: authSubjectInput || null,
        userId: null,
        canonicalTier: "free" as const,
        effectiveTier: anonymousPolicy.decision.effectiveTier as EffectiveTier,
        entitledCapabilityFamilies: anonymousPolicy.entitledCapabilityFamilies as CapabilityFamily[],
      };
    }
    const authSubject = await resolveAuthenticatedSubject({
      ctx,
      authSubject: authSubjectInput || null,
    });
    const resolved = await getCanonicalTierBySubject({ ctx, authSubject, nowMs });
    const policy = resolveCanonicalGatePolicy({
      authState: "authenticated",
      surface: "web",
      executionMode: "cloud",
      requestedFundingSource: "demo_public",
      tier: resolved.canonicalTier,
    });
    return {
      authState: "authenticated" as const,
      authSubject,
      userId: resolved.userId,
      canonicalTier: resolved.canonicalTier,
      effectiveTier: policy.decision.effectiveTier as EffectiveTier,
      email: resolved.email,
      entitledCapabilityFamilies: policy.entitledCapabilityFamilies as CapabilityFamily[],
    };
  },
});

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
      authSubject = await resolveAuthenticatedSubject({
        ctx,
        authSubject: authSubjectInput || null,
      });
      const resolved = await getCanonicalTierBySubject({ ctx, authSubject, nowMs });
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

export const resolveGateBundle = query({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    surface: v.literal("web"),
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
      authSubject = await resolveAuthenticatedSubject({
        ctx,
        authSubject: authSubjectInput || null,
      });
      const resolved = await getCanonicalTierBySubject({ ctx, authSubject, nowMs });
      userId = resolved.userId;
      userEmail = resolved.email;
      canonicalTier = resolved.canonicalTier;
    }

    const basePolicy = resolveCanonicalGatePolicy({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "demo_public",
      tier: canonicalTier,
    });
    const effectiveTier = basePolicy.decision.effectiveTier as EffectiveTier;
    const entitledCapabilityFamilies = basePolicy.entitledCapabilityFamilies as CapabilityFamily[];
    const hasUserKeyConnection = Boolean(args.hasUserKeyConnection);
    const hasUserChatGptConnection = Boolean(args.hasUserChatGptConnection);
    const chatDemoPublic = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "demo_public",
      canonicalTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const chatUserKey = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "user_key",
      canonicalTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const chatUserChatgpt = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "user_chatgpt",
      canonicalTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const chatPlatform = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "platform",
      canonicalTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const toolsPlatform = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "platform",
      canonicalTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });

    return {
      authState,
      authSubject,
      userId,
      canonicalTier,
      effectiveTier,
      entitledCapabilityFamilies,
      decisions: {
        chatDemoPublic,
        chatUserKey,
        chatUserChatgpt,
        chatPlatform,
        toolsPlatform,
        chatFreeModel: chatDemoPublic,
        chatPaidModel: chatPlatform,
        toolsCloud: toolsPlatform,
      },
      policy: {
        allowUserFundedInference:
          (chatUserKey.allowed && chatUserKey.fundingSource === "user_key") ||
          (chatUserChatgpt.allowed && chatUserChatgpt.fundingSource === "user_chatgpt"),
        allowCloudTools: toolsPlatform.allowed && toolsPlatform.lane === "platform",
        allowCommunityTools: entitledCapabilityFamilies.includes("community_tools"),
        allowWebResearch: entitledCapabilityFamilies.includes("web_research"),
        allowWorkspaceTools: entitledCapabilityFamilies.includes("workspace_tools"),
        allowCommunityCreate:
          effectiveTier === "builder",
        allowPersonalMemory: effectiveTier === "builder",
      },
    };
  },
});
