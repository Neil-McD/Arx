/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityChannels.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "channel-catalog-owner";
const ADMIN_SUBJECT = "channel-catalog-admin";
const MEMBER_SUBJECT = "channel-catalog-member";
const OUTSIDER_SUBJECT = "channel-catalog-outsider";

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 1_750_000_000_000;
    const createUser = async (authSubject: string) =>
      await ctx.db.insert("users", {
        authSubject,
        displayName: authSubject,
        handle: authSubject,
        normalizedHandle: authSubject,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const ownerId = await createUser(OWNER_SUBJECT);
    const adminId = await createUser(ADMIN_SUBJECT);
    const memberId = await createUser(MEMBER_SUBJECT);
    await createUser(OUTSIDER_SUBJECT);
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-catalog",
      name: "Channel catalog",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const [userId, role] of [
      [adminId, "admin"],
      [memberId, "member"],
    ] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role,
        accessSource: "manual_grant",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { communityId };
  });
}

test("owners and admins create ordered all-member channels while members can list them", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asAdmin = t.withIdentity({ subject: ADMIN_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "  Product   Design  ",
    }),
  ).resolves.toMatchObject({
    name: "Product Design",
    slug: "product-design",
    position: 1,
    is_general: false,
  });
  await expect(
    asAdmin.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Engineering",
    }),
  ).resolves.toMatchObject({
    name: "Engineering",
    slug: "engineering",
    position: 2,
    is_general: false,
  });

  await expect(
    asMember.query(api.communityChannels.listCommunityChannels, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    max_active_channels: 10,
    channels: [
      expect.objectContaining({
        name: "General",
        slug: "general",
        position: 0,
        is_general: true,
      }),
      expect.objectContaining({ name: "Product Design", position: 1 }),
      expect.objectContaining({ name: "Engineering", position: 2 }),
    ],
  });
});

test("channel creation is manager-only and listing requires community access", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const asOutsider = t.withIdentity({ subject: OUTSIDER_SUBJECT });

  await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Announcements",
  });
  await expect(
    asMember.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Member-created",
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOutsider.query(api.communityChannels.listCommunityChannels, {
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow("community_entitlement_required");
});

test("channel creation enforces the ten-channel cap and normalized-name uniqueness", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Product & Design",
  });
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: " product & DESIGN ",
    }),
  ).rejects.toThrow("community_channel_name_taken");
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Product Design",
    }),
  ).resolves.toMatchObject({ slug: "product-design-2" });

  for (let index = 3; index <= 9; index += 1) {
    await asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: `Channel ${index}`,
    });
  }
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Channel 10",
    }),
  ).rejects.toThrow("community_channel_limit_reached");

  const catalog = await asOwner.query(
    api.communityChannels.listCommunityChannels,
    { communityId: fixture.communityId },
  );
  expect(catalog.channels).toHaveLength(10);
});

test("channel names are required and bounded before any custom row is written", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "   ",
    }),
  ).rejects.toThrow("community_channel_name_required");
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "x".repeat(49),
    }),
  ).rejects.toThrow("community_channel_name_too_long");

  expect(await t.run(async (ctx) => await ctx.db.query("communityChannels").collect())).toEqual([]);
});
