import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityOwner } from "./communityCore";
import { doorstepCourses } from "./communityAppJoin";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { communityIsActive } from "../shared/communityLifecycle";
import {
  COMMUNITY_PUBLIC_PAGE_DRAFT_PROMPT,
  type CommunityPublicPage,
  type CommunityPublicPageDraft,
  emptyCommunityPublicPage,
  normalizeCommunityPublicPage,
  parseCommunityPublicPageDraft,
} from "../shared/communityPublicPage";

const internalRefs = internal as any;
// One draft at a time per community; a stuck one can be asked for again after this.
const DRAFT_LEASE_MS = 3 * 60_000;
const DRAFT_MAX_OUTPUT_TOKENS = 1_200;

// A community's public page (its doorstep): the sales sections its owner fills
// in from Studio's Settings. Only the owner reads the editable copy or saves
// it; every save is checked against the shared limits, and a save made from a
// stale copy (another tab saved first) is refused rather than overwriting it.
// The doorstep reads the saved page through communityAppJoinProjection.

function pageOf(row: any): CommunityPublicPage {
  if (!row) return emptyCommunityPublicPage();
  return {
    for_you: row.forYou, not_for: row.notFor, first_steps: row.firstSteps, results: row.results,
    founder_bio: row.founderBio, video: row.video ?? null, guarantee: row.guarantee, objections: row.objections,
  };
}

export async function loadCommunityPublicPage(ctx: any, communityId: any): Promise<CommunityPublicPage> {
  const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
  return pageOf(row);
}

async function requireOwner(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const { community } = await requireCommunityOwner({ ctx, communityId, userId });
  return { userId, community };
}

function draftOf(row: any): { status: "idle" | "drafting" | "ready" | "failed"; error: string | null; draft: CommunityPublicPageDraft | null } {
  const draft = row?.draft
    ? { for_you: row.draft.forYou, not_for: row.draft.notFor, first_steps: row.draft.firstSteps, objections: row.draft.objections }
    : null;
  return { status: row?.draftStatus ?? "idle", error: row?.draftError ?? null, draft: row?.draftStatus === "ready" ? draft : null };
}

export const getMyCommunityPublicPage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q) => q.eq("communityId", community._id)).first();
    return { page: pageOf(row), revision: row?.revision ?? 0, ai: draftOf(row) };
  },
});

// "Draft with AI": the owner asks; the community's AI (the founder's own
// allowance) writes a suggestion from what the founder already wrote, in the
// background. It never touches the page: Settings reads it into the empty
// fields, and the owner edits and saves.
export const requestMyCommunityPublicPageDraft = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { userId, community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q) => q.eq("communityId", community._id)).first();
    const nowMs = Date.now();
    if (row?.draftStatus === "drafting" && nowMs - (row.draftRequestedAt ?? 0) < DRAFT_LEASE_MS) return draftOf(row);
    const draftFields = { draftStatus: "drafting" as const, draftRequestedAt: nowMs, draftError: undefined, draft: undefined };
    if (row) await ctx.db.patch(row._id, draftFields);
    else {
      const empty = emptyCommunityPublicPage();
      await ctx.db.insert("communityPublicPages", {
        communityId: community._id, forYou: empty.for_you, notFor: empty.not_for, firstSteps: empty.first_steps, results: empty.results,
        founderBio: "", guarantee: "", objections: empty.objections, revision: 0, updatedByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
        ...draftFields,
      });
    }
    await ctx.scheduler.runAfter(0, internalRefs.communityPublicPage.draftCommunityPublicPageInternal, {
      communityId: community._id, requestedByUserId: userId, requestedAt: nowMs,
    });
    return { status: "drafting" as const, error: null, draft: null };
  },
});

// What the draft may use: only what the founder already wrote publicly.
export const loadCommunityPublicPageSourcesInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) return null;
    const courses = await doorstepCourses(ctx, community._id);
    return {
      name: String(community.name ?? ""),
      one_liner: String(community.oneLiner ?? "").slice(0, 500),
      about: String(community.about ?? "").slice(0, 4000),
      courses: courses.map((course) => ({ title: course.title, summary: course.summary, lessons: course.lessons })),
    };
  },
});

