/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

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
  const migrate = (dryRun: boolean) => t.mutation(internal.communityMemoryMigration.migrateMemoryNodesToNotesInternal, { dryRun });
  expect(await migrate(true)).toMatchObject({ copied: 2, skipped: 3, isDone: true });
  expect(await t.run((ctx: any) => ctx.db.query("communityNotes").collect())).toHaveLength(0);
  expect(await migrate(false)).toMatchObject({ copied: 2, skipped: 3 });
  const notes: any[] = await t.run((ctx: any) => ctx.db.query("communityNotes").collect());
  expect(notes.map((n: any) => n.slug).sort()).toEqual(["warm-up-before-crimps", "warm-up-before-crimps-2"]);
  expect(notes.every((n: any) => n.source === "migrated")).toBe(true);
  expect(await migrate(false)).toMatchObject({ copied: 0, skipped: 5 });
});

test("members read the notes in Studio; only owners and admins edit or delete them", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, communityId } = await community(t);
  const memberId = await t.run(async (ctx: any) => {
    await ctx.db.patch(ownerId, { authSubject: "owner" });
    const memberId = await ctx.db.insert("users", { authSubject: "member", displayName: "Member", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", active: true, createdAt: NOW, updatedAt: NOW });
    return memberId;
  });
  await t.run((ctx: any) => ctx.db.insert("communityNotes", {
    communityId, slug: "saturday-carpool", title: "Saturday carpool", bodyMd: "Leaves at 4:50.", source: "migrated",
    searchText: "saturday carpool leaves at 4:50", createdAt: NOW, updatedAt: NOW,
  }));
  const asMember = t.withIdentity({ subject: "member" });
  const asOwner = t.withIdentity({ subject: "owner" });

  const seen = await asMember.query(api.communityNotes.listCommunityNotes, { communityId });
  expect(seen).toMatchObject({ can_manage: false, notes: [expect.objectContaining({ title: "Saturday carpool", body_md: "Leaves at 4:50." })] });
  await expect(asMember.mutation(api.communityNotes.deleteCommunityNote, { communityId, slug: "saturday-carpool" })).rejects.toThrow(/community_forbidden/);
  await expect(asMember.mutation(api.communityNotes.updateCommunityNote, { communityId, slug: "saturday-carpool", title: "x", text: "y" })).rejects.toThrow(/community_forbidden/);

  expect((await asOwner.query(api.communityNotes.listCommunityNotes, { communityId })).can_manage).toBe(true);
  await asOwner.mutation(api.communityNotes.updateCommunityNote, { communityId, slug: "saturday-carpool", title: "Saturday carpool", text: "Leaves at 4:45 now." });
  expect((await asMember.query(api.communityNotes.listCommunityNotes, { communityId })).notes[0].body_md).toBe("Leaves at 4:45 now.");
  // The overview Studio and cached pages read shows the note beside the community.
  const overview = await asMember.query(api.communityIntelligenceDirectory.getCommunityPolynetOverview, { communityId });
  expect(overview.graph.nodes.map((node: any) => node.title)).toContain("Saturday carpool");
  // Visitors see nothing of a community's notes or lessons, not even counts.
  expect(await t.query(api.communityIntelligenceDirectory.resolvePublicCommunityMemoryOverviewBySlug, { communitySlug: "notes-club" }))
    .toEqual({ ok: false });
  await asOwner.mutation(api.communityNotes.deleteCommunityNote, { communityId, slug: "saturday-carpool" });
  expect((await asMember.query(api.communityNotes.listCommunityNotes, { communityId })).notes).toHaveLength(0);
  expect(memberId).toBeTruthy();
});
