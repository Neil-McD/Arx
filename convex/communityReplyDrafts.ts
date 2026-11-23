// The guide drafts a reply to a question nobody answered
// (shared/communityReplyDrafts.ts; docs/specs/agent-access-v0.md, "The
// guide's own work"). It is one kind of the guide's work with nobody present
// (convex/agentWork.ts runs it): a person's post in an open channel makes the
// community's row due a day later; the run takes the oldest question that
// has waited a day with no reply, picks the lessons that share its words,
// and in one model request the guide answers with one reply.draft: the reply
// and the lesson it rests on, or that no lesson answers it. With no lesson
// to read, no request is made. At most three drafts in 24 hours.
//
// A draft is only a proposal. It waits on the host's Home ("Your guide
// suggests"); the host posts it (as written or edited), which puts it in the
// thread as the guide, or skips it. A question gets one draft, ever.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { runAgentWork } from "./agentWork";
import { communityAgentIsOn } from "./communityApps";
import { communityResourceIsLiveModulePage, communityResourceModuleIsLive, normalizeIdValue } from "./communityCore";
import { displayName } from "./communityFounderBrief";
import { openRun, scheduleAgentWork } from "./communityMemory";
import { communityScopeKey, insertWork, workFor } from "./communityNotesStore";
import { hydrateCommunityResourceBody } from "./communityResourceContent";
import { communityIsActive } from "../shared/communityLifecycle";
import { renderCommunityHandbook } from "../shared/communityHandbook";
import {
  REPLY_DRAFT_EDIT_MAX_CHARS,
  REPLY_DRAFT_INSTRUCTIONS,
  REPLY_DRAFT_LESSON_CHARS,
  REPLY_DRAFT_MAX_AGE_MS,
  REPLY_DRAFT_OPERATION,
  REPLY_DRAFT_WAIT_MS,
  REPLY_DRAFTS_PER_DAY,
  parseReplyDraftCall,
  pickLessonsFor,
  replyDraftPost,
  type ReplyDraftView,
} from "../shared/communityReplyDrafts";

const internalRefs = internal as any;
const DAY_MS = 24 * 60 * 60_000;
const CHANNELS_MAX = 50;
// Posts read per channel, oldest first, in each of the two age bands (a day
// to a week old; under a day), so a busy day's newer posts can't hide an
// older question.
const PER_CHANNEL_SCAN = 200;
const COURSES_MAX = 30;
const LESSONS_PER_COURSE = 60;
const CHANNEL_SCAN_CONCURRENCY = 10;
const LOOKUP_CONCURRENCY = 25;
const MAX_OUTPUT_TOKENS = 700;
const MAX_TOOL_STEPS = 2;

const asksSomething = (row: any) => row.kind === "question" || String(row.title ?? row.contentSummary ?? "").includes("?");
const questionText = (row: any) => (row.title ? `${row.title}. ${row.contentSummary ?? ""}` : String(row.contentSummary ?? "")).replace(/\s+/g, " ").trim();
const stillWaiting = (row: any) => Boolean(row) && row.status === "live" && row.actorType === "human" && Number(row.replyCount ?? 0) === 0;

// A person's post in an open channel: the community's row is due a day on
// (when a question in it could first be the guide's to draft for).
export async function markReplyDraftDue(ctx: any, args: { communityId: any; channelId: any; actorType: string; nowMs: number }) {
  if (args.actorType !== "human" || !args.channelId) return;
  const channel = await ctx.db.get(args.channelId);
  if (!channel || channel.status !== "active" || channel.accessMode !== "all_members" || String(channel.communityId) !== String(args.communityId)) return;
  const scope = communityScopeKey(args.communityId);
  const work = await workFor(ctx, scope, "reply_draft");
  if (work?.dueAt && work.pending > 0) {
    const leased = typeof work.leaseUntil === "number" && work.leaseUntil > args.nowMs;
    if (leased && !work.dirtyWhileLeased) {
      await ctx.db.patch(work._id, { pending: work.pending + 1, dirtyWhileLeased: true, updatedAt: args.nowMs });
    }
    return;
  }
  const dueAt = args.nowMs + REPLY_DRAFT_WAIT_MS;
  if (work) {
    await ctx.db.patch(work._id, { pending: work.pending + 1, firstPendingAt: args.nowMs, dueAt, failures: 0, updatedAt: args.nowMs });
    await scheduleAgentWork(ctx, work._id, dueAt);
  } else {
    const workId = await insertWork(ctx, scope, {
      communityId: args.communityId, kind: "reply_draft", pending: 1, firstPendingAt: args.nowMs,
      reviewedThrough: 0, dueAt, failures: 0, createdAt: args.nowMs, updatedAt: args.nowMs,
    });
    await scheduleAgentWork(ctx, workId, dueAt);
  }
}

