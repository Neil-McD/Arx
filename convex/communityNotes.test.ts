/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { COMMUNITY_NOTE_BODY_MAX_CHARS } from "../shared/communityNotes";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;

async function community(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "notes-club", name: "Notes club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    return { ownerId, communityId };
  });
}

const node = (communityId: any, title: string, extra: Record<string, unknown> = {}) => ({
  communityId, type: "insight", title, bodyMd: `${title} body.`, status: "promising", visibilityScope: "community", sourceVisibility: "community",
  confidence: 0.7, evidenceStrength: "observed", workflowIds: [], tags: [], sourceTraceIds: [], outcomeObservationIds: [], stalenessScore: 0,
  retrievalUsefulnessScore: 0, outcomeImpactScore: 0, createdByActorType: "admin", lastUpdatedByActorType: "admin", version: 1,
  createdAt: NOW, updatedAt: NOW, ...extra,
});

test("a note is created once, added to, rewritten, and kept within its size", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await community(t);
  const write = (args: Record<string, unknown>) => t.mutation(internal.communityNotes.writeCommunityNoteInternal, { communityId, source: "ask", ...args } as any);
  expect(await write({ mode: "create", title: "Saturday carpool", text: "Leaves the Eastside park-and-ride at 4:50." }))
    .toEqual({ ok: true, slug: "saturday-carpool", title: "Saturday carpool", created: true });
  expect(await write({ mode: "create", title: "Saturday Carpool!", text: "Dup." })).toMatchObject({ ok: false, code: "note_exists", slug: "saturday-carpool" });
  expect(await write({ mode: "append", slug: "saturday-carpool", text: "Three seats." })).toMatchObject({ ok: true, created: false });
  expect(await write({ mode: "append", slug: "saturday-carpool", text: "x".repeat(COMMUNITY_NOTE_BODY_MAX_CHARS) })).toMatchObject({ ok: false, code: "note_full" });
  expect(await write({ mode: "update", slug: "saturday-carpool", title: "Saturday carpool time", text: "Leaves at 4:45 now." })).toMatchObject({ ok: true });
  expect(await write({ mode: "append", slug: "no-such-note", text: "x" })).toMatchObject({ ok: false, code: "semantic_not_found" });
  const note = await t.query(internal.communityNotes.readCommunityNoteInternal, { communityId, slug: "saturday-carpool" });
  expect(note).toMatchObject({ title: "Saturday carpool time", bodyMd: "Leaves at 4:45 now.", source: "ask" });
  expect((await t.query(internal.communityNotes.searchCommunityNotesInternal, { communityId, query: "carpool" })).notes).toHaveLength(1);
});

test("old memory members could read becomes notes once; admin-only and archived memory doesn't", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await community(t);
  await t.run(async (ctx: any) => {
    await ctx.db.insert("communityIntelligenceNodes", node(communityId, "Warm up before crimps"));
    await ctx.db.insert("communityIntelligenceNodes", node(communityId, "Founder pricing", { visibilityScope: "admin" }));
    await ctx.db.insert("communityIntelligenceNodes", node(communityId, "Old idea", { status: "archived" }));
    await ctx.db.insert("communityIntelligenceNodes", node(communityId, "Warm up before crimps", { bodyMd: "Second node, same title." }));
    // Compiler memory whose sources are gone was hidden from members; it stays hidden.
    await ctx.db.insert("communityIntelligenceNodes", node(communityId, "Orphaned compiler note", { tags: ["compiler_memory"] }));
  });
  const migrate = (dryRun: boolean) => t.mutation(internal.communityNotes.migrateMemoryNodesToNotesInternal, { dryRun });
  expect(await migrate(true)).toMatchObject({ copied: 2, skipped: 3, isDone: true });
  expect(await t.run((ctx: any) => ctx.db.query("communityNotes").collect())).toHaveLength(0);
  expect(await migrate(false)).toMatchObject({ copied: 2, skipped: 3 });
  const notes: any[] = await t.run((ctx: any) => ctx.db.query("communityNotes").collect());
  expect(notes.map((n: any) => n.slug).sort()).toEqual(["warm-up-before-crimps", "warm-up-before-crimps-2"]);
  expect(notes.every((n: any) => n.source === "migrated")).toBe(true);
  expect(await migrate(false)).toMatchObject({ copied: 0, skipped: 5 });
});
