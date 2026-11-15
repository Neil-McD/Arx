// Community memory (docs/specs/agent-system-slice-1.md, step 1): the guide's
// one write into the community's memory, and a builder's undo. The guide
// writes only from a review run; every note cites the open-channel posts it
// came from, and code checks each citation (shared/communityMemory.ts). A
// builder's note is never changed by the guide. Nothing here calls a model.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import {
  buildCommunityNoteSearchText,
  communityNoteSlug,
  COMMUNITY_NOTES_MAX_PER_COMMUNITY,
  normalizeCommunityNoteBody,
  normalizeCommunityNoteTitle,
} from "../shared/communityNotes";
import {
  MEMORY_NEW_NOTES_PER_RUN,
  MEMORY_REVIEW_POSTS_MAX,
  MEMORY_REVIEW_POST_CHARS,
  nextMemoryReviewAtMs,
  memoryEvidenceRefusal,
  memoryEvidenceWasRemoved,
  memoryIndexRefusal,
  noteAuthorKind,
  parseMemoryEvidenceRefs,
  type MemoryEvidenceFacts,
  type MemoryEvidenceRef,
} from "../shared/communityMemory";

const REMOVALS_SCAN = 500;
const RUNS_LIST_MAX = 30;

type Refused = { ok: false; code: string };
type Written = { ok: true; slug: string; title: string; change: "added" | "changed" };

async function evidenceFacts(ctx: any, communityId: any, ref: MemoryEvidenceRef): Promise<MemoryEvidenceFacts> {
  const none = { exists: false, communityMatches: false, live: false, byPerson: false, openChannel: false, sharedVisibility: false };
  const table = ref.kind === "post" ? "communityInteractionRoots" : "communityInteractionReplies";
  const id = ctx.db.normalizeId(table, ref.id);
  const row = id ? await ctx.db.get(id) : null;
  if (!row) return none;
  let live = row.status === "live";
  if (ref.kind === "reply") {
    const root = await ctx.db.get(row.rootId);
    live = live && root?.status === "live";
  }
  const channel = row.channelId ? await ctx.db.get(row.channelId) : null;
  return {
    exists: true,
    communityMatches: String(row.communityId) === String(communityId),
    live,
    byPerson: row.actorType === "human",
    openChannel: Boolean(channel && channel.accessMode === "all_members" && channel.status === "active"
      && String(channel.communityId) === String(communityId)),
    sharedVisibility: row.visibilityScope === "community" || row.visibilityScope === "public",
  };
}

async function openRun(ctx: any, communityId: any, runId: any) {
  const run = await ctx.db.get(runId);
  if (!run || String(run.communityId) !== String(communityId) || run.status !== "running") return null;
  return run;
}

async function refuse(ctx: any, run: any, title: string, code: string): Promise<Refused> {
  if (run) await ctx.db.patch(run._id, { refused: [...run.refused, { title: title.slice(0, 120) || "(untitled)", reason: code }].slice(-50) });
  return { ok: false, code };
}

// Starts a review: the community's work row (made once) and the run's record.
export const openMemoryReviewRunInternal = internalMutation({
  args: { communityId: v.id("communities"), windowStart: v.number(), windowEnd: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    let work = await ctx.db.query("agentWork")
      .withIndex("by_community_scope_kind", (q) => q.eq("communityId", args.communityId).eq("scope", "community").eq("kind", "memory_review"))
      .first();
    if (!work) {
      const workId = await ctx.db.insert("agentWork", {
        communityId: args.communityId, scope: "community", kind: "memory_review", pending: 0, reviewedThrough: args.windowStart,
        failures: 0, createdAt: args.nowMs, updatedAt: args.nowMs,
      });
      work = await ctx.db.get(workId);
    }
    const runId = await ctx.db.insert("agentWorkRuns", {
      communityId: args.communityId, workId: work!._id, kind: "memory_review", status: "running",
      windowStart: args.windowStart, windowEnd: args.windowEnd, added: [], changed: [], refused: [], createdAt: args.nowMs,
    });
    return { runId, workId: work!._id };
  },
});

