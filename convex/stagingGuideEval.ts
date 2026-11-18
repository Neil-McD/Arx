// Staging only: one request to the guide, run through the real private-talk
// loop (same instructions, tools, model, executor and funding as a person
// typing on Home), with what it did handed back: the tools it called and how
// each answered, what it said, and any question it left waiting for a yes.
// For measuring a change to the guide's instructions or tools before and
// after (scripts/guide_eval.mjs). No conversation is kept: each request
// starts fresh. Refuses unless the deployment sets POLYNET_ALLOW_SEED=1.
import { getFunctionName } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";
import { founderProviderRequests } from "./founderInferenceUsage";
import { executeChatToolsAgentLoop } from "./runtimeAgentLoop";
import { COMMUNITY_OWNER_FUNDED_MODEL_ID } from "../shared/founderInference";
import { parseTalkLens, talkToolNames } from "../shared/lens";

const refs = internal as any;

export const readForEvalInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), sinceMs: v.number() },
  handler: async (ctx, args) => {
    const questions = await ctx.db.query("communityGuideQuestions")
      .withIndex("by_community_user_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("userId", args.userId).eq("status", "waiting"))
      .collect();
    return {
      questions: questions.filter((row) => row.createdAt >= args.sinceMs)
        .map((row) => ({ kind: row.kind, question: row.question, text: row.text ?? null, items: row.items ?? [] })),
    };
  },
});

// Before a run: the community as it stands, to put back afterwards.
export const snapshotForEvalInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    if (process.env.POLYNET_ALLOW_SEED !== "1") throw new Error("guide_eval_not_allowed_on_this_deployment");
    const { _id, _creationTime, ...community } = (await ctx.db.get(args.communityId)) as any;
    return community;
  },
});

// After a run: what the guide made since it began is removed (events,
// channels, courses and lessons), questions it left waiting are declined, and
// the community's own settings are put back. Posts need a yes the run never
// gives, so there are none to remove. The seed puts the rest back.
export const cleanUpAfterEvalInternal = internalMutation({
  args: { communityId: v.id("communities"), sinceMs: v.number(), community: v.any() },
  handler: async (ctx, args) => {
    if (process.env.POLYNET_ALLOW_SEED !== "1") throw new Error("guide_eval_not_allowed_on_this_deployment");
    const removed: Record<string, number> = {};
    const fresh = (row: any) => Number(row.createdAt ?? row._creationTime) >= args.sinceMs;
    const events = await ctx.db.query("communityEvents").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).collect();
    const channels = await ctx.db.query("communityChannels").withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId)).collect();
    const lessons = await ctx.db.query("communityResources").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).collect();
    const courses = await ctx.db.query("communityResourceModules").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).collect();
    for (const [name, rows] of Object.entries({ events, channels: channels.filter((row: any) => !row.systemRole), lessons, courses })) {
      for (const row of (rows as any[]).filter(fresh)) { await ctx.db.delete(row._id); removed[name] = (removed[name] ?? 0) + 1; }
    }
    // A staging table small enough to read whole; no index runs by community alone.
    const waiting = (await ctx.db.query("communityGuideQuestions").collect())
      .filter((row) => row.communityId === args.communityId && row.status === "waiting" && row.createdAt >= args.sinceMs);
    for (const row of waiting) await ctx.db.patch(row._id, { status: "declined", dropped: true, answeredAt: Date.now() } as any); // dropped: not an answer the person gave, so the guide is never told "they said no"
    removed.questions = waiting.length;
    if (args.community && typeof args.community === "object") await ctx.db.replace(args.communityId, args.community);
    return removed;
  },
});