// What one run works from: the oldest question that has waited a day (and
// not a week) with no reply and no draft yet, and the lessons members can
// read that share its words. Also when to look again: when the next
// question reaches a day, or when today's allowance frees up.
export const readReplyDraftInputInternal = internalQuery({
  args: { communityId: v.id("communities"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const none = { question: null as null | { rootId: string; channelId: string; author: string; channel: string; text: string },
      lessons: [] as Array<{ ref: string; resourceId: string; label: string; title: string; text: string }>, more: false, nextDueAt: null as number | null };
    const community: any = await ctx.db.get(args.communityId);
    if (!community) return none;
    const channels: any[] = await ctx.db.query("communityChannels")
      .withIndex("by_community_access_status_position", (q: any) => q.eq("communityId", args.communityId).eq("accessMode", "all_members").eq("status", "active"))
      .take(CHANNELS_MAX);
    const names = new Map<string, string>(channels.map((channel) => [String(channel._id), String(channel.name ?? "a channel")]));
    const roots: any[] = [];
    const dayAgo = args.nowMs - REPLY_DRAFT_WAIT_MS;
    for (let start = 0; start < channels.length; start += CHANNEL_SCAN_CONCURRENCY) {
      const chunk = channels.slice(start, start + CHANNEL_SCAN_CONCURRENCY);
      const batch = await Promise.all(
        chunk.flatMap((channel) =>
          (["community", "public"] as const).flatMap((visibility) => {
            const band = (fromMs: number, toMs: number) => ctx.db.query("communityInteractionRoots")
              .withIndex("by_community_channel_visibility_status_createdAt", (q: any) => q
                .eq("communityId", args.communityId).eq("channelId", channel._id).eq("visibilityScope", visibility).eq("status", "live")
                .gte("createdAt", fromMs).lt("createdAt", toMs)).order("asc").take(PER_CHANNEL_SCAN);
            return [band(args.nowMs - REPLY_DRAFT_MAX_AGE_MS, dayAgo + 1), band(dayAgo + 1, args.nowMs + 1)];
          }),
        ),
      );
      for (const found of batch) roots.push(...found);
    }
    const candidates = roots
      .filter((row) => stillWaiting(row) && row.actorUserId && asksSomething(row))
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    const open: any[] = [];
    for (let start = 0; start < candidates.length; start += LOOKUP_CONCURRENCY) {
      const chunk = candidates.slice(start, start + LOOKUP_CONCURRENCY);
      const draftedRows = await Promise.all(
        chunk.map((root) =>
          ctx.db.query("communityReplyDrafts").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).first(),
        ),
      );
      chunk.forEach((root, idx) => {
        if (!draftedRows[idx]) open.push(root);
      });
    }
    const ready = open.filter((root) => args.nowMs - Number(root.createdAt) >= REPLY_DRAFT_WAIT_MS);
    const notYet = open.filter((root) => args.nowMs - Number(root.createdAt) < REPLY_DRAFT_WAIT_MS);
    const nextReady = notYet.length ? Number(notYet[0].createdAt) + REPLY_DRAFT_WAIT_MS : null;

    // Today's allowance: drafts written in the last 24 hours.
    // Read by status, so any number of questions no lesson could answer
    // never crowds the real drafts out of the count.
    const today = (
      await Promise.all(
        (["waiting", "posted", "skipped"] as const).map((status) =>
          ctx.db.query("communityReplyDrafts").withIndex("by_community_status_createdAt", (q: any) => q
            .eq("communityId", args.communityId).eq("status", status).gte("createdAt", args.nowMs - DAY_MS)).take(REPLY_DRAFTS_PER_DAY),
        ),
      )
    ).flat();
    if (ready.length && today.length >= REPLY_DRAFTS_PER_DAY) {
      const frees = Math.min(...today.map((row: any) => Number(row.createdAt))) + DAY_MS;
      return { ...none, nextDueAt: frees };
    }
    if (!ready.length) return { ...none, nextDueAt: nextReady };

    const root = ready[0];
    const question = questionText(root);
    // Every lesson of a course members can see, with its text.
    const modules = ((await ctx.db.query("communityResourceModules")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(COURSES_MAX * 2)) as any[])
      .filter((module) => communityResourceModuleIsLive(module)).slice(0, COURSES_MAX);
    const orderedPages: Array<{ moduleName: string; index: number; page: any }> = [];
    for (let start = 0; start < modules.length; start += CHANNEL_SCAN_CONCURRENCY) {
      const chunk = modules.slice(start, start + CHANNEL_SCAN_CONCURRENCY);
      const resourcesByModule = await Promise.all(
        chunk.map((module) =>
          ctx.db.query("communityResources")
            .withIndex("by_community_module", (q: any) => q.eq("communityId", args.communityId).eq("moduleId", module._id))
            .take(LESSONS_PER_COURSE * 2),
        ),
      );
      chunk.forEach((module, idx) => {
        const live = new Set([normalizeIdValue(module._id)]);
        const pages = (resourcesByModule[idx] as any[])
          .filter((row) => communityResourceIsLiveModulePage(row, live))
          .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt)
          .slice(0, LESSONS_PER_COURSE);
        pages.forEach((page, index) => {
          orderedPages.push({ moduleName: String(module.name ?? "a course"), index, page });
        });
      });
    }
    const all: Array<{ ref: string; resourceId: string; label: string; title: string; text: string }> = [];
    for (let start = 0; start < orderedPages.length; start += LOOKUP_CONCURRENCY) {
      const chunk = orderedPages.slice(start, start + LOOKUP_CONCURRENCY);
      const hydrated = await Promise.all(chunk.map((entry) => hydrateCommunityResourceBody(ctx, entry.page)));
      chunk.forEach(({ moduleName, index, page }, idx) => {
        const body = String(hydrated[idx]?.bodyMd ?? "").replace(/\s+/g, " ").trim();
        if (!body) return;
        const title = String(page.title ?? "").trim() || `Lesson ${index + 1}`;
        all.push({
          ref: `lesson:${String(page._id)}`, resourceId: String(page._id),
          label: `${moduleName} · Lesson ${index + 1}: ${title}`, title,
          text: body.length > REPLY_DRAFT_LESSON_CHARS ? `${body.slice(0, REPLY_DRAFT_LESSON_CHARS - 1)}…` : body,
        });
      });
    }
    return {
      question: {
        rootId: String(root._id), channelId: String(root.channelId), author: await displayName(ctx, root.actorUserId, new Map()),
        channel: names.get(String(root.channelId)) ?? "a channel", text: question.slice(0, 1_200),
      },
      lessons: pickLessonsFor(question, all),
      more: ready.length > 1,
      nextDueAt: nextReady,
    };
  },
});

