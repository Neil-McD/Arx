/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;

async function seed(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (subject: string, name: string) => ctx.db.insert("users", { authSubject: subject, displayName: name, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner", "Neil");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "class", name: "Class", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW });
    for (const subject of ["jon", "maya"]) {
      const userId = await user(subject, subject);
      await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    }
    await user("stranger", "Stranger");
    const course = (name: string, status: "live" | "draft") => ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status, name, sortOrder: 1, createdAt: NOW, updatedAt: NOW });
    const lesson = (moduleId: any, title: string, sortOrder: number, status = "published") => ctx.db.insert("communityResources", { communityId, moduleId, createdByUserId: ownerId,
      type: "post", role: "page", status, title, bodyChars: 10, pinned: false, sortOrder, createdAt: NOW, updatedAt: NOW });
    const live = await course("Launch", "live");
    const draft = await course("Hidden", "draft");
    return { communityId, live, one: await lesson(live, "One", 1), two: await lesson(live, "Two", 2), hidden: await lesson(draft, "Secret", 1) };
  });
}

test("a member marks lessons done; it is theirs alone; hosts see only counts", async () => {
  const t = convexTest(schema, modules);
  const { communityId, live, one, two, hidden } = await seed(t);
  const jon = t.withIdentity({ subject: "jon" });
  const maya = t.withIdentity({ subject: "maya" });
  await jon.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: one, done: true });
  await jon.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: one, done: true });
  await jon.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: two, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: one, done: true });

  expect((await jon.query(api.communityLessonProgress.getMyLessonProgress, { communityId })).done.map((row: any) => row.resource_id).sort()).toEqual([one, two].map(String).sort());
  expect((await maya.query(api.communityLessonProgress.getMyLessonProgress, { communityId })).done).toHaveLength(1);

  // Only a lesson in a live course can be marked.
  await expect(jon.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: hidden, done: true })).rejects.toThrow(/lesson_not_found/);
  await expect(t.withIdentity({ subject: "stranger" }).mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: one, done: true })).rejects.toThrow();

  // Hosts: started and finished per course, counts only; members can't ask.
  const summary = await t.withIdentity({ subject: "owner" }).query(api.communityLessonProgress.getCourseProgressSummary, { communityId });
  expect(summary.courses).toEqual([{ module_id: String(live), lessons: 2, started: 2, finished: 1 }]);
  await expect(jon.query(api.communityLessonProgress.getCourseProgressSummary, { communityId })).rejects.toThrow(/community_forbidden/);

  await jon.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: two, done: false });
  expect((await jon.query(api.communityLessonProgress.getMyLessonProgress, { communityId })).done).toHaveLength(1);
});
