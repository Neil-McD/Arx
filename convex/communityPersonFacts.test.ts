/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { readPersonFacts } from "./communityPersonFacts";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 15);

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (handle: string) => ctx.db.insert("users", { authSubject: handle, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner");
    const mayaId = await user("maya");
    const goneId = await user("gone");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "club", name: "Club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    const otherId = await ctx.db.insert("communities", { ownerId, slug: "other", name: "Other", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 0, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: mayaId, role: "moderator", accessSource: "manual_grant", state: "active", createdAt: NOW - 1_000, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: goneId, role: "member", accessSource: "free_grant", state: "left", createdAt: NOW - 1_000, updatedAt: NOW });
    await ctx.db.insert("userProfileDetails", { userId: mayaId, bio: "Setter at the north wall.", socialLinks: { instagram: "https://instagram.com/maya" }, createdAt: NOW, updatedAt: NOW });
    const fact = (kind: string, body: string, provenance: string, consentState: string, scope: any) => ctx.db.insert("memberFacts", {
      userId: mayaId, ...(scope ? { communityId: scope } : {}), kind, body, provenance, confidence: 1, evidenceRefs: [], stalenessScore: 0,
      consentState, createdByActorType: "member", version: 1, createdAt: NOW, updatedAt: NOW });
    await fact("skill", "Sets the Saturday problems", "stated_bridge", "approved", communityId);
    await fact("goal", "Climbing V7 by spring", "stated_interview", "approved", undefined);
    await fact("situation", "Probably burnt out", "inferred_agent", "pending", communityId);
    await fact("interest", "Seems to like slab", "observed_behavior", "agent_internal", communityId);
    await fact("skill", "Runs a different club", "stated_bridge", "approved", otherId);
    await ctx.db.insert("communityMemberNotes", { communityId, subjectUserId: mayaId, authorUserId: ownerId, body: "Ask about setting Sundays.", createdAt: NOW, updatedAt: NOW });
    return { ownerId, mayaId, goneId, communityId };
  });
}

test("member lens: what any member sees; stated or approved facts only, never a guess or what was only observed", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const maya: any = await t.run((ctx: any) => readPersonFacts(ctx, { communityId: w.communityId, subjectUserId: w.mayaId, lens: "member" }));
  expect(maya).toMatchObject({ name: "maya", handle: "maya", role: "moderator", bio: "Setter at the north wall.",
    links: { instagram: "https://instagram.com/maya", x: null, youtube: null } });
  expect(maya.shared.map((fact: any) => fact.body)).toEqual(["Climbing V7 by spring", "Sets the Saturday problems"]);
  for (const hidden of ["plan", "notes", "joined_at", "state"]) expect(maya).not.toHaveProperty(hidden);
  expect(JSON.stringify(maya)).not.toMatch(/burnt out|slab|different club/);
});

test("self lens adds when they joined; builder lens adds plan, state and notes", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const self: any = await t.run((ctx: any) => readPersonFacts(ctx, { communityId: w.communityId, subjectUserId: w.mayaId, lens: "self" }));
  expect(self.joined_at).toBe(new Date(NOW - 1_000).toISOString());
  expect(self).not.toHaveProperty("notes");
  const builder: any = await t.run((ctx: any) => readPersonFacts(ctx, { communityId: w.communityId, subjectUserId: w.mayaId, lens: "builder" }));
  expect(builder).toMatchObject({ plan: "Comped", state: "active", notes: [{ body: "Ask about setting Sundays." }] });
  expect(JSON.stringify(builder)).not.toMatch(/burnt out|slab/);
});

test("the owner is a person here; someone who left isn't listed to anyone", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  expect(await t.run((ctx: any) => readPersonFacts(ctx, { communityId: w.communityId, subjectUserId: w.ownerId, lens: "member" })))
    .toMatchObject({ role: "owner", shared: [] });
  expect(await t.run((ctx: any) => readPersonFacts(ctx, { communityId: w.communityId, subjectUserId: w.goneId, lens: "builder" }))).toBeNull();
});