// The guide's one write: add a note, or change one of its own. Refusals are
// returned (and kept on the run's record), never thrown, so the guide can
// correct the note and the record survives.
export const observeCommunityMemoryInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    runId: v.id("agentWorkRuns"),
    title: v.string(),
    body: v.string(),
    evidenceRefs: v.array(v.string()),
    supersedes: v.optional(v.string()),
    nowMs: v.number(),
  },
  handler: async (ctx, args): Promise<Written | Refused> => {
    const run = await openRun(ctx, args.communityId, args.runId);
    if (!run) return { ok: false, code: "run_not_open" };
    const title = normalizeCommunityNoteTitle(args.title);
    const body = normalizeCommunityNoteBody(args.body);
    if (!title || !body) return refuse(ctx, run, args.title, "title_or_body_missing");

    const parsed = parseMemoryEvidenceRefs(args.evidenceRefs);
    if ("error" in parsed) return refuse(ctx, run, title, parsed.error);
    for (const ref of parsed.refs) {
      const refusal = memoryEvidenceRefusal(await evidenceFacts(ctx, args.communityId, ref));
      if (refusal) return refuse(ctx, run, title, refusal);
    }
    const refs = parsed.refs.map((ref) => ref.raw);
    const removals = await ctx.db.query("communityNoteRemovals")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId)).order("desc").take(REMOVALS_SCAN);
    if (memoryEvidenceWasRemoved(refs, removals)) return refuse(ctx, run, title, "evidence_removed");

    if (args.supersedes) {
      const note = await ctx.db.query("communityNotes")
        .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.supersedes!)).first();
      if (!note) return refuse(ctx, run, title, "note_missing");
      if (noteAuthorKind(note) !== "guide") return refuse(ctx, run, title, "builder_note");
      await ctx.db.insert("communityNoteRevisions", {
        communityId: args.communityId, slug: note.slug, change: "changed", runId: run._id, createdAt: args.nowMs,
        ...(note.lastRunId ? { previousRunId: note.lastRunId } : {}),
        before: { title: note.title, bodyMd: note.bodyMd, source: note.source, authorKind: "guide", evidenceRefs: note.evidenceRefs ?? [] },
      });
      await ctx.db.patch(note._id, {
        title, bodyMd: body, searchText: buildCommunityNoteSearchText({ title, bodyMd: body }),
        evidenceRefs: refs, lastRunId: run._id, updatedAt: args.nowMs,
      });
      await ctx.db.patch(run._id, { changed: [...new Set([...run.changed, note.slug])] });
      return { ok: true, slug: note.slug, title, change: "changed" };
    }

    if (run.added.length >= MEMORY_NEW_NOTES_PER_RUN) return refuse(ctx, run, title, "run_note_limit");
    const existing = await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q) => q.eq("communityId", args.communityId)).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY + 1);
    if (existing.length >= COMMUNITY_NOTES_MAX_PER_COMMUNITY) return refuse(ctx, run, title, "notes_full");
    const taken = new Set(existing.map((row) => row.slug));
    const base = communityNoteSlug(title);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
    await ctx.db.insert("communityNotes", {
      communityId: args.communityId, slug, title, bodyMd: body, source: "learned", authorKind: "guide",
      evidenceRefs: refs, lastRunId: run._id, searchText: buildCommunityNoteSearchText({ title, bodyMd: body }),
      createdAt: args.nowMs, updatedAt: args.nowMs,
    });
    await ctx.db.insert("communityNoteRevisions", { communityId: args.communityId, slug, change: "added", runId: run._id, createdAt: args.nowMs });
    await ctx.db.patch(run._id, { added: [...run.added, slug] });
    return { ok: true, slug, title, change: "added" };
  },
});

