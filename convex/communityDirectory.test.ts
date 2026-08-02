/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityDirectory.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "directory-owner";

async function createUser(
  t: ReturnType<typeof convexTest>,
  authSubject: string,
  createdAt: number,
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject,
      displayName: authSubject,
      handle: authSubject,
      normalizedHandle: authSubject,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

test("member directory pages recent activity before never-active members without materializing the roster", async () => {
  const t = convexTest(schema, modules);
  const ownerId = await createUser(t, OWNER_SUBJECT, 100);
  const fixture = await t.run(async (ctx) => {
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "stable-directory",
      name: "Stable directory",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 31,
      createdAt: 100,
      updatedAt: 100,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: ownerId,
      role: "admin",
      accessSource: "manual_grant",
      active: true,
      createdAt: 200,
      updatedAt: 200,
    });

    const activeMembershipIds: string[] = [];
    const activeUserIds: any[] = [];
    for (let index = 0; index < 30; index += 1) {
      const userId = await ctx.db.insert("users", {
        authSubject: `directory-member-${index}`,
        displayName: `Directory member ${index}`,
        handle: `directory-member-${index}`,
        normalizedHandle: `directory-member-${index}`,
        createdAt: 1_000 + index,
        updatedAt: 1_000 + index,
      });
      const membershipId = await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        createdAt: 1_000 + index,
        updatedAt: 1_000 + index,
      });
      if (index < 27) {
        await ctx.db.insert("communityPresence", {
          communityId,
          userId,
          lastSeenAt: 100_000 + index,
          activeUntil: 200_000 + index,
          createdAt: 100_000 + index,
          updatedAt: 100_000 + index,
        });
      }
      activeMembershipIds.push(String(membershipId));
      activeUserIds.push(userId);
    }

    const revokedUserId = await ctx.db.insert("users", {
      authSubject: "directory-revoked",
      displayName: "Directory revoked",
      handle: "directory-revoked",
      normalizedHandle: "directory-revoked",
      createdAt: 1_015.5,
      updatedAt: 1_015.5,
    });
    const revokedMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: revokedUserId,
      role: "member",
      accessSource: "free_grant",
      active: false,
      revokedAt: 2_000,
      createdAt: 1_015.5,
      updatedAt: 2_000,
    });
    await ctx.db.insert("communityPresence", {
      communityId,
      userId: revokedUserId,
      lastSeenAt: 950_000,
      activeUntil: 1_000_000,
      createdAt: 950_000,
      updatedAt: 950_000,
    });

    return {
      communityId,
      activeMembershipIds,
      activeUserIds,
      revokedMembershipId: String(revokedMembershipId),
    };
  });
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  const firstPage = await asOwner.query(
    api.communityDirectory.listCommunityDirectoryPage,
    {
      communityId: fixture.communityId,
      cursor: null,
      pageSize: 10,
    },
  );
  expect(firstPage.page.map((row) => row.id)).toEqual(
    fixture.activeMembershipIds.slice(18, 27).reverse(),
  );
  expect(firstPage.page[0]?.last_active_at).toBe(new Date(100_026).toISOString());
  expect(firstPage.totalCount).toBe(31);
  expect(firstPage.continueCursor).toEqual(expect.any(String));
  expect(Number.isFinite(Number(firstPage.continueCursor))).toBe(false);

  const rows = [...firstPage.page];
  let cursor = firstPage.continueCursor;
  let isDone = firstPage.isDone;
  while (cursor && !isDone) {
    const nextPage = await asOwner.query(
      api.communityDirectory.listCommunityDirectoryPage,
      {
        communityId: fixture.communityId,
        cursor,
        pageSize: 10,
      },
    );
    expect(nextPage.totalCount).toBe(31);
    rows.push(...nextPage.page);
    cursor = nextPage.continueCursor;
    isDone = nextPage.isDone;
  }

  expect(rows.map((row) => row.id)).toEqual([
    ...fixture.activeMembershipIds.slice(0, 27).reverse(),
    `owner:${String(fixture.communityId)}`,
    ...fixture.activeMembershipIds.slice(27),
  ]);
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  expect(rows.some((row) => row.id === fixture.revokedMembershipId)).toBe(false);
  expect(rows.slice(0, 27).every((row) => Boolean(row.last_active_at))).toBe(true);
  expect(rows.slice(27).every((row) => row.last_active_at === null)).toBe(true);

  await t.run(async (ctx) => {
    await ctx.db.insert("communityPresence", {
      communityId: fixture.communityId,
      userId: fixture.activeUserIds[29],
      lastSeenAt: 900_000,
      activeUntil: 1_000_000,
      createdAt: 900_000,
      updatedAt: 900_000,
    });
  });
  const refreshedFirstPage = await asOwner.query(
    api.communityDirectory.listCommunityDirectoryPage,
    {
      communityId: fixture.communityId,
      cursor: null,
      pageSize: 10,
    },
  );
  expect(refreshedFirstPage.page[0]?.id).toBe(fixture.activeMembershipIds[29]);
  expect(refreshedFirstPage.page[0]?.last_active_at).toBe(new Date(900_000).toISOString());

  await expect(
    asOwner.query(api.communityDirectory.listCommunityDirectoryPage, {
      communityId: fixture.communityId,
      cursor: "10",
      pageSize: 10,
    }),
  ).rejects.toThrow("community_directory_cursor_invalid");
});

test("member directory fails closed and never scans to invent a missing durable count", async () => {
  const t = convexTest(schema, modules);
  const ownerId = await createUser(t, OWNER_SUBJECT, 100);
  const outsiderId = await createUser(t, "directory-outsider", 200);
  const communityId = await t.run(async (ctx) =>
    await ctx.db.insert("communities", {
      ownerId,
      slug: "directory-without-count",
      name: "Directory without count",
      visibility: "unlisted",
      entryPolicy: "open",
      createdAt: 100,
      updatedAt: 100,
    }),
  );

  await expect(
    t.withIdentity({ subject: OWNER_SUBJECT }).query(
      api.communityDirectory.listCommunityDirectoryPage,
      {
        communityId,
        cursor: null,
        pageSize: 10,
      },
    ),
  ).resolves.toMatchObject({
    totalCount: null,
    page: [{ id: `owner:${String(communityId)}` }],
  });

  await expect(
    t.withIdentity({ subject: "directory-outsider" }).query(
      api.communityDirectory.listCommunityDirectoryPage,
      {
        userId: outsiderId,
        communityId,
        cursor: null,
        pageSize: 10,
      },
    ),
  ).rejects.toThrow("community_entitlement_required");
});
