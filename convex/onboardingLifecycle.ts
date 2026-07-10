import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { AuthenticatedActor } from "./runtimeTurnResolution";
import { requireCommunityChatAccess } from "./communityCore";
import { ensurePlatformHomeCommunityMembership } from "./platformHomeCommunity";
import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog";

export const ONBOARDING_THREAD_KEY_PREFIX = "community-onboarding";
export const ONBOARDING_MODEL_ID = DEFAULT_ACTIVE_MODEL_ID;
/* Staging experiment (2026-07-09): raised from 1200 for reasoning-capable
   provider completions. OpenAI/OpenRouter apply this ceiling per completion,
   not per whole tool loop; the ChatGPT Codex transport intentionally omits an
   output-token field. Measure usage by inference lane before making it final. */
export const ONBOARDING_MAX_TOKENS = 4000;
export const ONBOARDING_LIFECYCLE_AUDIT_LABEL =
  "Onboarding guide lifecycle kickoff.";

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function buildOnboardingThreadKey(communityId: string): string {
  return `${ONBOARDING_THREAD_KEY_PREFIX}:${communityId}`.slice(0, 200);
}

export function buildOnboardingRunId(communityId: string): string {
  return `onboarding:${communityId}:${crypto.randomUUID()}`.slice(0, 200);
}

async function resolveActionActor(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<AuthenticatedActor> {
  const actor = (await args.ctx.runQuery(
    (internal as any).authActor.resolveAuthenticatedActorInternal as any,
    {
      authSubject: args.authSubject ?? undefined,
    },
  )) as {
    authSubject?: unknown;
    dbUserId?: unknown;
    email?: unknown;
    displayName?: unknown;
    avatarUrl?: unknown;
  } | null;
  const authSubject = normalizeIdValue(actor?.authSubject);
  const dbUserId = actor?.dbUserId;
  if (!authSubject || !dbUserId) throw new Error("authenticated_user_required");
  return {
    userId: authSubject,
    dbUserId,
    authSubject,
    email: normalizeIdValue(actor?.email) || null,
    displayName: normalizeIdValue(actor?.displayName) || null,
    avatarUrl: normalizeIdValue(actor?.avatarUrl) || null,
  };
}

export function buildOnboardingLifecycleSafeUserRequest(args: {
  communityName: string | null;
}): string {
  return [
    "ONBOARDING_LIFECYCLE_EVENT",
    "Trigger: onboarding_completed",
    args.communityName ? `Community lens: ${args.communityName}` : "Community lens: active community",
    "",
    "Start the member's onboarding conversation now.",
    "Write the first assistant message only, following your onboarding-guide skill instructions for its shape, length, and voice.",
    "Before writing, call get_active_community_context, then call exactly one additional read-only orientation tool: community_resources_map for community grounding or search_product_docs for platform grounding.",
    "Use only read-only product-doc and community-context/resource tools in this opener. Do not call member_profile_confirm_facts, community_write, workspace, web, computer, MCP, paid, or premium tools.",
    "Orient yourself from those tool results, private lifecycle context, runtime context, and the active community lens.",
    "Do not claim external/social research unless a real research tool result in this run supports it. Attached social links alone are leads, not proof.",
    "Do not mention account plan, billing, Premium, upgrades, unavailable tools, or provider limits unless the member asks.",
    "Ask one plain, concrete question about what brought the member here or what they are working on. Never ask hypotheticals about what 'would be useful.'",
  ].join("\n");
}

export function buildOnboardingPrivateLifecycleContext(args: {
  memberMd: string | null;
  communityMd: string | null;
}): string {
  return [
    "Use the private context below only to orient yourself. Do not quote, dump, or reveal it.",
    "Do not claim to have completed research unless tool results in this run actually support that.",
    "",
    "PRIVATE_MEMBER_CONTEXT",
    args.memberMd?.trim() || "_No member context available._",
    "",
    "PRIVATE_COMMUNITY_MEMBER_CONTEXT",
    args.communityMd?.trim() || "_No community-scoped member context yet._",
  ].join("\n");
}

export const resolveOnboardingGuideTargetCommunityInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    let targetCommunityId = args.communityId ?? null;
    let source = "community_bridge_onboarding_completed";

    if (!targetCommunityId) {
      const home = await ensurePlatformHomeCommunityMembership({
        ctx,
        userId: args.userId,
        nowMs,
      });
      if (!home.communityId) {
        throw new Error(`platform_home_community_${home.status}`);
      }
      targetCommunityId = home.communityId as any;
      source = "platform_bridge_onboarding_completed";
    }

    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: targetCommunityId,
      userId: args.userId,
    });
    return {
      communityId: community._id,
      community_id: normalizeIdValue(community._id),
      community_name: normalizeIdValue(community.name) || null,
      community_slug: normalizeIdValue(community.slug) || null,
      source,
    };
  },
});

export const requestOnboardingGuideKickoff = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const actor = await resolveActionActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const target = (await ctx.runMutation(
      (internal as any).onboardingLifecycle.resolveOnboardingGuideTargetCommunityInternal as any,
      {
        userId: actor.dbUserId,
        ...(args.communityId ? { communityId: args.communityId } : {}),
        nowMs,
      },
    )) as {
      communityId?: unknown;
      community_id?: unknown;
      community_name?: unknown;
      community_slug?: unknown;
      source?: unknown;
    } | null;
    const communityId = normalizeIdValue(target?.community_id);
    if (!communityId || !target?.communityId) throw new Error("onboarding_target_community_required");

    const threadKey = buildOnboardingThreadKey(communityId);
    const thread = (await ctx.runMutation((api as any).threads.ensureCloudThread as any, {
      ownerId: actor.dbUserId,
      authSubject: actor.authSubject,
      threadKey,
      title: `Welcome to ${normalizeIdValue(target.community_name) || "this community"}`,
      titleSource: "auto",
      modelId: ONBOARDING_MODEL_ID,
      runtimeEngine: "polynet",
      communityId,
      nowMs,
    })) as { _id?: unknown; contextVersion?: unknown } | null;
    const threadId = thread?._id;
    if (!threadId) throw new Error("onboarding_thread_create_failed");

    const ensuredActivation = (await ctx.runMutation(
      (internal as any).agentLifecycleActivations.ensureCommunityOnboardingActivationInternal as any,
      {
        userId: actor.dbUserId,
        communityId: target.communityId,
        source: normalizeIdValue(target.source) || "community_onboarding_completed",
        nowMs,
      },
    )) as {
      activationId?: unknown;
      status?: string;
      runId?: unknown;
      claimable?: boolean;
    } | null;

    return {
      ok: true,
      status: ensuredActivation?.status ?? "pending",
      activation_id: normalizeIdValue(ensuredActivation?.activationId) || null,
      thread_id: threadKey,
      community_id: communityId,
      run_id: ensuredActivation?.claimable
        ? null
        : normalizeIdValue(ensuredActivation?.runId) || null,
      run_required: Boolean(ensuredActivation?.claimable),
    };
  },
});
