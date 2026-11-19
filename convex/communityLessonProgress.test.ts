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

test("a member marks lessons done; only they change it; hosts see the counts", async () => {
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

  // Hosts: started and finished per course; members can't ask.
  const summary = await t.withIdentity({ subject: "owner" }).query(api.communityLessonProgress.getCourseProgressSummary, { communityId });
  expect(summary.courses).toEqual([{ module_id: String(live), lessons: 2, started: 2, finished: 1 }]);
  await expect(jon.query(api.communityLessonProgress.getCourseProgressSummary, { communityId })).rejects.toThrow(/community_forbidden/);

  await jon.mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId: two, done: false });
  expect((await jon.query(api.communityLessonProgress.getMyLessonProgress, { communityId })).done).toHaveLength(1);
});

// Neil, Nov 18: hosts see each member's progress in a course (who is stuck,
// and where); members are told; nobody else sees it.
test("a host sees who has started a course, the stuck first; the list agrees with the counts; nobody else can ask", async () => {
  const t = convexTest(schema, modules);
  const { communityId, live, one, two } = await seed(t);
  const ids = await t.run(async (ctx: any) => {
    const ownerId = (await ctx.db.query("users").collect()).find((row: any) => row.authSubject === "owner")._id;
    const add = async (subject: string, name: string, role: string, handle?: string) => {
      const userId = await ctx.db.insert("users", { authSubject: subject, displayName: name, ...(handle ? { handle } : {}), createdAt: NOW, updatedAt: NOW });
      const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId, role, accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
      return { userId, membershipId };
    };
    const lesson = (moduleId: any, title: string, sortOrder: number, bodyChars: number) => ctx.db.insert("communityResources", { communityId, moduleId, createdByUserId: ownerId,
      type: "post", role: "page", status: "published", title, bodyChars, pinned: false, sortOrder, createdAt: NOW, updatedAt: NOW });
    const draft = (await ctx.db.query("communityResourceModules").collect()).find((row: any) => row.status === "draft")._id;
    return {
      kai: await add("kai", "Kai Tanaka", "member", "kai"), lee: await add("lee", "Lee", "moderator"), gone: await add("gone", "Gone", "member"),
      three: await lesson(live, "Three", 3, 10), empty: await lesson(live, "Empty for now", 4, 0), secret: await lesson(draft, "Not yet", 2, 10),
    };
  });
  const asUser = (subject: string) => t.withIdentity({ subject });
  const mark = (subject: string, resourceId: any) => asUser(subject).mutation(api.communityLessonProgress.setMyLessonDone, { communityId, resourceId, done: true });
  await mark("jon", one); await mark("jon", two); await mark("jon", ids.three);
  await mark("maya", one);
  await mark("kai", one); await mark("kai", two);
  await mark("gone", one);
  // When each was done; and rows a member could not make today (a lesson that
  // lost its content, one in a draft course) are there but never count.
  await t.run(async (ctx: any) => {
    const users = new Map((await ctx.db.query("users").collect()).map((row: any) => [String(row._id), row.authSubject]));
    const day = 86_400_000;
    const at: Record<string, number> = { jon: NOW + 9 * day, maya: NOW + 1 * day, kai: NOW + 5 * day, gone: NOW };
    for (const row of await ctx.db.query("communityLessonProgress").collect()) {
      const subject = String(users.get(String(row.userId)));
      await ctx.db.patch(row._id, { completedAt: at[subject] + (String(row.resourceId) === String(two) ? 1000 : 0) });
    }
    for (const resourceId of [ids.empty, ids.secret]) await ctx.db.insert("communityLessonProgress", { communityId, userId: ids.kai.userId, resourceId, completedAt: NOW + 20 * day });
    // Gone left after starting.
    await ctx.db.patch(ids.gone.membershipId, { state: "left" });
  });

  const owner = asUser("owner");
  const view = await owner.query(api.communityLessonProgress.getCourseProgressPeople, { communityId, moduleId: live });
  expect(view.people.map((person: any) => [person.name, person.done, person.of, person.last_lesson, person.finished])).toEqual([
    ["maya", 1, 3, "One", false],
    ["Kai Tanaka", 2, 3, "Two", false],
    ["jon", 3, 3, "Two", true],
  ]);
  expect(view.people[1]).toMatchObject({ handle: "kai", member_key: String(ids.kai.membershipId), last_done_at: new Date(NOW + 5 * 86_400_000 + 1000).toISOString() });
  expect(view).toMatchObject({ lessons: 3, started: 3, finished: 1, more: 0 });

  // The counts read the same rows the same way.
  const summary = await owner.query(api.communityLessonProgress.getCourseProgressSummary, { communityId });
  const counts = summary.courses.find((row: any) => row.module_id === String(live))!;
  expect(counts).toEqual({ module_id: String(live), lessons: view.lessons, started: view.started, finished: view.finished });
  expect(view.people.length + view.more).toBe(counts.started);
  expect(view.people.filter((person: any) => person.finished)).toHaveLength(counts.finished);

  // A moderator and a member are refused, like the counts.
  for (const subject of ["lee", "jon"]) {
    await expect(asUser(subject).query(api.communityLessonProgress.getCourseProgressPeople, { communityId, moduleId: live })).rejects.toThrow(/community_forbidden/);
    await expect(asUser(subject).query(api.communityLessonProgress.getCourseProgressSummary, { communityId })).rejects.toThrow(/community_forbidden/);
  }
});

test("a course nobody has started, or a draft, has nobody", async () => {
  const t = convexTest(schema, modules);
  const { communityId, live } = await seed(t);
  const draft = await t.run(async (ctx: any) => (await ctx.db.query("communityResourceModules").collect()).find((row: any) => row.status === "draft")._id);
  const owner = t.withIdentity({ subject: "owner" });
  expect(await owner.query(api.communityLessonProgress.getCourseProgressPeople, { communityId, moduleId: live })).toMatchObject({ lessons: 2, started: 0, finished: 0, people: [], more: 0 });
  expect(await owner.query(api.communityLessonProgress.getCourseProgressPeople, { communityId, moduleId: draft })).toMatchObject({ lessons: 0, started: 0, people: [] });
});