// The run's one write, or the record that no lesson could answer a question
// (so it is not looked at again). Checked when it happens: the question is
// still waiting, and has no draft.
export const saveReplyDraftInternal = internalMutation({
  args: { communityId: v.id("communities"), runId: v.optional(v.id("agentWorkRuns")), rootId: v.string(),
    text: v.optional(v.string()), sourceResourceId: v.optional(v.string()), sourceLabel: v.optional(v.string()), nowMs: v.number() },
  handler: async (ctx, args) => {
    if (args.runId) {
      const run: any = await openRun(ctx, args.communityId, args.runId);
      if (!run || run.kind !== "reply_draft") return { ok: false as const, code: "run_closed" };
    }
    const rootId = ctx.db.normalizeId("communityInteractionRoots", args.rootId);
    const root: any = rootId ? await ctx.db.get(rootId) : null;
    if (!root || String(root.communityId) !== String(args.communityId)) return { ok: false as const, code: "question_gone" };
    if (await ctx.db.query("communityReplyDrafts").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).first()) {
      return { ok: false as const, code: "already_drafted" };
    }
    const sourceResourceId = args.sourceResourceId ? ctx.db.normalizeId("communityResources", args.sourceResourceId) : null;
    const drafted = Boolean(args.text && sourceResourceId && stillWaiting(root));
    await ctx.db.insert("communityReplyDrafts", {
      communityId: args.communityId, rootId: root._id, channelId: root.channelId,
      status: drafted ? "waiting" : "no_source",
      ...(drafted ? { text: args.text, sourceResourceId: sourceResourceId!, sourceLabel: args.sourceLabel ?? "" } : {}),
      ...(args.runId ? { runId: args.runId } : {}),
      createdAt: args.nowMs, updatedAt: args.nowMs,
    });
    if (args.runId) await ctx.db.patch(args.runId, { changed: [drafted ? "reply draft" : "no draft"] });
    return { ok: true as const, drafted };
  },
});

