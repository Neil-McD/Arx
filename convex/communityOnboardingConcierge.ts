import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog";
import {
  COMMUNITY_ONBOARDING_ORIENTATION_MAX_TOKENS,
  COMMUNITY_ONBOARDING_ORIENTATION_PROMPT_VERSION,
  COMMUNITY_ONBOARDING_ORIENTATION_PROVIDER_TIMEOUT_MS,
  buildCommunityOnboardingOrientationFallback,
  buildCommunityOnboardingOrientationMessages,
  normalizeCommunityOnboardingOrientationOutput,
  type CommunityOnboardingOrientationPromptContext,
} from "../shared/communityOnboardingConcierge";
import {
  DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
  normalizeCommunityOnboardingText,
} from "../shared/communityOnboarding";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { readCanonicalCommunityAgentContext } from "./communityAgentContext";
import {
  hasChatgptConnectionForUser,
  hasOpenAiConnectionForUser,
  resolveGateDecisionForAuthenticatedActor,
} from "./httpRuntimeSupport";
import { loadPlatformModelMap, parseProviderModelRef } from "./httpInferenceConfig";
import { runChatgptNativeToolCompletion } from "./httpChatgpt";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { decryptStoredSecret } from "./providerConnections";

const internalRefs = internal as any;
const FAILURE_CODE_MAX_CHARS = 120;
const RUNNING_CLAIM_STALE_AFTER_MS =
  COMMUNITY_ONBOARDING_ORIENTATION_PROVIDER_TIMEOUT_MS + 4_000;

type OrientationNarrationRow = {
  status: "idle" | "running" | "ready" | "fallback";
  text?: string;
  promptVersion: string;
  requestedAt?: number;
  startedAt?: number;
  completedAt?: number;
  resolvedModelId?: string;
  failureCode?: string;
};

type PublicOrientationResult = {
  status: "running" | "ready" | "fallback";
  text: string;
};

function boundedFailureCode(raw: unknown): string {
  return normalizeCommunityOnboardingText(raw, FAILURE_CODE_MAX_CHARS) || "provider_error";
}

function firstName(raw: unknown): string {
  return String(raw ?? "").trim().split(/\s+/)[0]?.slice(0, 80) ?? "";
}

function readOrientationNarration(session: Record<string, any>): OrientationNarrationRow | null {
  const row = session.conciergeNarration?.orientation;
  return row && typeof row === "object" ? row as OrientationNarrationRow : null;
}

function withOrientationNarration(
  session: Record<string, any>,
  orientation: OrientationNarrationRow,
): Record<string, unknown> {
  return {
    ...(session.conciergeNarration ?? {}),
    orientation,
  };
}

function buildFallbackForSession(args: {
  session: Record<string, any>;
  communityName: string;
  communityOneLiner?: string | null;
}): string {
  const stored = String(readOrientationNarration(args.session)?.text ?? "").trim();
  if (stored) return stored;
  return buildCommunityOnboardingOrientationFallback({
    communityName: args.communityName || "this community",
    communityOneLiner: args.communityOneLiner,
    welcomeMessage: String(
      args.session.welcomeMessageSnapshot ?? DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
    ),
    hasVideo: Boolean(String(args.session.introVideoUrlSnapshot ?? "").trim()),
  });
}

