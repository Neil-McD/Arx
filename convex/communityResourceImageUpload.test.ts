/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./authActor.ts",
  "./communityResources.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const user = (name: string) => ctx.db.insert("users", {
      authSubject: `lesson-image-${name}-${suffix}`,
      displayName: name,
      handle: `lesson-image-${name}-${suffix}`,
      normalizedHandle: `lesson-image-${name}-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const ownerId = await user("owner");
    const memberId = await user("member");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `lesson-image-${suffix}`,
      name: "Lesson images",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId };
  });
}

async function storeBlob(t: ReturnType<typeof convexTest>, blob: Blob) {
  return await t.run(async (ctx) => {
    const id = await ctx.storage.store(blob);
    await ctx.db.patch(id as any, { contentType: blob.type } as any);
    return id;
  });
}

const resolveImage = (api as any).communityResources.resolveCommunityResourceImageUrl;

test("an owner's uploaded picture comes back as an address for the lesson", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t, "ok");
  const storageId = await storeBlob(t, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  const owner = t.withIdentity({ subject: "lesson-image-owner-ok" });
  const result = await owner.mutation(resolveImage, { communityId, storageId });
  expect(result.problem).toBeNull();
  expect(String(result.url)).toMatch(/^https?:\/\//);
});

test("a member can't turn an upload into a lesson image", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t, "member");
  const storageId = await storeBlob(t, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  const member = t.withIdentity({ subject: "lesson-image-member-member" });
  await expect(member.mutation(resolveImage, { communityId, storageId })).rejects.toThrow();
});

test("anything that isn't a picture is refused and deleted", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t, "type");
  const storageId = await storeBlob(t, new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }));
  const owner = t.withIdentity({ subject: "lesson-image-owner-type" });
  expect(await owner.mutation(resolveImage, { communityId, storageId })).toEqual({ url: null, problem: "community_resource_image_type" });
  const left = await t.run(async (ctx) => ctx.db.system.get(storageId));
  expect(left).toBeNull();
});
