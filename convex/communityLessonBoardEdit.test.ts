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
      authSubject: "board-owner",
      displayName: "Owner",
      handle: "board-owner",
      normalizedHandle: "board-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "board-edit",
      name: "Board edit",
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
const updateBoard = (api as any).communityResources.updateCommunityLessonBoard;

async function addLesson(owner: any, communityId: any, moduleId: any, title: string, lesson: Record<string, unknown>) {
  const created = await owner.mutation(saveResource, {
    resourceId: null,
    isPatch: false,
    payload: {
      community_id: communityId, type: "post", resource_role: "page", title, body_md: null, url: null,
      pinned: false, module_id: moduleId, lesson,
    },
  });
  return created.id as string;
}

test("the roadmap save moves, renumbers and renames lessons in one write", async () => {
  const t = convexTest(schema, modules);
  const { communityId, moduleId } = await createCourse(t);
  const owner = t.withIdentity({ subject: "board-owner" });
  const first = await addLesson(owner, communityId, moduleId, "Install", { stage: "Start", stage_order: 1, order: 1, minutes: 5, gate: true });
  const second = await addLesson(owner, communityId, moduleId, "Map", { stage: "Build", stage_order: 2, order: 1 });

  const result = await owner.mutation(updateBoard, {
    communityId,
    updates: [
      { resourceId: second, stage: "Get going", stageOrder: 1, order: 1, title: "Map your week" },
      { resourceId: first, stage: "Get going", stageOrder: 1, order: 2 },
    ],
  });

  expect(result).toEqual({ ok: true, updated: 2 });
  const rows = await t.run(async (ctx) => Promise.all([ctx.db.get(first as any), ctx.db.get(second as any)]));
  // Fields the board doesn't touch (minutes, gate) stay as they were.
  expect((rows[0] as any).lesson).toEqual({ stage: "Get going", stage_order: 1, order: 2, minutes: 5, gate: true });
  expect((rows[1] as any).lesson).toEqual({ stage: "Get going", stage_order: 1, order: 1 });
  expect((rows[1] as any).title).toBe("Map your week");
  expect((rows[0] as any).title).toBe("Install");
});

test("only a manager can edit the roadmap, and every lesson needs a stage", async () => {
  const t = convexTest(schema, modules);
  const { communityId, moduleId } = await createCourse(t);
  const owner = t.withIdentity({ subject: "board-owner" });
  const lesson = await addLesson(owner, communityId, moduleId, "Install", { stage: "Start", stage_order: 1, order: 1 });
  await t.run(async (ctx) => ctx.db.insert("users", {
    authSubject: "board-stranger", displayName: "Stranger", handle: "board-stranger", normalizedHandle: "board-stranger",
    createdAt: 1, updatedAt: 1,
  }));

  await expect(t.withIdentity({ subject: "board-stranger" }).mutation(updateBoard, {
    communityId, updates: [{ resourceId: lesson, stage: "Elsewhere" }],
  })).rejects.toThrow();
  await expect(owner.mutation(updateBoard, {
    communityId, updates: [{ resourceId: lesson, stage: "   " }],
  })).rejects.toThrow(/stage/);
  const row = await t.run(async (ctx) => ctx.db.get(lesson as any));
  expect((row as any).lesson.stage).toBe("Start");
});