// memory.md: the guide rewrites the whole index during a review.
export const writeCommunityMemoryIndexInternal = internalMutation({
  args: { communityId: v.id("communities"), runId: v.id("agentWorkRuns"), bodyMd: v.string(), nowMs: v.number() },
  handler: async (ctx, args): Promise<{ ok: true } | Refused> => {
    const run = await openRun(ctx, args.communityId, args.runId);
    if (!run) return { ok: false, code: "run_not_open" };
    const notes = await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q) => q.eq("communityId", args.communityId)).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY);
    const refusal = memoryIndexRefusal(args.bodyMd, new Set(notes.map((note) => note.slug)));
    if (refusal) return refuse(ctx, run, "memory.md", refusal);
    const current = await ctx.db.query("communityMemoryIndex").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
    await ctx.db.insert("communityNoteRevisions", {
      communityId: args.communityId, slug: "memory.md", change: "index", runId: run._id, createdAt: args.nowMs,
      ...(current?.runId ? { previousRunId: current.runId } : {}),
      ...(current ? { before: { title: "memory.md", bodyMd: current.bodyMd } } : {}),
    });
    const bodyMd = args.bodyMd.trim();
    if (current) await ctx.db.patch(current._id, { bodyMd, runId: run._id, updatedAt: args.nowMs });
    else await ctx.db.insert("communityMemoryIndex", { communityId: args.communityId, bodyMd, runId: run._id, updatedAt: args.nowMs });
    return { ok: true };
  },
});

// Ends a review. A review that changed nothing is "empty": nothing to show.
export const finishMemoryReviewRunInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    runId: v.id("agentWorkRuns"),
    failed: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
    summary: v.optional(v.string()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await openRun(ctx, args.communityId, args.runId);
    if (!run) return null;
    const wrote = run.added.length + run.changed.length > 0 || Boolean(await ctx.db.query("communityNoteRevisions")
      .withIndex("by_run", (q) => q.eq("runId", run._id)).first());
    const status = args.failed ? "failed" : wrote ? "done" : "empty";
    await ctx.db.patch(run._id, {
      status, finishedAt: args.nowMs,
      ...(args.summary ? { summary: args.summary.trim().slice(0, 1_000) } : {}),
      ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      ...(args.promptTokens !== undefined ? { promptTokens: args.promptTokens } : {}),
      ...(args.completionTokens !== undefined ? { completionTokens: args.completionTokens } : {}),
    });
    return { status };
  },
});

export const readCommunityMemoryIndexInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("communityMemoryIndex").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
    return row ? { bodyMd: row.bodyMd, updatedAt: row.updatedAt } : null;
  },
});

// ---------- a builder's side

const viewerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

async function manager(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return userId;
}

// Removes a guide note and remembers what it was learned from.
export async function removeGuideNote(ctx: any, note: any, removedByUserId: any, nowMs: number) {
  await ctx.db.insert("communityNoteRemovals", {
    communityId: note.communityId, slug: note.slug, title: note.title, evidenceRefs: note.evidenceRefs ?? [],
    ...(removedByUserId ? { removedByUserId } : {}), createdAt: nowMs,
  });
  await ctx.db.delete(note._id);
}

