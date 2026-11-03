import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityManager } from "./communityCore";
import { listSharedCommunityChannels } from "./communityChannelCore";
import { SHARED_SEARCH_ACCESS_KEY } from "./communitySearchDocs";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { communityIsActive } from "../shared/communityLifecycle";
import { communityResourceIsMemberVisiblePage, communityResourceModuleIsMemberLive } from "../shared/communityResourceVisibility";
import { buildCommunitySearchQuery } from "../shared/communitySearchText";
import {
  COMMUNITY_HANDBOOK_DRAFT_PROMPT,
  composeCommunityHandbookDraft,
  normalizeCommunityHandbookText,
  type CommunityHandbookSource,
} from "../shared/communityHandbook";

// The founder-approved handbook (schema: communityHandbooks). Owners and admins
// read, edit, draft and approve it; members and the agent only ever see the
// approved text (readApprovedCommunityHandbookInternal).

const internalRefs = internal as any;
// A drafting request older than this is treated as stuck and may be retried.
const DRAFT_LEASE_MS = 5 * 60_000;
const DRAFT_MAX_OUTPUT_TOKENS = 2_500;
const SOURCE_TEXT_CHARS = 400;
const SOURCES_TOTAL_CHARS = 24_000;
// Words that tend to find who runs what, rhythms, where to start, what to bring and norms.
const DRAFT_SEARCHES = ["runs leads organizes", "every weekly session", "start new welcome", "bring gear shoes chalk", "rules please norms", "means called"];

async function managerHandbook(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const row = await ctx.db.query("communityHandbooks").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).first();
  return { userId, row };
}

async function upsertHandbook(ctx: any, communityId: any, row: any, patch: Record<string, unknown>) {
  const nowMs = Date.now();
  if (row) {
    await ctx.db.patch(row._id, { ...patch, updatedAt: nowMs });
    return;
  }
  await ctx.db.insert("communityHandbooks", { communityId, draftStatus: "idle", createdAt: nowMs, updatedAt: nowMs, ...patch });
}

function managerView(row: any) {
  return {
    approved_md: row?.approvedMd ?? null,
    approved_at: row?.approvedAt ?? null,
    draft_md: row?.draftMd ?? null,
    draft_updated_at: row?.draftUpdatedAt ?? null,
    draft_status: row?.draftStatus ?? "idle",
    draft_error: row?.draftError ?? null,
  };
}

const managerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

export const getCommunityHandbookForManager = query({
  args: managerArgs,
  handler: async (ctx, args) => managerView((await managerHandbook(ctx, args)).row),
});

// The founder's edits, kept as the draft until approved.
export const saveCommunityHandbookDraft = mutation({
  args: { ...managerArgs, text: v.string() },
  handler: async (ctx, args) => {
    const { row } = await managerHandbook(ctx, args);
    await upsertHandbook(ctx, args.communityId, row, { draftMd: normalizeCommunityHandbookText(args.text), draftUpdatedAt: Date.now() });
    return managerView(await ctx.db.query("communityHandbooks").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first());
  },
});

// Approval publishes exactly this text to members and the agent. Empty text
// withdraws the handbook.
export const approveCommunityHandbook = mutation({
  args: { ...managerArgs, text: v.string() },
  handler: async (ctx, args) => {
    const { userId, row } = await managerHandbook(ctx, args);
    const text = normalizeCommunityHandbookText(args.text);
    const nowMs = Date.now();
    await upsertHandbook(ctx, args.communityId, row, text
      ? { approvedMd: text, approvedAt: nowMs, approvedByUserId: userId, draftMd: text, draftUpdatedAt: nowMs }
      : { approvedMd: undefined, approvedAt: undefined, approvedByUserId: undefined });
    return managerView(await ctx.db.query("communityHandbooks").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first());
  },
});

// The founder asks the agent for a draft. It replaces the current draft, never
// the approved text. One at a time per community.
export const requestCommunityHandbookDraft = mutation({
  args: managerArgs,
  handler: async (ctx, args) => {
    const { userId, row } = await managerHandbook(ctx, args);
    const nowMs = Date.now();
    if (row?.draftStatus === "drafting" && nowMs - (row.draftRequestedAt ?? 0) < DRAFT_LEASE_MS) return managerView(row);
    await upsertHandbook(ctx, args.communityId, row, { draftStatus: "drafting", draftRequestedAt: nowMs, draftError: undefined });
    await ctx.scheduler.runAfter(0, internalRefs.communityHandbook.draftCommunityHandbookInternal, {
      communityId: args.communityId, requestedByUserId: userId, requestedAt: nowMs,
    });
    return managerView(await ctx.db.query("communityHandbooks").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first());
  },
});

