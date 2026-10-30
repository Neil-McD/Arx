/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./authActor.ts",
  "./communityResources.ts",
  "./_generated/**/*.*s",
]);

const START = 1_790_000_000_000;
const MINUTE = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

async function createLesson(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "revision-owner",
      displayName: "Owner",
      handle: "revision-owner",
      normalizedHandle: "revision-owner",
      createdAt: START,
      updatedAt: START,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "revisions",
      name: "Revisions",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: START,
      updatedAt: START,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Course",
      sortOrder: 0,
      createdAt: START,
      updatedAt: START,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId,
      moduleId,
      createdByUserId: ownerId,
      type: "note",
      role: "page",
      status: "published",
      title: "Lesson one",
      bodyMd: "## Slides\n\nThe original body.",
      pinned: false,
      createdAt: START,
      updatedAt: START,
    });
    return { communityId, ownerId, resourceId };
  });
}

test("a lesson keeps the version before each editing session, and a restore can be undone", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START + MINUTE);
  const t = convexTest(schema, modules);
  const lesson = await createLesson(t);
  const owner = t.withIdentity({ subject: "revision-owner" });
  const save = (body: string, title?: string) => owner.mutation((api as any).communityResources.saveCommunityResource, {
    resourceId: lesson.resourceId,
    isPatch: true,
    payload: { body_md: body, ...(title ? { title } : {}) },
  });
  const list = () => owner.query((api as any).communityResources.listCommunityResourceRevisions, { resourceId: lesson.resourceId });

  // One editing session: autosave writes three times, one version is kept.
  await save("First edit.", "Lesson one, renamed");
  vi.setSystemTime(START + 2 * MINUTE);
  await save("First edit, more.");
  vi.setSystemTime(START + 3 * MINUTE);
  await save("First edit, done.");
  let versions = await list();
  expect(versions).toHaveLength(1);
  expect(versions[0]).toMatchObject({ title: "Lesson one", body_md: "## Slides\n\nThe original body." });

  // A later session keeps the version the first one ended with.
  vi.setSystemTime(START + 30 * MINUTE);
  await save("Second session.");
  versions = await list();
  expect(versions.map((version: any) => version.body_md)).toEqual(["First edit, done.", "## Slides\n\nThe original body."]);

  // Restoring the original keeps what it replaced, right away.
  vi.setSystemTime(START + 31 * MINUTE);
  await owner.mutation((api as any).communityResources.restoreCommunityResourceRevision, { revisionId: versions[1].id });
  versions = await list();
  expect(versions[0].body_md).toBe("Second session.");
  const restored = await t.run(async (ctx) => {
    const row = await ctx.db.get(lesson.resourceId);
    const content = await ctx.db
      .query("communityResourceContents")
      .withIndex("by_resource", (q) => q.eq("resourceId", lesson.resourceId))
      .first();
    return { title: row?.title, body: content?.bodyMd };
  });
  expect(restored).toEqual({ title: "Lesson one", body: "## Slides\n\nThe original body." });

  // An owner's agent sees the versions on the page and can read one's body.
  const read = await t.query((internal as any).communityResources.readCommunityResourceBuilderResourceInternal, {
    userId: lesson.ownerId,
    communityId: lesson.communityId,
    ref: String(lesson.resourceId),
  });
  expect(read.revisions[0]).toMatchObject({ id: versions[0].id, preview: "Second session." });
  const revision = await t.query((internal as any).communityResources.readCommunityResourceBuilderResourceInternal, {
    userId: lesson.ownerId,
    communityId: lesson.communityId,
    ref: versions[0].id,
  });
  expect(revision).toMatchObject({ ok: true, target_type: "revision", revision: { body_md: "Second session." } });
});