// Undo one guide note: its last change is put back; a note the guide added is
// removed, and its posts won't bring it back.
export const undoLearnedNote = mutation({
  args: { ...viewerArgs, slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await manager(ctx, args);
    const note = await ctx.db.query("communityNotes")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.slug)).first();
    if (!note || noteAuthorKind(note) !== "guide") throw new Error("semantic_not_found");
    const nowMs = Date.now();
    const last = (await ctx.db.query("communityNoteRevisions")
      .withIndex("by_community_slug_createdAt", (q) => q.eq("communityId", args.communityId).eq("slug", args.slug))
      .order("desc").take(10)).find((row) => !row.undoneAt && row.change !== "index");
    if (last?.change === "changed" && last.before) {
      const before = last.before;
      await ctx.db.patch(note._id, {
        title: before.title, bodyMd: before.bodyMd, evidenceRefs: before.evidenceRefs ?? [],
        searchText: buildCommunityNoteSearchText({ title: before.title, bodyMd: before.bodyMd }), updatedAt: nowMs,
        lastRunId: last.previousRunId,
      });
      await ctx.db.patch(last._id, { undoneAt: nowMs });
      return { undone: "changed" as const };
    }
    await removeGuideNote(ctx, note, userId, nowMs);
    if (last) await ctx.db.patch(last._id, { undoneAt: nowMs });
    return { undone: "removed" as const };
  },
});

// Undo a whole review: every note it added goes, every note it changed goes
// back, and memory.md is put back.
export const undoMemoryRun = mutation({
  args: { ...viewerArgs, runId: v.id("agentWorkRuns") },
  handler: async (ctx, args) => {
    const userId = await manager(ctx, args);
    const run = await ctx.db.get(args.runId);
    if (!run || String(run.communityId) !== String(args.communityId)) throw new Error("semantic_not_found");
    if (run.status === "undone") return { undone: 0 };
    const nowMs = Date.now();
    // Newest first, in the order they were written (a review can change the
    // same note twice within one moment).
    const revisions = (await ctx.db.query("communityNoteRevisions").withIndex("by_run", (q) => q.eq("runId", run._id)).order("desc").collect())
      .filter((row) => !row.undoneAt);
    let undone = 0;
    let kept = 0;
    for (const revision of revisions) {
      if (revision.change === "index") {
        const index = await ctx.db.query("communityMemoryIndex").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
        // A later review rewrote memory.md since: its version stays.
        if (index && String(index.runId ?? "") !== String(run._id)) { kept += 1; continue; }
        if (index && revision.before) await ctx.db.patch(index._id, { bodyMd: revision.before.bodyMd, runId: revision.previousRunId, updatedAt: nowMs });
        else if (index) await ctx.db.delete(index._id);
      } else {
        const note = await ctx.db.query("communityNotes")
          .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", revision.slug)).first();
        // A later review changed the note since: its work stays.
        if (note && String(note.lastRunId ?? "") !== String(run._id)) { kept += 1; continue; }
        // A builder took the note over since: it is theirs now, and stays.
        if (note && noteAuthorKind(note) === "guide") {
          if (revision.change === "added") await removeGuideNote(ctx, note, userId, nowMs);
          else if (revision.before) {
            // Back to how it was, in the hands of the review that wrote that version.
            await ctx.db.patch(note._id, {
              title: revision.before.title, bodyMd: revision.before.bodyMd, evidenceRefs: revision.before.evidenceRefs ?? [],
              searchText: buildCommunityNoteSearchText({ title: revision.before.title, bodyMd: revision.before.bodyMd }), updatedAt: nowMs,
              lastRunId: revision.previousRunId,
            });
          }
        }
      }
      await ctx.db.patch(revision._id, { undoneAt: nowMs });
      undone += 1;
    }
    // A review whose work a later one built on stays open: undo the later one
    // first, then this one.
    if (kept === 0) await ctx.db.patch(run._id, { status: "undone" });
    return { undone, kept };
  },
});

// The reviews a builder can read and undo, newest first.
export const listMemoryRuns = query({
  args: { ...viewerArgs, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const limit = Math.max(1, Math.min(RUNS_LIST_MAX, Math.floor(args.limit ?? 10)));
    const runs = await ctx.db.query("agentWorkRuns")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId)).order("desc").take(limit * 3);
    return runs.filter((run) => run.status === "done" || run.status === "undone").slice(0, limit).map((run) => ({
      id: String(run._id), status: run.status, added: run.added, changed: run.changed, refused: run.refused.length,
      summary: run.summary ?? null, created_at: new Date(run.createdAt).toISOString(),
    }));
  },
});

