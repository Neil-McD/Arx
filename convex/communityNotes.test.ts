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

test("members read the notes in Studio; only owners and admins edit or delete them", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, communityId } = await community(t);
  const memberId = await t.run(async (ctx: any) => {
    await ctx.db.patch(ownerId, { authSubject: "owner" });
    const memberId = await ctx.db.insert("users", { authSubject: "member", displayName: "Member", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
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
  await asOwner.mutation(api.communityNotes.deleteCommunityNote, { communityId, slug: "saturday-carpool" });
  expect((await asMember.query(api.communityNotes.listCommunityNotes, { communityId })).notes).toHaveLength(0);
  expect(memberId).toBeTruthy();
});

test("hosts write notes from Knowledge; members can't; only a host's own notes name the writer", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, communityId } = await community(t);
  await t.run(async (ctx: any) => {
    const memberId = await ctx.db.insert("users", { authSubject: "member", displayName: "Jon", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    // A note saved from a member's conversation (an older source).
    await ctx.db.insert("communityNotes", { communityId, slug: "pods", title: "Pods of five", bodyMd: "Five people per pod.", source: "ask",
      searchText: "pods of five", createdByUserId: memberId, createdAt: NOW, updatedAt: NOW });
    expect(ownerId).toBeTruthy();
  });
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });
  await expect(asMember.mutation(api.communityNotes.createCommunityNote, { communityId, title: "Mine", text: "x" })).rejects.toThrow(/community_forbidden/);
  const first = await asOwner.mutation(api.communityNotes.createCommunityNote, { communityId, title: "Invitations that work", text: "Lead with the result." });
  const second = await asOwner.mutation(api.communityNotes.createCommunityNote, { communityId, title: "Invitations that work", text: "Say who it's for." });
  expect(first.slug).toBe("invitations-that-work");
  expect(second.slug).toBe("invitations-that-work-2");
  await expect(asOwner.mutation(api.communityNotes.createCommunityNote, { communityId, title: "  ", text: "x" })).rejects.toThrow(/invalid_tool_args/);

  const seen = await asMember.query(api.communityNotes.listCommunityNotes, { communityId });
  const bySlug = Object.fromEntries(seen.notes.map((note: any) => [note.slug, note]));
  expect(bySlug["invitations-that-work"]).toMatchObject({ kind: "founder", written_by: "Owner" });
  expect(bySlug["invitations-that-work"].created_at).toBeTruthy();
  // Saved from someone's conversation: never names them.
  expect(bySlug.pods).toMatchObject({ kind: "ask", written_by: null });
});
