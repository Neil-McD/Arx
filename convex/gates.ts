import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

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
type GateCta = "none" | "sign_in" | "upgrade" | "connect_provider" | "join" | "request_access" | "checkout";
type GateLane = "public" | "platform" | "chatgpt" | "daytona_cloud";
type RequestedFundingSource = "demo_public" | "user_key" | "user_chatgpt" | "platform";

type GateDecision = {
  allowed: boolean;
  code: GateCode;
  cta: GateCta;
  lane: GateLane | null;
  fundingSource: RequestedFundingSource | null;
};

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  const normalized = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "builder") return "builder";
  if (normalized === "architect" || normalized === "pro") return "architect";
  return "free";
}

function resolveEffectiveTier(authState: "anonymous" | "authenticated", canonicalTier: CanonicalTier): EffectiveTier {
  if (authState === "anonymous") return "anon_free";
  if (canonicalTier === "free") return "auth_free";
  return canonicalTier;
}

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
    canonicalTier: normalizeCanonicalTier(activeRows[0]?.tier ?? "free"),
  };
}

function normalizeRequestedFundingSource(
  rawRequestedFundingSource: unknown,
  rawModelClass: unknown,
): RequestedFundingSource {
  const normalized = String(rawRequestedFundingSource ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "demo_public") return "demo_public";
  if (normalized === "user_key") return "user_key";
  if (normalized === "user_chatgpt" || normalized === "chatgpt") return "user_chatgpt";
  if (normalized === "platform") return "platform";
  const modelClass = String(rawModelClass ?? "")
    .trim()
    .toLowerCase();
  return modelClass === "free_model" ? "demo_public" : "platform";
}

function allow(lane: GateLane, fundingSource: RequestedFundingSource | null): GateDecision {
  return { allowed: true, code: "ok", cta: "none", lane, fundingSource };
}

function deny(code: Exclude<GateCode, "ok">, cta: GateCta): GateDecision {
  return { allowed: false, code, cta, lane: null, fundingSource: null };
}

function evaluateDecision(input: {
  authState: "anonymous" | "authenticated";
  surface: "web" | "mobile";
  executionMode: "cloud";
  requestedFundingSource: RequestedFundingSource;
  turnClass: "chat_only" | "requires_tools";
  effectiveTier: EffectiveTier;
  hasUserKeyConnection: boolean;
  hasUserChatGptConnection: boolean;
}): GateDecision {
  const isAnonymous = input.effectiveTier === "anon_free";
  const isPaid = input.effectiveTier === "builder" || input.effectiveTier === "architect";

  if (input.turnClass === "requires_tools") {
    if (input.requestedFundingSource === "user_chatgpt") {
      if (isAnonymous) return deny("auth_required", "sign_in");
      if (!isPaid) return deny("tier_required", "upgrade");
      if (input.hasUserChatGptConnection) return allow("daytona_cloud", "user_chatgpt");
      return deny("provider_connection_required", "connect_provider");
    }
    if (input.requestedFundingSource === "user_key") {
      if (isAnonymous) return deny("auth_required", "sign_in");
      if (!isPaid) return deny("tier_required", "upgrade");
      if (input.hasUserKeyConnection) return allow("daytona_cloud", "user_key");
      return deny("provider_connection_required", "connect_provider");
    }
    if (isPaid) return allow("daytona_cloud", "platform");
    return deny(isAnonymous ? "auth_required" : "tier_required", isAnonymous ? "sign_in" : "upgrade");
  }

  if (input.requestedFundingSource === "demo_public") return allow("public", "demo_public");

  if (input.requestedFundingSource === "user_key") {
    if (isAnonymous) return deny("auth_required", "sign_in");
    if (input.hasUserKeyConnection) return allow("platform", "user_key");
    return deny("provider_connection_required", "connect_provider");
  }

  if (input.requestedFundingSource === "user_chatgpt") {
    if (isAnonymous) return deny("auth_required", "sign_in");
    if (input.hasUserChatGptConnection) {
      return allow("chatgpt", "user_chatgpt");
    }
    return deny(
      input.hasUserChatGptConnection ? "runner_unavailable" : "provider_connection_required",
      input.hasUserChatGptConnection ? "none" : "connect_provider",
    );
  }

  if (isPaid) return allow("platform", "platform");

  if (input.authState === "authenticated" && input.hasUserChatGptConnection) {
    return allow("chatgpt", "user_chatgpt");
  }

  return deny(isAnonymous ? "auth_required" : "tier_required", isAnonymous ? "sign_in" : "upgrade");
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
      };
    }
    const authSubject = await resolveAuthenticatedSubject({
      ctx,
      authSubject: authSubjectInput || null,
    });
    const resolved = await getCanonicalTierBySubject({ ctx, authSubject, nowMs });
    const effectiveTier = resolveEffectiveTier("authenticated", resolved.canonicalTier);
    return {
      authState: "authenticated" as const,
      authSubject,
      userId: resolved.userId,
      canonicalTier: resolved.canonicalTier,
      effectiveTier,
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
    turnClass: v.union(v.literal("chat_only"), v.literal("requires_tools")),
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

    const effectiveTier = resolveEffectiveTier(authState, canonicalTier);
    const decision = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: args.executionMode,
      requestedFundingSource: normalizeRequestedFundingSource(args.requestedFundingSource, args.modelClass),
      turnClass: args.turnClass,
      effectiveTier,
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

    const effectiveTier = resolveEffectiveTier(authState, canonicalTier);
    const hasUserKeyConnection = Boolean(args.hasUserKeyConnection);
    const hasUserChatGptConnection = Boolean(args.hasUserChatGptConnection);
    const chatDemoPublic = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "demo_public",
      turnClass: "chat_only",
      effectiveTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const chatUserKey = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "user_key",
      turnClass: "chat_only",
      effectiveTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const chatUserChatgpt = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "user_chatgpt",
      turnClass: "chat_only",
      effectiveTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const chatPlatform = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "platform",
      turnClass: "chat_only",
      effectiveTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });
    const toolsPlatform = evaluateDecision({
      authState,
      surface: args.surface,
      executionMode: "cloud",
      requestedFundingSource: "platform",
      turnClass: "requires_tools",
      effectiveTier,
      hasUserKeyConnection,
      hasUserChatGptConnection,
    });

    return {
      authState,
      authSubject,
      userId,
      canonicalTier,
      effectiveTier,
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
        allowCloudTools: toolsPlatform.allowed && toolsPlatform.lane === "daytona_cloud",
      },
    };
  },
});
