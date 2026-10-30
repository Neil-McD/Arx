/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "./_generated/**/*.*s",
]);

async function createCourse(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "add-lesson-owner",
      displayName: "Owner",
      handle: "add-lesson-owner",
      normalizedHandle: "add-lesson-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "add-lesson",
      name: "Add lesson",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "draft",
      name: "Get set up",
      sortOrder: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, moduleId };
  });
}

const saveResource = (api as any).communityResources.saveCommunityResource;

test("a page added as a lesson is saved with its lesson fields", async () => {
  const t = convexTest(schema, modules);
  const { communityId, moduleId } = await createCourse(t);
  const owner = t.withIdentity({ subject: "add-lesson-owner" });
  const created = await owner.mutation(saveResource, {
    resourceId: null,
    isPatch: false,
    payload: {
      community_id: communityId,
      type: "post",
      resource_role: "page",
      title: "Untitled lesson",
      body_md: null,
      url: null,
      pinned: false,
      module_id: moduleId,
      lesson: { order: 3 },
    },
  });
  const row = await t.run(async (ctx) => ctx.db.get(created.id));
  expect((row as any).lesson).toEqual({ order: 3 });
});
