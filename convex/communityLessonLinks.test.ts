/// <reference types="vite/client" />
// Mentions (shared/communityLessonLinks.ts): the map says when its lesson
// links are behind, a refresh works them out in the background, and the map
// then carries them.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("users", { authSubject: "outsider", displayName: "Outsider", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Kiln", slug: "kiln", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    const course = (name: string, sortOrder: number, status = "live") => ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status, name, sortOrder, createdAt: NOW, updatedAt: NOW });
    const start = await course("Start here", 1);
    const build = await course("Build your community", 2);
    const secret = await course("Secret plans", 3, "draft");
    const lesson = async (moduleId: any, title: string, body: string, sortOrder: number) => {
      const id = await ctx.db.insert("communityResources", { communityId, createdByUserId: ownerId, moduleId, type: "post", role: "page", status: "draft",
        title, bodyChars: body.length, bodyHash: `h:${title}:${body.length}`, sortOrder, pinned: false, sourceIngestionStatus: "not_required", sourceIngestionKind: "manual", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("communityResourceContents", { communityId, resourceId: id, bodyMd: body, bodyChars: body.length, bodyHash: `h:${title}:${body.length}`, createdAt: NOW, updatedAt: NOW });
      return id;
    };
    const tour = await lesson(start, "A tour", "Where everything is.", 1);
    const path = await lesson(start, "Pick your path", "The course **Build your community** is next. Or reread \"A tour\". Never Secret plans.", 2);
    const paid = await lesson(build, "Get paid", "Before this, read Pick your path.", 1);
    await lesson(secret, "Hidden lesson", "See Get paid.", 1);
    return { communityId, start, build, tour, path, paid };
  });
  const as = (who: string) => t.withIdentity({ subject: who });
  const map = () => as("owner").query((api as any).communityBrain.getBrainMap, { authSubject: "owner", communityId: ids.communityId });
  const refresh = (who = "owner") => as(who).mutation((api as any).communityLessonLinks.refreshLessonLinks, { authSubject: who, communityId: ids.communityId });
  const settle = () => t.finishAllScheduledFunctions(() => vi.runAllTimers());
  return { t, ids, map, refresh, settle };
}

const pairs = (map: any) => (map.mentions as any[]).map((link) => `${link.from}>${link.to}`).sort();

test("a new community's map says its links are behind; a refresh works them out", async () => {
  const { ids, map, refresh, settle } = await fixture();
  const before = await map();
  expect(before.mentions).toEqual([]);
  expect(before.mentions_stale).toBe(true);

  expect(await refresh()).toEqual({ started: true });
  await settle();
  const after = await map();
  expect(after.mentions_stale).toBe(false);
  expect(pairs(after)).toEqual([
    `resource:${ids.paid}>resource:${ids.path}`,
    `resource:${ids.path}>course:${ids.build}`,
    `resource:${ids.path}>resource:${ids.tour}`,
  ].sort());
  // Nothing about the draft course: not its name, not its lesson.
  expect(JSON.stringify(after.mentions)).not.toMatch(/secret/i);

  // Fresh: asking again does nothing.
  expect(await refresh()).toEqual({ started: false });
});

test("changing a lesson's words makes the map stale again, and the next refresh catches up", async () => {
  const { t, ids, map, refresh, settle } = await fixture();
  await refresh();
  await settle();
  await t.run(async (ctx: any) => {
    const body = "Nothing to see.";
    await ctx.db.patch(ids.paid, { bodyHash: "h:changed", bodyChars: body.length });
    const content = await ctx.db.query("communityResourceContents").withIndex("by_resource", (q: any) => q.eq("resourceId", ids.paid)).first();
    await ctx.db.patch(content._id, { bodyMd: body, bodyHash: "h:changed" });
  });
  const stale = await map();
  expect(stale.mentions_stale).toBe(true);
  // Until it is rebuilt the old links still show.
  expect(stale.mentions).toHaveLength(3);
  await refresh();
  await settle();
  const fresh = await map();
  expect(fresh.mentions_stale).toBe(false);
  expect(pairs(fresh)).not.toContain(`resource:${ids.paid}>resource:${ids.path}`);
  expect(fresh.mentions).toHaveLength(2);
});

test("a rename is caught, and a link to a lesson that is gone is not sent", async () => {
  const { t, ids, map, refresh, settle } = await fixture();
  await refresh();
  await settle();
  await t.run(async (ctx: any) => { await ctx.db.delete(ids.tour); });
  const gone = await map();
  expect(gone.mentions_stale).toBe(true);
  expect(JSON.stringify(gone.mentions)).not.toContain(String(ids.tour));
});

test("someone outside the community cannot ask for a refresh", async () => {
  const { refresh } = await fixture();
  await expect(refresh("outsider")).rejects.toThrow();
});