// ---------- what the nightly review reads, in one prompt

// The newest notes are shown whole (so the guide changes one instead of
// repeating it); older ones by title.
const NOTES_SHOWN_WHOLE = 40;
const NOTE_SHOWN_CHARS = 600;
const NOTES_LISTED_MAX = 200;

async function authorWord(ctx: any, row: any, names: Map<string, string>): Promise<string> {
  if (row.actorType !== "human" || !row.actorUserId) return "the guide";
  const key = String(row.actorUserId);
  if (!names.has(key)) {
    const user = await ctx.db.get(row.actorUserId);
    names.set(key, user?.handle ? `@${user.handle}` : user?.displayName ?? "a member");
  }
  return names.get(key)!;
}

// Everything the review needs: memory.md, the notes the community has, and
// what people said in its open channels since the last review, oldest
// first, each post and reply with the name a note cites. At most
// MEMORY_REVIEW_POSTS_MAX posts: with more, the review reads through the
// last one shown (readUntil) and the next review reads the rest. A reply in
// a thread that was deleted isn't readable, so it isn't shown or counted.
export const readMemoryReviewInputInternal = internalQuery({
  args: { communityId: v.id("communities"), sinceMs: v.number(), untilMs: v.number() },
  handler: async (ctx, args) => {
    const channels = await ctx.db.query("communityChannels")
      .withIndex("by_community_access_status_position", (q) => q.eq("communityId", args.communityId).eq("accessMode", "all_members").eq("status", "active"))
      .take(100);
    const liveRoots = new Map<string, boolean>();
    const inLiveThread = async (rootId: any) => {
      const key = String(rootId);
      if (!liveRoots.has(key)) liveRoots.set(key, ((await ctx.db.get(rootId)) as any)?.status === "live");
      return liveRoots.get(key)!;
    };
    const rows: Array<{ row: any; kind: "post" | "reply"; channelName: string; order: number }> = [];
    for (const [order, channel] of channels.entries()) {
      for (const table of ["communityInteractionRoots", "communityInteractionReplies"] as const) {
        for (const scope of ["community", "public"] as const) {
          const found = await ctx.db.query(table).withIndex("by_community_channel_visibility_status_createdAt", (q: any) => q
            .eq("communityId", args.communityId).eq("channelId", channel._id).eq("visibilityScope", scope).eq("status", "live")
            .gt("createdAt", args.sinceMs).lte("createdAt", args.untilMs)).take(MEMORY_REVIEW_POSTS_MAX + 1);
          for (const row of found as any[]) {
            if (table === "communityInteractionReplies" && !(await inLiveThread(row.rootId))) continue;
            rows.push({ row, kind: table === "communityInteractionRoots" ? "post" : "reply", channelName: channel.name, order });
          }
        }
      }
    }
    rows.sort((a, b) => a.row.createdAt - b.row.createdAt);
    const shown = rows.slice(0, MEMORY_REVIEW_POSTS_MAX);
    const readUntil = rows.length > MEMORY_REVIEW_POSTS_MAX ? shown[shown.length - 1].row.createdAt : args.untilMs;
    // Posts at the same instant as the last one shown are read now too.
    const read = rows.filter((entry) => entry.row.createdAt <= readUntil)
      // Shown channel by channel, oldest first in each.
      .sort((a, b) => a.order - b.order || a.row.createdAt - b.row.createdAt);
    if (read.length === 0) return { posts: 0, readUntil, text: "" };

    const index = await ctx.db.query("communityMemoryIndex").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).first();
    const notes = await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q) => q.eq("communityId", args.communityId)).order("desc").take(NOTES_LISTED_MAX);
    const lines = ["# memory.md", "", index?.bodyMd?.trim() || "_Nothing yet._", "", `# The notes (${notes.length}${notes.length === NOTES_LISTED_MAX ? ", newest first" : ""})`, ""];
    if (notes.length === 0) lines.push("_None yet._");
    notes.forEach((note, i) => {
      const who = noteAuthorKind(note) === "builder" ? "a builder" : "you";
      lines.push(`- memory/${note.slug}.md · ${note.title} · by ${who}`);
      if (i < NOTES_SHOWN_WHOLE) lines.push(`  > ${note.bodyMd.replace(/\s+/g, " ").trim().slice(0, NOTE_SHOWN_CHARS)}`);
    });
    lines.push("", `# What people said, ${new Date(args.sinceMs).toISOString()} to ${new Date(readUntil).toISOString()}`);
    const names = new Map<string, string>();
    let current = "";
    for (const { row, kind, channelName } of read) {
      if (channelName !== current) {
        current = channelName;
        lines.push("", `## #${channelName}`);
      }
      const where = kind === "reply" ? ` (reply to post:${String(row.rootId)})` : "";
      const text = String(row.contentSummary ?? "").replace(/\s+/g, " ").trim().slice(0, MEMORY_REVIEW_POST_CHARS);
      // What the guide itself said is context, never evidence: no name to cite.
      const said = row.actorType === "human" && row.actorUserId
        ? `${kind}:${String(row._id)}${where} · ${await authorWord(ctx, row, names)}`
        : `the guide (not citable)${where}`;
      lines.push(`- ${said} · ${new Date(row.createdAt).toISOString()}`, `  > ${text}`);
    }
    if (readUntil < args.untilMs) lines.push("", "The rest is read in the next review.");
    return { posts: read.length, readUntil, text: lines.join("\n") };
  },
});

