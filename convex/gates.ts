import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import {
  evaluateCanonicalGate,
  normalizeTierForGate,
  resolveEffectiveTierForGate,
  resolveEntitledCapabilityFamiliesForGate,
} from "../shared/canonicalGateEngine.mjs";

type CanonicalTier = "free" | "builder" | "architect";
type EffectiveTier = "anon_free" | "auth_free" | "builder" | "architect";
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
}): Promise<{ userId: string | null; canonicalTier: CanonicalTier }> {
  const user = await params.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", params.authSubject))
    .first();
  if (!user) return { userId: null, canonicalTier: "free" };
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
  };
}

function evaluateDecision(input: {
  authState: "anonymous" | "authenticated";
  surface: "web" | "mobile";
  executionMode: "cloud";
  requestedFundingSource: RequestedFundingSource;
  canonicalTier: CanonicalTier;
  hasUserKeyConnection: boolean;
  hasUserChatGptConnection: boolean;
}): GateDecision & { effectiveTier: EffectiveTier } {
  const decision = evaluateCanonicalGate({
    authState: input.authState,
    surface: input.surface,
    executionMode: input.executionMode,
    requestedFundingSource: input.requestedFundingSource,
    tier: input.canonicalTier,
    hasUserKeyConnection: input.hasUserKeyConnection,
    hasUserChatGptConnection: input.hasUserChatGptConnection,
  });
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
      return {
        authState: "anonymous" as const,
        authSubject: authSubjectInput || null,
        userId: null,
        canonicalTier: "free" as const,
        effectiveTier: "anon_free" as const,
        entitledCapabilityFamilies: [] as CapabilityFamily[],
      };
    }
    const authSubject = await resolveAuthenticatedSubject({
      ctx,
      authSubject: authSubjectInput || null,
    });
    const resolved = await getCanonicalTierBySubject({ ctx, authSubject, nowMs });
    const effectiveTier = resolveEffectiveTierForGate({
      authState: "authenticated",
      tier: resolved.canonicalTier,
    }) as EffectiveTier;
    return {
      authState: "authenticated" as const,
      authSubject,
      userId: resolved.userId,
      canonicalTier: resolved.canonicalTier,
      effectiveTier,
      entitledCapabilityFamilies: resolveEntitledCapabilityFamiliesForGate({
        authState: "authenticated",
        tier: resolved.canonicalTier,
      }) as CapabilityFamily[],
    };
  },
});

export const resolveGateDecision = query({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    surface: v.union(v.literal("web"), v.literal("mobile")),
    executionMode: v.literal("cloud"),
    modelClass: v.optional(v.union(v.literal("free_model"), v.literal("paid_model"))),
    requestedFundingSource: v.optional(
      v.union(
        v.literal("demo_public"),
        v.literal("user_key"),
        v.literal("user_chatgpt"),
        v.literal("platform"),
      ),
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
    }

    const effectiveTier = resolveEffectiveTierForGate({
      authState,
      tier: canonicalTier,
    }) as EffectiveTier;
    const entitledCapabilityFamilies = resolveEntitledCapabilityFamiliesForGate({
      authState,
      tier: canonicalTier,
    }) as CapabilityFamily[];
    const decision = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: args.executionMode,
      requestedFundingSource:
        args.requestedFundingSource ??
        (args.modelClass === "free_model" ? "demo_public" : "platform"),
      canonicalTier,
      hasUserKeyConnection: Boolean(args.hasUserKeyConnection),
      hasUserChatGptConnection: Boolean(args.hasUserChatGptConnection),
    });

    return {
      ...decision,
      authState,
      authSubject,
      userId,
      canonicalTier,
      effectiveTier,
      entitledCapabilityFamilies,
    };
  },
});

export const resolveGateBundle = query({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    surface: v.union(v.literal("web"), v.literal("mobile")),
    hasUserKeyConnection: v.optional(v.boolean()),
    hasUserChatGptConnection: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const authSubjectInput = String(args.authSubject ?? "").trim();
    const authState = args.authState;
    let userId: string | null = null;
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
    }

    const effectiveTier = resolveEffectiveTierForGate({
      authState,
      tier: canonicalTier,
    }) as EffectiveTier;
    const entitledCapabilityFamilies = resolveEntitledCapabilityFamiliesForGate({
      authState,
      tier: canonicalTier,
    }) as CapabilityFamily[];
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
        allowPlatformInference:
          chatPlatform.allowed &&
          chatPlatform.lane === "platform" &&
          chatPlatform.fundingSource === "platform",
        allowUserFundedInference:
          (chatUserKey.allowed && chatUserKey.fundingSource === "user_key") ||
          (chatUserChatgpt.allowed && chatUserChatgpt.fundingSource === "user_chatgpt"),
        allowCloudTools: toolsPlatform.allowed && toolsPlatform.lane === "platform",
        allowCommunityTools: entitledCapabilityFamilies.includes("community_tools"),
        allowWebResearch: entitledCapabilityFamilies.includes("web_research"),
        allowWorkspaceTools: entitledCapabilityFamilies.includes("workspace_tools"),
        allowCommunityCreate: effectiveTier === "architect",
        allowPersonalMemory: effectiveTier === "builder" || effectiveTier === "architect",
      },
    };
  },
});