export const runReplyDraftInternal = internalAction({
  args: { workId: v.id("agentWork") },
  handler: async (ctx, args) => await runAgentWork(ctx, {
    workId: args.workId,
    kind: "reply_draft",
    names: { receipt: "community_reply_draft", source: "community-reply-draft", events: "community-reply-draft", cache: "reply-draft" },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxToolSteps: MAX_TOOL_STEPS,
    mustWrite: "reply_draft_not_written",
    done: "drafted",
    prepare: async (claim, runId) => {
      const nowMs = Date.now();
      const input = await ctx.runQuery(internalRefs.communityReplyDrafts.readReplyDraftInputInternal, { communityId: claim.communityId, nowMs });
      const again = { backlog: input.more, ...(input.more || !input.nextDueAt ? {} : { nextDueAt: input.nextDueAt }) };
      const nothing = { empty: true, messages: [], write: async () => ({ ok: false as const, code: "nothing_to_draft", message: "Nothing to draft." }), ...again };
      if (!input.question) return nothing;
      if (input.lessons.length === 0) {
        // No lesson shares a word with the question: nothing to draft from, and nothing is spent.
        await ctx.runMutation(internalRefs.communityReplyDrafts.saveReplyDraftInternal, { communityId: claim.communityId, rootId: input.question.rootId, nowMs });
        return nothing;
      }
      const handbook = await ctx.runQuery(internalRefs.communityHandbook.readApprovedCommunityHandbookInternal, { communityId: claim.communityId }).catch(() => null);
      const system = [REPLY_DRAFT_INSTRUCTIONS, `This community: ${claim.communityName}.`, ...(handbook ? [renderCommunityHandbook(handbook)] : [])].join("\n\n");
      const user = [
        `## The question (${input.question.author}, in #${input.question.channel})`,
        input.question.text,
        "## Lessons that might answer it",
        ...input.lessons.map((lesson: any) => `### ${lesson.ref} · ${lesson.label}\n${lesson.text}`),
      ].join("\n\n");
      const byRef = new Map<string, any>(input.lessons.map((lesson: any) => [lesson.ref, lesson]));
      return {
        empty: false,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...again,
        write: async (rawArguments) => {
          const draft = parseReplyDraftCall(rawArguments, new Set(byRef.keys()));
          if ("error" in draft) {
            return { ok: false, code: draft.error,
              message: `${draft.why} Write with polynet_call { operation: "${REPLY_DRAFT_OPERATION}", input: { text, source } } or { nothing: true }.` };
          }
          const source = "nothing" in draft ? null : byRef.get(draft.source);
          const saved = await ctx.runMutation(internalRefs.communityReplyDrafts.saveReplyDraftInternal, {
            communityId: claim.communityId, runId, rootId: input.question!.rootId, nowMs: Date.now(),
            ...("nothing" in draft ? {} : { text: draft.text, sourceResourceId: source.resourceId, sourceLabel: source.label }),
          });
          // The question was answered or drafted meanwhile: nothing left to do.
          if (!saved?.ok) return saved?.code === "run_closed"
            ? { ok: false, code: "run_closed", message: "This run is no longer open." }
            : { ok: true, output: { written: "nothing" }, ended: "The question no longer needs a draft." };
          return { ok: true, output: { written: saved.drafted ? "draft" : "nothing" },
            ended: "nothing" in draft || !saved.drafted ? "No lesson answers it." : draft.text };
        },
      };
    },
  }),
});

// ---------- the host's Home

async function requireOwner(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const community: any = await ctx.db.get(communityId);
  if (!community || String(community.ownerId) !== String(userId)) throw new Error("community_reply_drafts_owner_required");
  return { userId, community };
}

// A draft the host can still act on: its question is live, still unanswered,
// and under a week old, and the lesson it rests on is still one members can
// read (a course taken back to draft, or a deleted lesson, withdraws it).
async function waitingDraft(ctx: any, draft: any, nowMs: number) {
  if (!draft || draft.status !== "waiting") return null;
  const lesson: any = draft.sourceResourceId ? await ctx.db.get(draft.sourceResourceId) : null;
  const course: any = lesson?.moduleId ? await ctx.db.get(lesson.moduleId) : null;
  if (!lesson || !course || !communityResourceModuleIsLive(course)
    || !communityResourceIsLiveModulePage(lesson, new Set([normalizeIdValue(course._id)]))) return null;
  const root: any = await ctx.db.get(draft.rootId);
  if (!stillWaiting(root) || nowMs - Number(root.createdAt) > REPLY_DRAFT_MAX_AGE_MS) return null;
  const channel: any = root.channelId ? await ctx.db.get(root.channelId) : null;
  if (!channel || channel.status !== "active" || channel.accessMode !== "all_members") return null;
  return { root, channel };
}