// ---------- when the nightly review is due (run by communityMemoryReview.ts)

export async function communityTimeZone(ctx: any, communityId: any): Promise<string | null> {
  const settings = await ctx.db.query("communityFounderBriefSettings").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
  return settings?.timeZone ?? null;
}

export async function scheduleMemoryReview(ctx: any, workId: any, atMs: number) {
  await ctx.scheduler.runAt(atMs, (internal as any).communityMemoryReview.runMemoryReviewInternal, { workId });
}

// Called where people's posts and replies are written: counts what the next
// review has to read, and makes it due if it isn't already.
export async function markCommunityMemoryReviewDue(ctx: any, args: { communityId: any; channelId: any; actorType: string; nowMs: number }) {
  if (args.actorType !== "human" || !args.channelId) return;
  const channel = await ctx.db.get(args.channelId);
  if (!channel || channel.accessMode !== "all_members" || channel.status !== "active") return;
  const work = await ctx.db.query("agentWork")
    .withIndex("by_community_scope_kind", (q: any) => q.eq("communityId", args.communityId).eq("scope", "community").eq("kind", "memory_review"))
    .first();
  if (work?.dueAt) {
    await ctx.db.patch(work._id, { pending: work.pending + 1, updatedAt: args.nowMs });
    return;
  }
  const dueAt = nextMemoryReviewAtMs(args.nowMs, await communityTimeZone(ctx, args.communityId));
  if (work) {
    await ctx.db.patch(work._id, { pending: work.pending + 1, firstPendingAt: work.firstPendingAt ?? args.nowMs, dueAt, failures: 0, updatedAt: args.nowMs });
    await scheduleMemoryReview(ctx, work._id, dueAt);
  } else {
    // The first review reads the last day, not the community's whole past.
    const workId = await ctx.db.insert("agentWork", {
      communityId: args.communityId, scope: "community", kind: "memory_review", pending: 1, firstPendingAt: args.nowMs,
      reviewedThrough: args.nowMs - 24 * 60 * 60_000, dueAt, failures: 0, createdAt: args.nowMs, updatedAt: args.nowMs,
    });
    await scheduleMemoryReview(ctx, workId, dueAt);
  }
}

