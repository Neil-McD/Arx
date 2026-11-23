/// <reference types="vite/client" />
// Chips (docs/specs/guide-chips-end-state.md, slice 1): the names a reader
// gets are only of things they can open, so a chip never points elsewhere.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const memberId = await ctx.db.insert("users", { authSubject: "member", displayName: "Member", createdAt: NOW, updatedAt: NOW });
    const outsiderId = await ctx.db.insert("users", { authSubject: "outsider", displayName: "Outsider", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Kiln", slug: "kiln", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const live = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "live", name: "Start here", sortOrder: 1, createdAt: NOW, updatedAt: NOW });
    const draft = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "draft", name: "Secret plans", sortOrder: 2, createdAt: NOW, updatedAt: NOW });
    const lesson = (moduleId: any, title: string) => ctx.db.insert("communityResources", { communityId, createdByUserId: ownerId, moduleId, type: "post", role: "page", status: "draft",
      title, bodyMd: "Words.", bodyChars: 6, pinned: false, sourceIngestionStatus: "not_required", sourceIngestionKind: "manual", createdAt: NOW, updatedAt: NOW });
    await lesson(live, "A tour");
    await lesson(draft, "Hidden lesson");
    await ctx.db.insert("communityChannels", { communityId, systemRole: "general", slug: "general", name: "General",
      accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    const pod = await ctx.db.insert("communityChannels", { communityId, slug: "founders", name: "Founders", accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    await ctx.db.insert("communityPods", { communityId, channelId: pod, purpose: "Founders.", visibility: "listed", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityEvents", { communityId, createdByUserId: ownerId, title: "Group Call", startsAt: NOW + 86400000,
      timezone: "UTC", locationType: "online", visibility: "members", status: "live", recurrenceFrequency: "weekly", recurrenceInterval: 1, createdAt: NOW, updatedAt: NOW } as any);
    // Past the Events page's range: no chip.
    await ctx.db.insert("communityEvents", { communityId, createdByUserId: ownerId, title: "Far away", startsAt: NOW + 50 * 86400000,
      timezone: "UTC", locationType: "online", visibility: "members", status: "live", createdAt: NOW, updatedAt: NOW } as any);
    return { communityId };
  });
  const read = (who: string) => t.withIdentity({ subject: who }).query((api as any).communityEntityNames.listEntityNamesForViewer, { authSubject: who, communityId: ids.communityId });
  return { t, ids, read };
}

const names = (result: any) => (result.entries as any[]).map((row) => `${row.kind}:${row.name}`).sort();

test("a member gets what they can open: published courses and lessons, shared channels, upcoming events", async () => {
  const { read } = await fixture();
  const got = names(await read("member"));
  expect(got).toEqual(["channel:General", "course:Start here", "event:Group Call", "lesson:A tour"]);
  // Not the draft course, its lesson, or a pod they're not in.
  expect(got.join(" ")).not.toMatch(/Secret|Hidden|Founders/);
});

test("the host also gets drafts and pods; a repeating event appears once", async () => {
  const { read } = await fixture();
  const result = await read("owner");
  const got = names(result);
  expect(got).toEqual(expect.arrayContaining(["course:Secret plans", "lesson:Hidden lesson", "pod:Founders", "event:Group Call"]));
  expect(got.filter((name) => name === "event:Group Call")).toHaveLength(1);
  const lesson = (result.entries as any[]).find((row) => row.name === "A tour");
  expect(lesson.parentId).toBeTruthy();
});

test("someone outside the community gets nothing", async () => {
  const { read } = await fixture();
  await expect(read("outsider")).rejects.toThrow();
});

test("the card's facts are this reader's: progress, next lesson, video, description, when and where", async () => {
  const { t, ids, read } = await fixture();
  await t.run(async (ctx: any) => {
    const member = (await ctx.db.query("users").collect()).find((row: any) => row.authSubject === "member");
    const tour = (await ctx.db.query("communityResources").collect()).find((row: any) => row.title === "A tour");
    const module = await ctx.db.get(tour.moduleId);
    await ctx.db.patch(tour._id, { url: "https://youtu.be/dQw4w9WgXcQ" });
    await ctx.db.patch(module._id, { descriptionMd: "Your first ten minutes." });
    await ctx.db.insert("communityResources", { communityId: ids.communityId, createdByUserId: module.createdByUserId, moduleId: module._id, type: "post", role: "page", status: "draft",
      title: "Meet the guide", bodyMd: "Words.", bodyChars: 6, pinned: false, sortOrder: 2, sourceIngestionStatus: "not_required", sourceIngestionKind: "manual", createdAt: NOW, updatedAt: NOW });
    await ctx.db.patch(tour._id, { sortOrder: 1 });
    await ctx.db.insert("communityLessonProgress", { communityId: ids.communityId, userId: member._id, resourceId: tour._id, completedAt: NOW });
  });
  const rows = (await read("member")).entries as any[];
  const course = rows.find((row) => row.kind === "course" && row.name === "Start here");
  expect(course.facts).toMatchObject({ about: "Your first ten minutes.", lessons: 2, done: 1, nextLessonTitle: "Meet the guide" });
  expect(rows.find((row) => row.name === "A tour").facts).toMatchObject({ courseName: "Start here", finished: true, hasVideo: true });
  expect(rows.find((row) => row.name === "Group Call").facts).toMatchObject({ where: "online", repeats: "weekly" });
  // Someone else's progress is not this reader's.
  const hostCourse = ((await read("owner")).entries as any[]).find((row) => row.kind === "course" && row.name === "Start here");
  expect(hostCourse.facts.done).toBe(0);
});
