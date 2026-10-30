import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { resolveCommunityAgentDisplayName } from "./communityAgentContext";
import { communityFormAgentDraftPrompt, normalizeCommunityFormAgentDraft } from "../shared/communityFormAgentDraft";
import type { CommunityFormContent } from "../shared/communityForms";

// "Draft with The Builder" in Workflows › Forms. Nothing is saved here: the
// draft opens in the builder, which saves it as an unpublished draft the owner
// reviews before publishing. Agents can do the same by calling
// community.form.save with questions they write themselves.

const MAX_OUTPUT_TOKENS = 2400;
const readEnv = (name: string) => { const value = (globalThis as any)?.process?.env?.[name]; return typeof value === "string" ? value.trim() : ""; };

export const formDraftContextInternal = internalQuery({
  args: { communityId: v.id("communities"), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const community: any = await ctx.db.get(args.communityId);
    const properties = (await ctx.db.query("communityClientProperties")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId)).take(100))
      .filter((row: any) => !row.archivedAt)
      .map((row: any) => ({ key: row.key, name: row.name, type: row.type, options: row.options ?? [] }));
    return { userId, community: { name: community?.name ?? "", one_liner: community?.oneLiner ?? "", about: String(community?.about ?? "").slice(0, 2000) }, properties };
  },
});

/** The agent's name for the "Draft with …" button. */
export const formDraftAgentName = query({
  args: { communityId: v.id("communities"), authSubject: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const community: any = await ctx.db.get(args.communityId);
    const config: any = await ctx.db.query("communityAgentConfigs" as any)
      .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", args.communityId)).order("desc").first();
    return resolveCommunityAgentDisplayName({ configuredDisplayName: config?.agentDisplayName, communityName: community?.name });
  },
});

export const draftBuilderFormWithAgent = action({
  args: { communityId: v.id("communities"), authSubject: v.optional(v.string()), brief: v.string() },
  handler: async (ctx, args): Promise<CommunityFormContent> => {
    const brief = args.brief.trim().slice(0, 2000);
    if (!brief) throw new Error("form_draft_brief_required");
    const context: any = await ctx.runQuery((internal as any).communityFormDrafts.formDraftContextInternal,
      { communityId: args.communityId, authSubject: args.authSubject });
    const requestId = crypto.randomUUID();
    const fundedRun = await startFundedInferenceRun({
      ctx, communityId: args.communityId, actorUserId: context.userId,
      surface: "community_setup_generation",
      receiptKey: `community_setup_generation:form_draft:${requestId}`,
      sourceRunId: `community-form-draft:${requestId}`,
      admission: await resolveCommunityInferenceFundingForAction(ctx, args.communityId),
    });
    let completion: any;
    try {
      completion = await fundedRun.request({
        messages: [
          { role: "system", content: communityFormAgentDraftPrompt() },
          { role: "user", content: JSON.stringify({ community: context.community, brief, member_fields: context.properties }, null, 2) },
        ],
        maxTokens: MAX_OUTPUT_TOKENS,
        tools: [],
        apiKeyOverride: readEnv("OPENAI_API_KEY") || readEnv("ARX_OPENAI_API_KEY") || undefined,
      });
    } catch (error) {
      await fundedRun.fail("form_draft_provider_error");
      throw error;
    }
    if (!completion.ok) { await fundedRun.fail(completion.code); throw new Error("form_draft_agent_unavailable"); }
    if (!(await fundedRun.settle("provider_completed"))) throw new Error("form_draft_agent_unavailable");
    if (completion.type !== "assistant") throw new Error("form_draft_unreadable");
    return normalizeCommunityFormAgentDraft(completion.assistantText, context.properties, () => crypto.randomUUID());
  },
});