// "Your guide suggests": the drafts waiting on this host, oldest question first.
export const listReplyDrafts = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<ReplyDraftView[]> => {
    const { community } = await requireOwner(ctx, args.authSubject, args.communityId);
    if (!communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) return [];
    const nowMs = Date.now();
    const rows = await ctx.db.query("communityReplyDrafts")
      .withIndex("by_community_status_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("status", "waiting")).order("desc").take(20);
    const names = new Map<string, string>();
    const checked = await Promise.all(
      (rows as any[]).map(async (draft) => ({ draft, live: await waitingDraft(ctx, draft, nowMs) })),
    );
    const liveDrafts = checked.filter((entry): entry is { draft: any; live: NonNullable<Awaited<ReturnType<typeof waitingDraft>>> } => Boolean(entry.live));
    const uniqueAuthorIds = Array.from(
      new Map(liveDrafts.map(({ live }) => [String(live.root.actorUserId), live.root.actorUserId])).values(),
    );
    await Promise.all(uniqueAuthorIds.map((userId) => displayName(ctx, userId, names)));
    const views: Array<ReplyDraftView & { askedAt: number }> = [];
    for (const { draft, live } of liveDrafts) {
      views.push({
        id: String(draft._id), author: await displayName(ctx, live.root.actorUserId, names), question: questionText(live.root).slice(0, 400),
        channel: String(live.channel.name ?? "a channel"), hours_waiting: Math.floor((nowMs - Number(live.root.createdAt)) / 3_600_000),
        text: String(draft.text ?? ""), source: String(draft.sourceLabel ?? ""), askedAt: Number(live.root.createdAt),
      });
    }
    return views.sort((a, b) => a.askedAt - b.askedAt).map(({ askedAt: _askedAt, ...view }) => view);
  },
});

// The host posts a draft, as written or with their own words: it goes into
// the thread as the guide, with the lesson it came from.
export const postReplyDraft = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), draftId: v.id("communityReplyDrafts"), text: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId, community } = await requireOwner(ctx, args.authSubject, args.communityId);
    if (!communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) throw new Error("community_reply_draft_guide_off");
    const draft: any = await ctx.db.get(args.draftId);
    if (!draft || String(draft.communityId) !== String(args.communityId)) throw new Error("community_reply_draft_not_found");
    if (draft.status === "posted") return { posted: true, already: true };
    const nowMs = Date.now();
    if (!(await waitingDraft(ctx, draft, nowMs))) throw new Error("community_reply_draft_no_longer_needed");
    const text = (args.text ?? String(draft.text ?? "")).replace(/\r\n/g, "\n").trim();
    if (!text) throw new Error("community_reply_draft_empty");
    if (text.length > REPLY_DRAFT_EDIT_MAX_CHARS) throw new Error("community_reply_draft_too_long");
    const posted = replyDraftPost(text, String(draft.sourceLabel ?? ""));
    await ctx.runMutation(internalRefs.communityInteractions.createCommunityAgentCanonicalInteractionInternal, {
      userId, communityId: args.communityId, rootId: draft.rootId, idempotencyKey: `reply-draft:${String(draft._id)}`, text: posted,
    });
    await ctx.db.patch(draft._id, { status: "posted", postedText: posted, decidedByUserId: userId, decidedAt: nowMs, updatedAt: nowMs });
    return { posted: true, already: false };
  },
});

// Skip: the draft is dropped, and that question is not drafted for again.
export const skipReplyDraft = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), draftId: v.id("communityReplyDrafts") },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx, args.authSubject, args.communityId);
    const draft: any = await ctx.db.get(args.draftId);
    if (!draft || String(draft.communityId) !== String(args.communityId)) throw new Error("community_reply_draft_not_found");
    const nowMs = Date.now();
    if (draft.status === "waiting") await ctx.db.patch(draft._id, { status: "skipped", decidedByUserId: userId, decidedAt: nowMs, updatedAt: nowMs });
    return { skipped: true };
  },
});

// Operator tool: look for a question to draft for now (staging acceptance), by hand.
export const requestReplyDraftNowInternal = internalMutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const scope = communityScopeKey(args.communityId);
    const work = await workFor(ctx, scope, "reply_draft");
    let workId = work?._id;
    if (work) {
      await ctx.db.patch(work._id, { pending: Math.max(1, work.pending), dueAt: nowMs, leaseUntil: undefined, failures: 0, updatedAt: nowMs });
    } else {
      workId = await insertWork(ctx, scope, {
        communityId: args.communityId, kind: "reply_draft", pending: 1, firstPendingAt: nowMs,
        reviewedThrough: 0, dueAt: nowMs, failures: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    await ctx.scheduler.runAt(nowMs, internalRefs.communityReplyDrafts.runReplyDraftInternal, { workId });
    return { workId };
  },
});
