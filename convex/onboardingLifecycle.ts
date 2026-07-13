import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

/* Temporary cached-client compatibility only. The retired onboarding agent,
   activation lifecycle, skill, and dedicated thread are intentionally absent. */
export const requestOnboardingGuideKickoff = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const actor = (await ctx.runQuery(
      (internal as any).authActor.resolveAuthenticatedActorInternal as any,
      { authSubject: args.authSubject ?? undefined },
    )) as { authSubject?: unknown; dbUserId?: unknown } | null;
    const authSubject = normalizeText(actor?.authSubject);
    if (!authSubject || !actor?.dbUserId) throw new Error("authenticated_user_required");

    const destination = (await ctx.runMutation(
      (internal as any).memberEntryDestination.resolveMemberEntryDestinationInternal as any,
      {
        userId: actor.dbUserId,
        ...(args.communityId ? { communityId: args.communityId } : {}),
        nowMs: Date.now(),
      },
    )) as { page?: unknown; community_id?: unknown } | null;
    const communityId = normalizeText(destination?.community_id) || null;
    const channel = (await ctx.runMutation((api as any).threads.ensureMemberAgentGlobalChannel as any, {
      ownerId: actor.dbUserId,
      authSubject,
      ...(communityId ? { initialCommunityId: communityId } : {}),
      nowMs: Date.now(),
    })) as { thread_key?: unknown } | null;
    const threadKey = normalizeText(channel?.thread_key);
    if (!threadKey) throw new Error("member_agent_thread_create_failed");

    return {
      ok: true,
      status: "completed",
      activation_id: null,
      thread_id: threadKey,
      community_id: communityId,
      run_id: null,
      run_required: false,
      compatibility_route: "member_agent_global_channel",
    };
  },
});