export const draftCommunityPublicPageInternal = internalAction({
  args: { communityId: v.id("communities"), requestedByUserId: v.id("users"), requestedAt: v.number() },
  handler: async (ctx, args) => {
    const record = (fields: { draft?: CommunityPublicPageDraft; error?: string }) =>
      ctx.runMutation(internalRefs.communityPublicPage.recordCommunityPublicPageDraftInternal, {
        communityId: args.communityId, requestedAt: args.requestedAt, ...fields,
      });
    const sources = await ctx.runQuery(internalRefs.communityPublicPage.loadCommunityPublicPageSourcesInternal, { communityId: args.communityId });
    if (!sources) return await record({ error: "community_unavailable" });
    if (!sources.one_liner && !sources.about) return await record({ error: "nothing_to_draft_from" });
    const funding = await resolveCommunityInferenceFundingForAction(ctx, args.communityId);
    if (!funding.ok) return await record({ error: `funding_unavailable:${funding.code}` });
    let run;
    try {
      run = await startFundedInferenceRun({
        ctx, communityId: args.communityId, actorUserId: args.requestedByUserId, surface: "community_setup_generation",
        receiptKey: `community_public_page_draft:${String(args.communityId)}:${args.requestedAt}`,
        sourceRunId: `community-public-page-draft:${String(args.communityId)}:${args.requestedAt}`, admission: funding,
      });
    } catch (error) {
      return await record({ error: error instanceof Error ? error.message.slice(0, 120) : "funding_claim_failed" });
    }
    try {
      const response = await run.request({
        messages: [
          { role: "system", content: COMMUNITY_PUBLIC_PAGE_DRAFT_PROMPT },
          { role: "user", content: JSON.stringify(sources) },
        ],
        maxTokens: DRAFT_MAX_OUTPUT_TOKENS,
        tools: [],
      });
      if (!response.ok || response.type !== "assistant") {
        await run.fail(response.ok ? "invalid_model_output" : response.code);
        return await record({ error: response.ok ? "invalid_model_output" : response.code });
      }
      await run.settle("provider_completed");
      const draft = parseCommunityPublicPageDraft(response.assistantText);
      await record(draft ? { draft } : { error: "empty_draft" });
    } catch (error) {
      await run.fail(error instanceof Error ? error.message.slice(0, 120) : "public_page_draft_failed").catch(() => {});
      await record({ error: error instanceof Error ? error.message.slice(0, 120) : "public_page_draft_failed" });
    }
  },
});

const draftValidator = v.object({
  for_you: v.array(v.string()),
  not_for: v.array(v.string()),
  first_steps: v.array(v.object({ title: v.string(), text: v.string() })),
  objections: v.array(v.object({ question: v.string(), answer: v.string() })),
});
export const recordCommunityPublicPageDraftInternal = internalMutation({
  args: { communityId: v.id("communities"), requestedAt: v.number(), draft: v.optional(draftValidator), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
    // A newer request owns the draft now.
    if (!row || row.draftRequestedAt !== args.requestedAt) return;
    await ctx.db.patch(row._id, args.draft
      ? { draftStatus: "ready", draftError: undefined, draft: {
        forYou: args.draft.for_you, notFor: args.draft.not_for, firstSteps: args.draft.first_steps, objections: args.draft.objections,
      } }
      : { draftStatus: "failed", draftError: (args.error ?? "draft_failed").slice(0, 120), draft: undefined });
  },
});

const lineList = v.array(v.string());
export const saveMyCommunityPublicPage = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // The revision the owner edited; a different one now means someone saved meanwhile.
    expectedRevision: v.number(),
    page: v.object({
      for_you: lineList,
      not_for: lineList,
      first_steps: v.array(v.object({ title: v.string(), text: v.string() })),
      results: v.array(v.object({ quote: v.string(), name: v.string(), role: v.string() })),
      founder_bio: v.string(),
      video_url: v.string(),
      guarantee: v.string(),
      objections: v.array(v.object({ question: v.string(), answer: v.string() })),
    }),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const normalized = normalizeCommunityPublicPage(args.page);
    if (!normalized.ok) throw new Error(`community_public_page_${normalized.error}`);
    const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q) => q.eq("communityId", community._id)).first();
    const current = row?.revision ?? 0;
    if (args.expectedRevision !== current) throw new Error("community_public_page_changed");
    const page = normalized.page;
    const nowMs = Date.now();
    const fields = {
      forYou: page.for_you, notFor: page.not_for, firstSteps: page.first_steps, results: page.results,
      founderBio: page.founder_bio, video: page.video ?? undefined, guarantee: page.guarantee, objections: page.objections,
      revision: current + 1, updatedByUserId: userId, updatedAt: nowMs,
    };
    // Saving keeps any AI draft that's on its way; only the page changes.
    if (row) await ctx.db.patch(row._id, { ...fields, video: page.video ?? undefined });
    else await ctx.db.insert("communityPublicPages", { ...fields, communityId: community._id, createdAt: nowMs });
    return { page, revision: current + 1 };
  },
});