export const recordCommunityHandbookDraftInternal = internalMutation({
  args: { communityId: v.id("communities"), requestedAt: v.number(), draftMd: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("communityHandbooks").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
    // A newer request owns the draft now.
    if (!row || row.draftRequestedAt !== args.requestedAt) return;
    await ctx.db.patch(row._id, args.draftMd
      ? { draftMd: args.draftMd, draftUpdatedAt: Date.now(), draftStatus: "idle", draftError: undefined, updatedAt: Date.now() }
      : { draftStatus: "failed", draftError: (args.error ?? "draft_failed").slice(0, 120), updatedAt: Date.now() });
  },
});

function clip(value: unknown, max = SOURCE_TEXT_CHARS): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// What the draft may draw on, each with an id the draft cites. Only what any
// member can read: shared rooms, member-visible lessons and events, accepted
// memory. Never private rooms or anyone's private context.
export const loadCommunityHandbookSourcesInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community as any)) return null;
    const sources: CommunityHandbookSource[] = [];
    let total = 0;
    const add = (label: string, text: string) => {
      const body = clip(text);
      if (!body || total + body.length > SOURCES_TOTAL_CHARS) return;
      total += body.length;
      sources.push({ id: `s${sources.length + 1}`, label, text: body });
    };
    const names = new Map<string, string>();
    const nameOf = async (userId: any) => {
      const key = String(userId ?? "");
      if (!key) return "the community agent";
      if (!names.has(key)) {
        const user: any = await ctx.db.get(userId);
        const detail: any = await ctx.db.query("userProfileDetails").withIndex("by_user", (q) => q.eq("userId", userId)).first();
        names.set(key, String(detail?.displayName ?? user?.displayName ?? user?.handle ?? "a member").trim());
      }
      return names.get(key)!;
    };

    add("Community about text", [community.oneLiner, community.about].filter(Boolean).join("\n"));
    const channels = await listSharedCommunityChannels({ ctx, communityId: args.communityId });
    const channelNames = new Map(channels.filter((channel) => channel._id).map((channel) => [String(channel._id), channel.name]));
    add("Channel list", channels.map((channel) => `#${channel.name}`).join(", "));

    const recurring = [];
    for (const frequency of ["daily", "weekly", "monthly"] as const) {
      recurring.push(...await ctx.db.query("communityEvents")
        .withIndex("by_community_status_recurrenceFrequency_startsAt", (q) => q.eq("communityId", args.communityId).eq("status", "live").eq("recurrenceFrequency", frequency))
        .take(5));
    }
    const upcoming = await ctx.db.query("communityEvents")
      .withIndex("by_community_status_startsAt", (q) => q.eq("communityId", args.communityId).eq("status", "live").gte("startsAt", Date.now()))
      .take(5);
    const seenEvents = new Set<string>();
    for (const event of [...recurring, ...upcoming]) {
      if (seenEvents.has(String(event._id))) continue;
      seenEvents.add(String(event._id));
      const repeats = event.recurrenceFrequency && event.recurrenceFrequency !== "none" ? `, repeats ${event.recurrenceFrequency}` : "";
      add(`Event: ${clip(event.title, 80)}${repeats}`,
        `${event.title}. Starts ${new Date(event.startsAt).toISOString()} (${event.timezone ?? "UTC"})${repeats}. ${event.locationLabel ?? ""} ${event.descriptionMd ?? ""}`);
    }

    const modules = await ctx.db.query("communityResourceModules").withIndex("by_community_sortOrder", (q) => q.eq("communityId", args.communityId)).take(50);
    for (const module of modules.filter((row: any) => communityResourceModuleIsMemberLive(row)).slice(0, 6)) {
      const live = new Set([String(module._id)]);
      const pages = (await ctx.db.query("communityResources").withIndex("by_community_module", (q) => q.eq("communityId", args.communityId).eq("moduleId", module._id)).take(40))
        .filter((row: any) => communityResourceIsMemberVisiblePage(row, live)).slice(0, 4);
      for (const page of pages) add(`Lesson: ${clip(module.name, 60)} › ${clip(page.title, 80)}`, `${page.title}. ${page.bodyMd ?? ""}`);
    }

    for (const status of ["canonical", "validated"] as const) {
      const notes = await ctx.db.query("communityIntelligenceNodes").withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", status)).take(12);
      for (const note of notes.filter((row: any) => row.visibilityScope === "community" || row.visibilityScope === "public")) {
        add(`Community memory: ${clip(note.title, 80)}`, `${note.title}. ${note.bodyMd}`);
      }
    }

    // Posts: the founder's own, then the words that tend to answer handbook questions.
    const seenPosts = new Set<string>();
    const addPost = async (root: any) => {
      if (!root || seenPosts.has(String(root._id)) || root.status !== "live" || !["community", "public"].includes(root.visibilityScope)) return;
      const channelName = root.channelId ? channelNames.get(String(root.channelId)) : "General";
      if (!channelName) return;
      seenPosts.add(String(root._id));
      add(`Post by ${await nameOf(root.actorUserId)} in #${channelName}, ${day(root.createdAt)}`, `${root.title ?? ""} ${root.contentSummary ?? ""}`);
    };
    const founderPosts = await ctx.db.query("communityInteractionRoots")
      .withIndex("by_community_actorUser_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("actorUserId", community.ownerId))
      .order("desc").take(15);
    for (const root of founderPosts) await addPost(root);
    for (const words of DRAFT_SEARCHES) {
      const hits = await ctx.db.query("communitySearchDocs").withSearchIndex("search_text", (q) =>
        q.search("searchText", buildCommunitySearchQuery(words)).eq("communityId", args.communityId).eq("accessKey", SHARED_SEARCH_ACCESS_KEY).eq("kind", "post")).take(5);
      for (const hit of hits) await addPost(await ctx.db.get(hit.rootId));
    }
    return { communityName: String(community.name ?? "Community"), sources };
  },
});