async function invokeOrientationConcierge(args: {
  ctx: any;
  sponsorUserId: string;
  sponsorAuthSubject: string;
  requestKey: string;
  promptContext: CommunityOnboardingOrientationPromptContext;
}): Promise<{
  ok: true;
  text: string;
  resolvedModelId: string | null;
} | {
  ok: false;
  failureCode: string;
}> {
  const [hasUserKeyConnection, hasUserChatgptConnection] = await Promise.all([
    hasOpenAiConnectionForUser({ ctx: args.ctx, userId: args.sponsorUserId }),
    hasChatgptConnectionForUser({ ctx: args.ctx, userId: args.sponsorUserId }),
  ]);
  const gateDecision = await resolveGateDecisionForAuthenticatedActor({
    ctx: args.ctx,
    authSubject: args.sponsorAuthSubject,
    surface: "web",
    requestedFundingSource: "platform",
    hasUserKeyConnection,
    hasUserChatgptConnection,
  });
  if (!gateDecision.allowed) {
    return { ok: false, failureCode: boundedFailureCode(gateDecision.code) };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    COMMUNITY_ONBOARDING_ORIENTATION_PROVIDER_TIMEOUT_MS,
  );
  try {
    let completion: Awaited<ReturnType<typeof runChatgptNativeToolCompletion>>;
    if (gateDecision.fundingSource === "user_chatgpt") {
      completion = await runChatgptNativeToolCompletion({
        ctx: args.ctx,
        userId: args.sponsorUserId,
        modelId: DEFAULT_ACTIVE_MODEL_ID,
        messages: buildCommunityOnboardingOrientationMessages(args.promptContext),
        maxTokens: COMMUNITY_ONBOARDING_ORIENTATION_MAX_TOKENS,
        tools: [],
        toolChoice: "none",
        parallelToolCalls: false,
        requestMetadata: {
          userId: args.sponsorUserId,
          sessionId: args.requestKey,
          threadId: args.requestKey,
        },
        reasoningEffort: "low",
        signal: abortController.signal,
      });
    } else if (gateDecision.fundingSource === "user_key") {
      const connection = await args.ctx.runQuery(
        internalRefs.providerConnections.getOpenAiConnectionForUserInternal,
        { userId: args.sponsorUserId },
      ) as { encryptedSecretHex?: unknown; secretIvHex?: unknown } | null;
      if (!connection?.encryptedSecretHex || !connection?.secretIvHex) {
        return { ok: false, failureCode: "provider_connection_required" };
      }
      const apiKey = await decryptStoredSecret({
        encryptedSecretHex: String(connection.encryptedSecretHex),
        secretIvHex: String(connection.secretIvHex),
      });
      const providerRef = parseProviderModelRef(
        loadPlatformModelMap()[DEFAULT_ACTIVE_MODEL_ID] ?? "",
      );
      if (providerRef?.provider !== "openai") {
        return { ok: false, failureCode: "provider_model_unavailable" };
      }
      completion = await runOpenAiNativeToolCompletion({
        modelId: providerRef.providerModel,
        messages: buildCommunityOnboardingOrientationMessages(args.promptContext),
        maxTokens: COMMUNITY_ONBOARDING_ORIENTATION_MAX_TOKENS,
        tools: [],
        toolChoice: "none",
        parallelToolCalls: false,
        apiKeyOverride: apiKey,
        signal: abortController.signal,
      });
    } else {
      return { ok: false, failureCode: "provider_connection_required" };
    }

    if (completion.ok === false) {
      return { ok: false, failureCode: boundedFailureCode(completion.code) };
    }
    if (completion.type !== "assistant") {
      return { ok: false, failureCode: "unexpected_tool_call" };
    }
    const text = normalizeCommunityOnboardingOrientationOutput(completion.assistantText);
    if (!text) return { ok: false, failureCode: "invalid_model_output" };
    return {
      ok: true,
      text,
      resolvedModelId: completion.resolvedModelId ?? null,
    };
  } catch (error) {
    const failureCode = abortController.signal.aborted
      ? "provider_timeout"
      : boundedFailureCode(error instanceof Error ? error.name : "provider_exception");
    return { ok: false, failureCode };
  } finally {
    clearTimeout(timeout);
  }
}

