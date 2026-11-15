// Community memory (docs/specs/agent-system-slice-1.md, step 1): the guide's
// one write into the community's memory, and a builder's undo. The guide
// writes only from a review run; every note cites the open-channel posts it
// came from, and code checks each citation (shared/communityMemory.ts). A
// builder's note is never changed by the guide. Nothing here calls a model.
import { v } from "convex/values";
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
