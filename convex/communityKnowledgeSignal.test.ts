/// <reference types="vite/client" />
// The Knowledge dot: something new to read where you belong. A lesson
// becoming visible to members lights it (added to a published course, or its
// course published); editing a lesson's words does not; a draft lights
// nothing; opening Knowledge clears it; and anyone who can edit courses never
// gets it (their own work is never news to them).
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const START = 1_800_000_000_000;

afterEach(() => { vi.useRealTimers(); });

function at(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START + ms);
}

async function seed(t: any) {
  return await t.run(async (ctx: any) => {
    const user = async (name: string) => {
      const id = await ctx.db.insert("users", {
        authSubject: name, displayName: name, handle: name, normalizedHandle: name,
        email: `${name}@example.com`, emailVerifiedAt: 1, createdAt: 1, updatedAt: 1,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", { userId: id, documentKey: document.key, documentVersion: document.version, acceptedAt: 1, source: "test", createdAt: 1 });
      }
      return id;
    };
    const ownerId = await user("owner");
    const memberId = await user("member");
    const adminId = await user("admin");
    await user("stranger");
    const communityId = await ctx.db.insert("communities", {
      ownerId, name: "Class", slug: "class", visibility: "unlisted", entryPolicy: "open",
      inferenceFundingPolicy: "managed_required", lifecycleStatus: "active", lifecycleGeneration: 0, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", state: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("communityMemberships", { communityId, userId: adminId, role: "admin", state: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("communityChannels", {
      communityId, systemRole: "general", name: "General", slug: "general", accessMode: "all_members",
      postingPolicy: "members", position: 0, status: "active", createdAt: 1, updatedAt: 1,
    });
    return { communityId };
  });
}

async function knowledgeDot(t: any, subject: string, communityId: any): Promise<boolean> {
  const page = await t.withIdentity({ subject }).query(api.communityAttention.listMyCommunityAttentionPage,
    { communityId, section: "shared", paginationOpts: { numItems: 10, cursor: null } });
  return page.attention.resources;
}

async function openKnowledge(t: any, subject: string, communityId: any) {
  await t.withIdentity({ subject }).mutation(api.communityAttention.markCommunitySurfaceSeen, { communityId, surface: "resources" });
}

async function course(t: any, communityId: any, name: string, status: "live" | "draft") {
  const row = await t.withIdentity({ subject: "owner" }).mutation(api.communityResources.saveCommunityResourceModule,
    { communityId, payload: { name, module_status: status } });
  return String(row.id);
}

async function setCourseStatus(t: any, moduleId: string, status: "live" | "draft") {
  await t.withIdentity({ subject: "owner" }).mutation(api.communityResources.saveCommunityResourceModule,
    { moduleId, payload: { module_status: status } });
}

async function lesson(t: any, communityId: any, moduleId: string, title: string) {
  const row = await t.withIdentity({ subject: "owner" }).mutation(api.communityResources.saveCommunityResource,
    { communityId, payload: { title, body_md: `${title} words`, resource_role: "page", module_id: moduleId } });
  return String(row.id);
}

test("a lesson added to a published course lights the dot for members, until they open Knowledge", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await seed(t);
  at(1_000);
  const live = await course(t, communityId, "Launch", "live");
  await lesson(t, communityId, live, "One");
  expect(await knowledgeDot(t, "member", communityId)).toBe(true);
  // Not for anyone who can edit courses, nor for someone outside.
  expect(await knowledgeDot(t, "owner", communityId)).toBe(false);
  expect(await knowledgeDot(t, "admin", communityId)).toBe(false);
  await expect(knowledgeDot(t, "stranger", communityId)).rejects.toThrow();

  await openKnowledge(t, "member", communityId);
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);

  at(2_000);
  await lesson(t, communityId, live, "Two");
  expect(await knowledgeDot(t, "member", communityId)).toBe(true);
});

test("editing a lesson's words is not news; a draft course lights nothing until it is published", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await seed(t);
  at(1_000);
  const live = await course(t, communityId, "Launch", "live");
  const one = await lesson(t, communityId, live, "One");
  await openKnowledge(t, "member", communityId);

  at(2_000);
  await t.withIdentity({ subject: "owner" }).mutation(api.communityResources.saveCommunityResource,
    { resourceId: one, payload: { body_md: "Better words" } });
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);

  // Written as a draft: members can't see it, so nothing for them.
  at(3_000);
  const draft = await course(t, communityId, "Next steps", "draft");
  await lesson(t, communityId, draft, "Secret");
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);
  // Meanwhile a lesson goes into the published course, and the member reads it.
  at(4_000);
  await lesson(t, communityId, live, "Two");
  await openKnowledge(t, "member", communityId);
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);

  // Published days later: its lessons (written before the member's last
  // visit) are new to members now.
  at(10_000);
  await setCourseStatus(t, draft, "live");
  expect(await knowledgeDot(t, "member", communityId)).toBe(true);
  await openKnowledge(t, "member", communityId);
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);

  // Renaming a published course is not news either.
  at(11_000);
  await t.withIdentity({ subject: "owner" }).mutation(api.communityResources.saveCommunityResourceModule,
    { moduleId: draft, payload: { name: "Next steps, renamed" } });
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);

  // A published course with no lesson yet has nothing to read.
  at(12_000);
  await course(t, communityId, "Empty", "live");
  expect(await knowledgeDot(t, "member", communityId)).toBe(false);
});
