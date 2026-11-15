/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { communityScopeKey, insertNote, memoryIndexFor, notesByUpdated, podScopeKey, searchNotes } from "./communityNotesStore";
import { buildCommunityNoteSearchText } from "../shared/communityNotes";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 15);

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "club", name: "Club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    const room = (slug: string) => ctx.db.insert("communityChannels", { communityId, slug, name: slug, accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdAt: NOW, updatedAt: NOW });
    const climbersId = await room("climbers");
    const foundersId = await room("founders");
    const note = (scopeKey: any, slug: string, body: string) => insertNote(ctx, scopeKey, { communityId, slug, title: slug, bodyMd: body,
      source: "founder", searchText: buildCommunityNoteSearchText({ title: slug, bodyMd: body }), createdAt: NOW, updatedAt: NOW });
    await note(communityScopeKey(communityId), "refunds", "Refunds within seven days, granite policy.");
    await note(podScopeKey(climbersId), "fingerboard", "Fingerboard plan for granite season.");
    await note(podScopeKey(foundersId), "pricing", "Founders granite pricing secret.");
    return { ownerId, communityId, climbersId, foundersId };
  });
}

test("each scope reads only its own notes: listing, search and memory.md", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const slugs = (rows: any[]) => rows.map((row) => row.slug).sort();
  await t.run(async (ctx: any) => {
    expect(slugs(await notesByUpdated(ctx, communityScopeKey(w.communityId)).collect())).toEqual(["refunds"]);
    expect(slugs(await notesByUpdated(ctx, podScopeKey(w.climbersId)).collect())).toEqual(["fingerboard"]);
    expect(slugs(await searchNotes(ctx, communityScopeKey(w.communityId), "granite").take(10))).toEqual(["refunds"]);
    expect(slugs(await searchNotes(ctx, podScopeKey(w.climbersId), "granite").take(10))).toEqual(["fingerboard"]);
    expect(await memoryIndexFor(ctx, podScopeKey(w.climbersId))).toBeNull();
  });
  // The community's own readers (the guide's memory/, search, the builders' page).
  const listed: any = await t.query(internal.communityNotes.listCommunityNotesInternal, { communityId: w.communityId, limit: 50 });
  expect(slugs(listed.notes)).toEqual(["refunds"]);
  const searched: any = await t.query(internal.communityNotes.searchCommunityNotesInternal, { communityId: w.communityId, query: "granite" });
  expect(slugs(searched.notes)).toEqual(["refunds"]);
  expect(await t.query(internal.communityNotes.readCommunityNoteInternal, { communityId: w.communityId, slug: "pricing" })).toBeNull();
});

test("the backfill scopes old rows to their community and moves old pod notes into their pod; running it again changes nothing", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    await ctx.db.insert("communityNotes", { communityId: w.communityId, slug: "old-note", title: "Old", bodyMd: "Before scopes.", source: "founder",
      searchText: "old", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemoryIndex", { communityId: w.communityId, bodyMd: "- old", updatedAt: NOW });
    await ctx.db.insert("communityPodNotes", { communityId: w.communityId, channelId: w.climbersId, slug: "call-notes", title: "Call notes",
      bodyMd: "Week one: everyone shipped.", createdByUserId: w.ownerId, updatedByUserId: w.ownerId, createdAt: NOW, updatedAt: NOW });
  });
  const first: any = await t.mutation(internal.communityNotesStore.backfillMemoryScopeInternal, {});
  expect(first).toMatchObject({ scoped: { communityNotes: 1, communityMemoryIndex: 1 }, movedPodNotes: 1 });
  await t.run(async (ctx: any) => {
    expect((await notesByUpdated(ctx, communityScopeKey(w.communityId)).collect()).map((row: any) => row.slug).sort()).toEqual(["old-note", "refunds"]);
    expect((await notesByUpdated(ctx, podScopeKey(w.climbersId)).collect()).map((row: any) => row.slug).sort()).toEqual(["call-notes", "fingerboard"]);
    expect(await memoryIndexFor(ctx, communityScopeKey(w.communityId))).toMatchObject({ bodyMd: "- old" });
    expect(await ctx.db.query("communityPodNotes").collect()).toEqual([]);
  });
  expect(await t.mutation(internal.communityNotesStore.backfillMemoryScopeInternal, {}))
    .toEqual({ scoped: { communityNotes: 0, communityMemoryIndex: 0, communityNoteRevisions: 0, communityNoteRemovals: 0, agentWork: 0, agentWorkRuns: 0 }, movedPodNotes: 0 });
});
