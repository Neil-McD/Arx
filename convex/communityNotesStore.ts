// The one door to memory records (docs/specs/agent-system-end-state.md, pods
// slice B). Every memory row carries a scope key: "community:<communityId>" or
// "pod:<roomId>". Every index starts with it, so a read names exactly one
// scope and can never return another's rows: a community read never shows a
// pod's memory, and one pod never shows another's. This module is the only
// place that queries or inserts these tables (scripts/memory_scope_wall.test.ts).
//
// Tables: communityNotes, communityMemoryIndex (memory.md), communityNoteRevisions,
// communityNoteRemovals, agentWork, agentWorkRuns.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { buildCommunityNoteSearchText } from "../shared/communityNotes";

export type ScopeKey = `community:${string}` | `pod:${string}`;

export function communityScopeKey(communityId: unknown): ScopeKey {
  return `community:${String(communityId)}`;
}

export function podScopeKey(roomId: unknown): ScopeKey {
  return `pod:${String(roomId)}`;
}

export function parseScopeKey(key: string): { kind: "community" | "pod"; id: string } | null {
  const match = /^(community|pod):([A-Za-z0-9_-]+)$/.exec(String(key ?? ""));
  return match ? { kind: match[1] as "community" | "pod", id: match[2] } : null;
}

// ---------- notes

// A scope's notes by when they changed; the caller orders and takes.
export function notesByUpdated(ctx: any, scopeKey: ScopeKey, since?: number) {
  return ctx.db.query("communityNotes").withIndex("by_scope_updatedAt", (q: any) => {
    const scoped = q.eq("scopeKey", scopeKey);
    return since === undefined ? scoped : scoped.gte("updatedAt", since);
  });
}

export async function noteBySlug(ctx: any, scopeKey: ScopeKey, slug: string) {
  return await ctx.db.query("communityNotes").withIndex("by_scope_slug", (q: any) => q.eq("scopeKey", scopeKey).eq("slug", slug)).first();
}

export function searchNotes(ctx: any, scopeKey: ScopeKey, searchQuery: string) {
  return ctx.db.query("communityNotes").withSearchIndex("search_text", (q: any) => q.search("searchText", searchQuery).eq("scopeKey", scopeKey));
}

export async function insertNote(ctx: any, scopeKey: ScopeKey, doc: Record<string, unknown>) {
  return await ctx.db.insert("communityNotes", { ...doc, scopeKey });
}

// ---------- memory.md, revisions, removals

export async function memoryIndexFor(ctx: any, scopeKey: ScopeKey) {
  return await ctx.db.query("communityMemoryIndex").withIndex("by_scope", (q: any) => q.eq("scopeKey", scopeKey)).first();
}

export async function insertMemoryIndex(ctx: any, scopeKey: ScopeKey, doc: Record<string, unknown>) {
  return await ctx.db.insert("communityMemoryIndex", { ...doc, scopeKey });
}

export function revisionsForSlug(ctx: any, scopeKey: ScopeKey, slug: string) {
  return ctx.db.query("communityNoteRevisions").withIndex("by_scope_slug_createdAt", (q: any) => q.eq("scopeKey", scopeKey).eq("slug", slug));
}

// A run belongs to one scope; its revisions are read by the run.
export function revisionsForRun(ctx: any, runId: any) {
  return ctx.db.query("communityNoteRevisions").withIndex("by_run", (q: any) => q.eq("runId", runId));
}

export async function insertRevision(ctx: any, scopeKey: ScopeKey, doc: Record<string, unknown>) {
  return await ctx.db.insert("communityNoteRevisions", { ...doc, scopeKey });
}

export function removalsFor(ctx: any, scopeKey: ScopeKey) {
  return ctx.db.query("communityNoteRemovals").withIndex("by_scope_createdAt", (q: any) => q.eq("scopeKey", scopeKey));
}