export const claimMyOrientationNarrationInternal = internalMutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sessionId: v.id("communityOnboardingSessions"),
    promptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const session = await ctx.db.get(args.sessionId as any) as Record<string, any> | null;
    const orientation = session ? readOrientationNarration(session) : null;
    if (
      !session ||
      session.status !== "active" ||
      session.orientationCompletedAt ||
      normalizeIdValue(session.communityId) !== normalizeIdValue(args.communityId) ||
      normalizeIdValue(session.userId) !== normalizeIdValue(userId) ||
      !orientation ||
      orientation.promptVersion !== args.promptVersion
    ) {
      return { kind: "skip" as const, status: "fallback" as const, text: "" };
    }

    const nowMs = Date.now();
    const fallbackText = String(orientation.text ?? "").trim();
    if (orientation.status === "ready" || orientation.status === "fallback") {
      return {
        kind: "complete" as const,
        status: orientation.status,
        text: fallbackText,
      };
    }
    if (orientation.status === "running") {
      const startedAt = Number(orientation.startedAt ?? orientation.requestedAt ?? 0);
      if (startedAt > 0 && nowMs - startedAt < RUNNING_CLAIM_STALE_AFTER_MS) {
        return { kind: "running" as const, status: "running" as const, text: fallbackText };
      }
      await ctx.db.patch(session._id, {
        conciergeNarration: withOrientationNarration(session, {
          ...orientation,
          status: "fallback",
          text: fallbackText,
          completedAt: nowMs,
          failureCode: "stale_generation",
        }),
        updatedAt: nowMs,
      });
      return { kind: "complete" as const, status: "fallback" as const, text: fallbackText };
    }

    const canonical = await readCanonicalCommunityAgentContext(ctx, session.communityId);
    const member = await ctx.db.get(session.userId as any) as Record<string, any> | null;
    const sponsorAuthSubject = String(args.authSubject ?? "").trim();
    let failureCode = "";
    if (!canonical) failureCode = "community_not_found";
    if (canonical && !canonical.agentEnabled) failureCode ||= "agent_disabled";
    if (!member) failureCode ||= "member_not_found";
    if (!sponsorAuthSubject) failureCode ||= "auth_subject_missing";
    const resolvedFallback = fallbackText || buildFallbackForSession({
      session,
      communityName: canonical?.communityName ?? "this community",
      communityOneLiner: canonical?.communityOneLiner,
    });
    if (failureCode || !canonical || !member) {
      await ctx.db.patch(session._id, {
        conciergeNarration: withOrientationNarration(session, {
          ...orientation,
          status: "fallback",
          text: resolvedFallback,
          completedAt: nowMs,
          failureCode: failureCode || "context_unavailable",
        }),
        updatedAt: nowMs,
      });
      return { kind: "complete" as const, status: "fallback" as const, text: resolvedFallback };
    }

    await ctx.db.patch(session._id, {
      conciergeNarration: withOrientationNarration(session, {
        ...orientation,
        status: "running",
        text: resolvedFallback,
        requestedAt: nowMs,
        startedAt: nowMs,
      }),
      updatedAt: nowMs,
    });
    return {
      kind: "generate" as const,
      sponsorUserId: session.userId,
      sponsorAuthSubject,
      fallbackText: resolvedFallback,
      promptContext: {
        agentDisplayName: canonical.agentDisplayName,
        communityName: canonical.communityName ?? "this community",
        communityOneLiner: canonical.communityOneLiner,
        communityAbout: canonical.communityAbout,
        communitySystemPrompt: canonical.communitySystemPrompt,
        founderWelcome: String(
          session.welcomeMessageSnapshot ?? DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
        ),
        memberFirstName: firstName(member.displayName),
        hasVideo: Boolean(String(session.introVideoUrlSnapshot ?? "").trim()),
      } satisfies CommunityOnboardingOrientationPromptContext,
    };
  },
});

async function canFinalizeOrientation(args: {
  ctx: any;
  session: Record<string, any> | null;
  promptVersion: string;
}): Promise<boolean> {
  const session = args.session;
  const orientation = session ? readOrientationNarration(session) : null;
  if (
    !session ||
    session.status !== "active" ||
    session.orientationCompletedAt ||
    !orientation ||
    orientation.status !== "running" ||
    orientation.promptVersion !== args.promptVersion
  ) {
    return false;
  }
  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: session.communityId,
      userId: session.userId,
    });
    return true;
  } catch {
    return false;
  }
}

export const finalizeOrientationNarrationReadyInternal = internalMutation({
  args: {
    sessionId: v.id("communityOnboardingSessions"),
    promptVersion: v.string(),
    text: v.string(),
    resolvedModelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId as any) as Record<string, any> | null;
    if (!session || !(await canFinalizeOrientation({ ctx, session, promptVersion: args.promptVersion }))) {
      return { finalized: false };
    }
    const orientation = readOrientationNarration(session)!;
    const text = normalizeCommunityOnboardingOrientationOutput(args.text);
    if (!text) return { finalized: false };
    const nowMs = Date.now();
    await ctx.db.patch(session._id, {
      conciergeNarration: withOrientationNarration(session, {
        ...orientation,
        status: "ready",
        text,
        completedAt: nowMs,
        ...(args.resolvedModelId ? { resolvedModelId: args.resolvedModelId } : {}),
      }),
      updatedAt: nowMs,
    });
    return { finalized: true, status: "ready" as const, text };
  },
});

export const finalizeOrientationNarrationFallbackInternal = internalMutation({
  args: {
    sessionId: v.id("communityOnboardingSessions"),
    promptVersion: v.string(),
    failureCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId as any) as Record<string, any> | null;
    if (!session || !(await canFinalizeOrientation({ ctx, session, promptVersion: args.promptVersion }))) {
      return { finalized: false };
    }
    const orientation = readOrientationNarration(session)!;
    const text = String(orientation.text ?? "").trim();
    const nowMs = Date.now();
    await ctx.db.patch(session._id, {
      conciergeNarration: withOrientationNarration(session, {
        ...orientation,
        status: "fallback",
        text,
        completedAt: nowMs,
        failureCode: boundedFailureCode(args.failureCode ?? "provider_error"),
      }),
      updatedAt: nowMs,
    });
    return { finalized: true, status: "fallback" as const, text };
  },
});