// Public so it can be run as a person (`npx convex run ... --identity`): the
// guide's tools check the person's own sign-in, exactly as on Home. It only
// ever acts as whoever is signed in, never as someone named in the arguments.
export const runGuideRequest = action({
  // section: the page the person is on (home, knowledge, ...), as the app sends it.
  args: { communityId: v.id("communities"), text: v.string(), section: v.optional(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    if (process.env.POLYNET_ALLOW_SEED !== "1") throw new Error("guide_eval_not_allowed_on_this_deployment");
    const authSubject = String((await ctx.auth.getUserIdentity())?.subject ?? "").trim();
    if (!authSubject) throw new Error("guide_eval_sign_in_required");
    const user = await ctx.runQuery(refs.threads.getUserByAuthSubjectInternal, { authSubject });
    if (!user) throw new Error("guide_eval_person_not_found");
    const userId = user._id;
    const startedAt = Date.now();
    const context = await ctx.runQuery(refs.communityAgent.resolveRuntimeCommunityPromptContextInternal,
      { authSubject, userId, communityId: args.communityId });
    const talk = parseTalkLens(context.community_lens);
    const admission = await ctx.runQuery(refs.founderInference.resolveCommunityInferenceFundingAdmissionInternal, { communityId: args.communityId });
    if (admission.ok === false) throw new Error(`guide_eval_ai_unavailable:${admission.code}`);
    const runId = `guide-eval-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    // The loop asks, before each step, whether the person pressed stop on
    // this run. A measurement has no stored run to stop, so that one question
    // is answered here ("still running"); everything else goes to the database.
    const loopCtx = {
      ...ctx,
      runQuery: async (ref: any, queryArgs: any) =>
        getFunctionName(ref) === "threads:getRuntimeRunByOwnerRunIdInternal" && queryArgs?.runId === runId
          ? { status: "running" }
          : await ctx.runQuery(ref, queryArgs),
      runMutation: ctx.runMutation.bind(ctx),
      runAction: ctx.runAction.bind(ctx),
    };
    const result = await executeChatToolsAgentLoop({
      ctx: loopCtx,
      req: new Request("https://guide-eval.invalid/"),
      userId: String(userId),
      threadId: null,
      authSubject,
      requestedModelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
      inferenceSource: "platform",
      modelRef: `openai/${COMMUNITY_OWNER_FUNDED_MODEL_ID}`,
      messages: [{ role: "user", content: args.text }],
      maxTokens: 2048,
      runId,
      allowedToolNames: talkToolNames(talk),
      invocationSurface: "member_agent_dock",
      communityId: String(args.communityId),
      communityName: context.community_name,
      communitySlug: context.community_slug,
      communityOneLiner: context.community_one_liner,
      communityAbout: context.community_about,
      communityChannels: context.community_channels,
      communitySystemPrompt: context.community_system_prompt,
      communityLens: talk,
      communityAgentSurfaceContext: { version: 1, kind: "community", community_slug: context.community_slug, community_conversation: true, section: args.section ?? "home" },
      communityInferenceAdmission: admission,
      measurementWithoutReceipt: true,
      appendRunEvent: async (event: { eventType: string; payload: Record<string, unknown> }) => { events.push({ eventType: event.eventType, payload: event.payload }); },
    } as any);
    if (result.ok && result.funding) {
      const { session, usage } = result.funding;
      await settleCommunityInferenceFundingSession({
        ctx, session, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
        providerRequests: founderProviderRequests(usage), usageComplete: usage.complete, outcomeCode: "guide_eval_completed",
      });
    }
    const after = await ctx.runQuery(refs.stagingGuideEval.readForEvalInternal, { userId, communityId: args.communityId, sinceMs: startedAt });
    const short = (value: unknown, max: number) => {
      const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
      return text.length > max ? `${text.slice(0, max)}…` : text;
    };
    const started = events.filter((event) => event.eventType === "tool_call_started");
    const finished = events.filter((event) => event.eventType === "tool_call_finished");
    return {
      ok: result.ok,
      lens: talk?.lens ?? null,
      answer: result.ok ? result.assistantText : `${(result as any).code}`,
      tools: started.map((event) => {
        const end: any = finished.find((row) => row.payload.tool_call_id === event.payload.tool_call_id)?.payload ?? {};
        return {
          name: String(event.payload.tool_name ?? ""),
          args: short(event.payload.args, 400),
          status: String(end.status ?? ""),
          error: end.error_code ? `${String(end.error_code)}: ${short(end.error_message ?? "", 240)}` : null,
          output: short(end.output_text ?? end.output ?? end.details?.output_preview ?? "", 700),
        };
      }),
      questions: after.questions,
      usage: result.ok && result.funding ? {
        promptTokens: result.funding.usage.promptTokens, completionTokens: result.funding.usage.completionTokens,
        // How much of what was sent the provider already had (cheaper, faster), and how many requests it took.
        cachedTokens: result.funding.usage.providerRequests.reduce((sum: number, request: any) => sum + Number(request.cachedInputTokens ?? 0), 0),
        requests: result.funding.usage.providerRequests.length,
      } : null,
      ms: Date.now() - startedAt,
    };
  },
});