// Writes a draft from the sources with the founder-funded model. Failure leaves
// the approved handbook untouched and marks the draft failed with a reason.
export const draftCommunityHandbookInternal = internalAction({
  args: { communityId: v.id("communities"), requestedByUserId: v.id("users"), requestedAt: v.number() },
  handler: async (ctx, args) => {
    const fail = (error: string) => ctx.runMutation(internalRefs.communityHandbook.recordCommunityHandbookDraftInternal, {
      communityId: args.communityId, requestedAt: args.requestedAt, error,
    });
    const loaded = await ctx.runQuery(internalRefs.communityHandbook.loadCommunityHandbookSourcesInternal, { communityId: args.communityId }) as
      { communityName: string; sources: CommunityHandbookSource[] } | null;
    if (!loaded) return await fail("community_unavailable");
    const funding = await resolveCommunityInferenceFundingForAction(ctx, args.communityId);
    if (!funding.ok) return await fail(`funding_unavailable:${funding.code}`);
    let run;
    try {
      run = await startFundedInferenceRun({
        ctx, communityId: args.communityId, actorUserId: args.requestedByUserId, surface: "community_setup_generation",
        receiptKey: `community_handbook_draft:${String(args.communityId)}:${args.requestedAt}`,
        sourceRunId: `community-handbook-draft:${String(args.communityId)}:${args.requestedAt}`, admission: funding,
      });
    } catch (error) {
      return await fail(error instanceof Error ? error.message.slice(0, 120) : "funding_claim_failed");
    }
    try {
      const response = await run.request({
        messages: [
          { role: "system", content: COMMUNITY_HANDBOOK_DRAFT_PROMPT },
          { role: "user", content: JSON.stringify({ community: loaded.communityName, sources: loaded.sources }) },
        ],
        maxTokens: DRAFT_MAX_OUTPUT_TOKENS,
        tools: [],
      });
      if (!response.ok || response.type !== "assistant") {
        await run.fail(response.ok ? "invalid_model_output" : response.code);
        return await fail(response.ok ? "invalid_model_output" : response.code);
      }
      await run.settle("provider_completed");
      const draftMd = composeCommunityHandbookDraft(response.assistantText, loaded.sources);
      if (!draftMd) return await fail("empty_draft");
      await ctx.runMutation(internalRefs.communityHandbook.recordCommunityHandbookDraftInternal, {
        communityId: args.communityId, requestedAt: args.requestedAt, draftMd,
      });
    } catch (error) {
      await run.fail(error instanceof Error ? error.message.slice(0, 120) : "handbook_draft_failed").catch(() => {});
      await fail(error instanceof Error ? error.message.slice(0, 120) : "handbook_draft_failed");
    }
  },
});

// What members and the agent read: the approved text only.
export const readApprovedCommunityHandbookInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community as any)) return null;
    const row = await ctx.db.query("communityHandbooks").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
    if (!row?.approvedMd || !row.approvedAt) return null;
    return { communityName: String(community.name ?? "Community"), approvedMd: row.approvedMd, approvedAt: row.approvedAt };
  },
});