export const requestMyOrientationNarration = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sessionId: v.id("communityOnboardingSessions"),
  },
  handler: async (ctx, args): Promise<PublicOrientationResult> => {
    const promptVersion = COMMUNITY_ONBOARDING_ORIENTATION_PROMPT_VERSION;
    const claim = await ctx.runMutation(
      internalRefs.communityOnboardingConcierge.claimMyOrientationNarrationInternal,
      { ...args, promptVersion },
    );
    if (claim?.kind !== "generate") {
      return {
        status: claim?.status === "running" || claim?.status === "ready"
          ? claim.status
          : "fallback",
        text: String(claim?.text ?? ""),
      };
    }

    const result = await invokeOrientationConcierge({
      ctx,
      sponsorUserId: normalizeIdValue(claim.sponsorUserId),
      sponsorAuthSubject: String(claim.sponsorAuthSubject),
      requestKey:
        `community-onboarding:${normalizeIdValue(args.sessionId)}:orientation:${promptVersion}`,
      promptContext: claim.promptContext,
    });
    if (!result.ok) {
      const finalized = await ctx.runMutation(
        internalRefs.communityOnboardingConcierge.finalizeOrientationNarrationFallbackInternal,
        { sessionId: args.sessionId, promptVersion, failureCode: result.failureCode },
      );
      return {
        status: "fallback",
        text: String(finalized?.text ?? claim.fallbackText),
      };
    }
    const finalized = await ctx.runMutation(
      internalRefs.communityOnboardingConcierge.finalizeOrientationNarrationReadyInternal,
      {
        sessionId: args.sessionId,
        promptVersion,
        text: result.text,
        ...(result.resolvedModelId ? { resolvedModelId: result.resolvedModelId } : {}),
      },
    );
    return {
      status: finalized?.finalized ? "ready" : "fallback",
      text: String(finalized?.text ?? claim.fallbackText),
    };
  },
});

export const readOrientationNarrationPreviewContextInternal = internalQuery({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const config = await ctx.db
      .query("communityOnboardingConfigs" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .first() as Record<string, any> | null;
    const canonical = await readCanonicalCommunityAgentContext(ctx, args.communityId);
    if (!canonical) throw new Error("community_not_found");
    const user = await ctx.db.get(userId as any) as Record<string, any> | null;
    const founderWelcome = String(
      config?.welcomeMessage ?? DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
    );
    const hasVideo = Boolean(String(config?.introVideoUrl ?? "").trim());
    const fallbackText = buildCommunityOnboardingOrientationFallback({
      communityName: canonical.communityName ?? "this community",
      communityOneLiner: canonical.communityOneLiner,
      welcomeMessage: founderWelcome,
      hasVideo,
    });
    return {
      sponsorUserId: userId,
      sponsorAuthSubject: String(args.authSubject ?? "").trim(),
      fallbackText,
      failureCode: canonical.agentEnabled ? null : "agent_disabled",
      promptContext: {
        agentDisplayName: canonical.agentDisplayName,
        communityName: canonical.communityName ?? "this community",
        communityOneLiner: canonical.communityOneLiner,
        communityAbout: canonical.communityAbout,
        communitySystemPrompt: canonical.communitySystemPrompt,
        founderWelcome,
        memberFirstName: firstName(user?.displayName),
        hasVideo,
      } satisfies CommunityOnboardingOrientationPromptContext,
    };
  },
});

export const generateOrientationNarrationPreview = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args): Promise<PublicOrientationResult> => {
    const context = await ctx.runQuery(
      internalRefs.communityOnboardingConcierge.readOrientationNarrationPreviewContextInternal,
      args,
    );
    if (context.failureCode || !context.sponsorAuthSubject) {
      return { status: "fallback", text: context.fallbackText };
    }
    const result = await invokeOrientationConcierge({
      ctx,
      sponsorUserId: normalizeIdValue(context.sponsorUserId),
      sponsorAuthSubject: context.sponsorAuthSubject,
      requestKey:
        `community-onboarding-preview:${normalizeIdValue(args.communityId)}:${Date.now()}`,
      promptContext: context.promptContext,
    });
    if (!result.ok) return { status: "fallback", text: context.fallbackText };
    return { status: "ready", text: result.text };
  },
});
