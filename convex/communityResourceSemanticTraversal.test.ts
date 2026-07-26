/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import {
  listCommunityResourceSemanticDirectoryCore,
} from "./communityResources";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityResources.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "resource-semantic-owner",
      displayName: "Resource semantic owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "resource-semantic-member",
      displayName: "Resource semantic member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "resource-semantic",
      name: "Resource semantic",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "resource-semantic-other",
      name: "Resource semantic other",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const insertModule = async (
      name: string,
      status: "draft" | "live",
      sortOrder: number,
      targetCommunityId = communityId,
    ) =>
      await ctx.db.insert("communityResourceModules", {
        communityId: targetCommunityId,
        createdByUserId: ownerId,
        status,
        name,
        sortOrder,
        createdAt: nowMs + sortOrder,
        updatedAt: nowMs + sortOrder,
      });
    const firstModuleId = await insertModule("Start Here", "live", 1);
    const draftModuleId = await insertModule("Private Drafts", "draft", 2);
    const collisionModuleId = await insertModule("Start Here", "live", 3);
    const otherCommunityModuleId = await insertModule(
      "Other Community",
      "live",
      1,
      otherCommunityId,
    );
    const insertResource = async (args: {
      moduleId: typeof firstModuleId;
      title: string;
      role: "page" | "source";
      sortOrder: number;
      bodyChars: number;
    }) =>
      await ctx.db.insert("communityResources", {
        communityId,
        moduleId: args.moduleId,
        createdByUserId: ownerId,
        type: "post",
        role: args.role,
        status: "published",
        title: args.title,
        bodyChars: args.bodyChars,
        pinned: false,
        sortOrder: args.sortOrder,
        createdAt: nowMs + args.sortOrder,
        updatedAt: nowMs + args.sortOrder,
      });
    const firstPageId = await insertResource({
      moduleId: firstModuleId,
      title: "Operating Model",
      role: "page",
      sortOrder: 1,
      bodyChars: 100,
    });
    await insertResource({
      moduleId: firstModuleId,
      title: "Raw Source",
      role: "source",
      sortOrder: 2,
      bodyChars: 100,
    });
    await insertResource({
      moduleId: firstModuleId,
      title: "Empty Page",
      role: "page",
      sortOrder: 3,
      bodyChars: 0,
    });
    const collisionPageId = await insertResource({
      moduleId: firstModuleId,
      title: "Operating Model",
      role: "page",
      sortOrder: 4,
      bodyChars: 80,
    });
    await insertResource({
      moduleId: draftModuleId,
      title: "Draft Module Page",
      role: "page",
      sortOrder: 1,
      bodyChars: 100,
    });
    return {
      communityId,
      otherCommunityModuleId,
      membershipId,
      memberId,
      firstModuleId,
      firstPageId,
      collisionPageId,
    };
  });
}

async function drainDirectory(args: {
  t: ReturnType<typeof convexTest>;
  userId: any;
  communityId: any;
  moduleId?: any;
}) {
  const entries: any[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page = await args.t.run(async (ctx) =>
      await listCommunityResourceSemanticDirectoryCore({
        ctx,
        userId: args.userId,
        communityId: args.communityId,
        moduleId: args.moduleId,
        cursor,
        limit: 1,
      }),
    );
    entries.push(...page.entries);
    if (!page.truncated) {
      expect(page.next_cursor).toBeNull();
      return entries;
    }
    expect(page.next_cursor).toBeTruthy();
    cursor = page.next_cursor;
  }
  throw new Error("semantic resource traversal did not terminate");
}

test("resource semantic traversal is bounded, complete, collision-safe, and revocable", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  const moduleEntries = await drainDirectory({
    t,
    userId: fixture.memberId,
    communityId: fixture.communityId,
  });
  expect(moduleEntries).toHaveLength(2);
  expect(moduleEntries.map((entry) => entry.name)).toEqual([
    "Start Here",
    "Start Here",
  ]);
  expect(new Set(moduleEntries.map((entry) => entry.directory_uri)).size).toBe(2);
  expect(new Set(moduleEntries.map((entry) => entry.directory_path))).toEqual(
    new Set(["/start-here"]),
  );

  const pageEntries = await drainDirectory({
    t,
    userId: fixture.memberId,
    communityId: fixture.communityId,
    moduleId: fixture.firstModuleId,
  });
  expect(pageEntries).toHaveLength(2);
  expect(pageEntries.map((entry) => entry.title)).toEqual([
    "Operating Model",
    "Operating Model",
  ]);
  expect(new Set(pageEntries.map((entry) => entry.ref))).toEqual(
    new Set([
      `resource:${fixture.firstPageId}`,
      `resource:${fixture.collisionPageId}`,
    ]),
  );
  expect(new Set(pageEntries.map((entry) => entry.directory_uri)).size).toBe(2);
  expect(new Set(pageEntries.map((entry) => entry.directory_path))).toEqual(
    new Set(["/start-here/operating-model"]),
  );

  await expect(
    t.run(async (ctx) =>
      await listCommunityResourceSemanticDirectoryCore({
        ctx,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        moduleId: fixture.otherCommunityModuleId,
      }),
    ),
  ).rejects.toThrow("community_resource_semantic_module_not_found");

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.membershipId, {
      active: false,
      revokedAt: 1_750_000_000_100,
      revokedReason: "semantic_resource_traversal_test",
    });
  });
  await expect(
    t.run(async (ctx) =>
      await listCommunityResourceSemanticDirectoryCore({
        ctx,
        userId: fixture.memberId,
        communityId: fixture.communityId,
      }),
    ),
  ).rejects.toThrow("community_entitlement_required");
});