export async function insertRemoval(ctx: any, scopeKey: ScopeKey, doc: Record<string, unknown>) {
  return await ctx.db.insert("communityNoteRemovals", { ...doc, scopeKey });
}

// ---------- work the guide does with nobody present

export async function workFor(ctx: any, scopeKey: ScopeKey, kind: "memory_review") {
  return await ctx.db.query("agentWork").withIndex("by_scope_kind", (q: any) => q.eq("scopeKey", scopeKey).eq("kind", kind)).first();
}

export function dueWork(ctx: any, beforeMs: number) {
  return ctx.db.query("agentWork").withIndex("by_dueAt", (q: any) => q.gt("dueAt", 0).lt("dueAt", beforeMs));
}

export async function insertWork(ctx: any, scopeKey: ScopeKey, doc: Record<string, unknown>) {
  const scope = parseScopeKey(scopeKey);
  return await ctx.db.insert("agentWork", { ...doc, scope: scope?.kind ?? "community", scopeKey });
}

// The runs of a community (builders see every scope's nights; each run says its scope).
export function runsOfCommunity(ctx: any, communityId: any) {
  return ctx.db.query("agentWorkRuns").withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId));
}

export async function insertRun(ctx: any, scopeKey: ScopeKey, doc: Record<string, unknown>) {
  return await ctx.db.insert("agentWorkRuns", { ...doc, scopeKey });
}

// ---------- backfill (pods slice B release step)
//
// Rows from before scope keys get "community:<communityId>"; the retired
// communityPodNotes rows move here as "pod:<roomId>" notes written by a host.
// Run right after the deploy that adds scope keys; safe to run again.

// Each table's rows with no scope key yet, through an index that starts with
// it (a missing key sorts first), so every run moves on to rows still unscoped.
const UNSCOPED: Record<string, string> = {
  communityNotes: "by_scope_updatedAt",
  communityMemoryIndex: "by_scope",
  communityNoteRevisions: "by_scope_slug_createdAt",
  communityNoteRemovals: "by_scope_createdAt",
  agentWork: "by_scope_kind",
  agentWorkRuns: "by_scope_createdAt",
};

export const backfillMemoryScopeInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(4_000, Math.floor(args.limit ?? 1_000)));
    const scoped: Record<string, number> = {};
    let remaining = false;
    for (const [table, index] of Object.entries(UNSCOPED)) {
      const rows = await (ctx.db.query(table as any) as any).withIndex(index, (q: any) => q.eq("scopeKey", undefined)).take(limit + 1);
      let n = 0;
      for (const row of rows.slice(0, limit)) {
        if (!row.communityId) continue;
        await ctx.db.patch(row._id, { scopeKey: communityScopeKey(row.communityId) });
        n += 1;
      }
      scoped[table] = n;
      if (rows.length > limit) remaining = true;
    }
    let moved = 0;
    const oldPodNotes = await (ctx.db.query("communityPodNotes") as any).take(limit + 1);
    if (oldPodNotes.length > limit) remaining = true;
    for (const old of oldPodNotes.slice(0, limit)) {
      const scope = podScopeKey(old.channelId);
      if (!(await noteBySlug(ctx, scope, old.slug))) {
        await insertNote(ctx, scope, {
          communityId: old.communityId, slug: old.slug, title: old.title, bodyMd: old.bodyMd, source: "founder", authorKind: "builder",
          searchText: buildCommunityNoteSearchText({ title: old.title, bodyMd: old.bodyMd }),
          createdByUserId: old.createdByUserId, updatedByUserId: old.updatedByUserId,
          ...(old.publishedNoteId ? { publishedNoteId: old.publishedNoteId } : {}),
          ...(old.publishedAt ? { publishedAt: old.publishedAt } : {}),
          createdAt: old.createdAt, updatedAt: old.updatedAt,
        });
      }
      await ctx.db.delete(old._id);
      moved += 1;
    }
    // remaining: run it again until false.
    return { scoped, movedPodNotes: moved, remaining };
  },
});
