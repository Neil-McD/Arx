/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./directMessages.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "dm-typing-owner";
const MEMBER_SUBJECT = "dm-typing-member";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "DM typing owner",
      handle: "dm-typing-owner",
      normalizedHandle: "dm-typing-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "DM typing member",
      handle: "dm-typing-member",
      normalizedHandle: "dm-typing-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "dm-typing-community",
      name: "DM typing community",
      visibility: "published",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const canonicalIds = [String(ownerId), String(memberId)].sort();
    const conversationId = await ctx.db.insert("dmConversations", {
      kind: "direct",
      canonicalKey: `dm:direct:v1:${canonicalIds[0]}:${canonicalIds[1]}`,
      createdByUserId: ownerId,
      createdFromCommunityId: communityId,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: ownerId,
      status: "active",
      lastReadSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: memberId,
      status: "active",
      lastReadSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      conversationId,
      memberId,
      memberParticipantId,
      ownerId,
    };
  });
}

test("DM typing renews one lease row and clear removes it", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await asMember.mutation(api.directMessages.setDirectTyping, {
    conversationId: fixture.conversationId,
  });
  await asMember.mutation(api.directMessages.setDirectTyping, {
    conversationId: fixture.conversationId,
  });

  const rowsAfterRenewal = await t.run(async (ctx) =>
    await ctx.db
      .query("dmTypingPresence")
      .withIndex("by_conversation_user", (q) =>
        q
          .eq("conversationId", fixture.conversationId)
          .eq("userId", fixture.memberId),
      )
      .collect()
  );
  expect(rowsAfterRenewal).toHaveLength(1);
  expect(rowsAfterRenewal[0]?.displayUntil).toBeGreaterThan(Date.now());

  await asMember.mutation(api.directMessages.clearDirectTyping, {
    conversationId: fixture.conversationId,
  });
  const rowsAfterClear = await t.run(async (ctx) =>
    await ctx.db
      .query("dmTypingPresence")
      .withIndex("by_conversation_user", (q) =>
        q
          .eq("conversationId", fixture.conversationId)
          .eq("userId", fixture.memberId),
      )
      .collect()
  );
  expect(rowsAfterClear).toHaveLength(0);
});

test("DM typing projection fails closed after the candidate loses relationship access", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await asMember.mutation(api.directMessages.setDirectTyping, {
    conversationId: fixture.conversationId,
  });
  await expect(
    asOwner.query(api.directMessages.listDirectTyping, {
      conversationId: fixture.conversationId,
    }),
  ).resolves.toMatchObject({
    total_count: 1,
    users: [{ user_id: MEMBER_SUBJECT }],
  });

  await t.run(async (ctx) => {
    const nowMs = Date.now();
    await ctx.db.insert("dmBlocks", {
      blockerUserId: fixture.memberId,
      blockedUserId: fixture.ownerId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  await expect(
    asOwner.query(api.directMessages.listDirectTyping, {
      conversationId: fixture.conversationId,
    }),
  ).resolves.toEqual({
    total_count: 0,
    users: [],
  });
});

test("DM typing projection excludes a stale row from an inactive participant", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await asMember.mutation(api.directMessages.setDirectTyping, {
    conversationId: fixture.conversationId,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.memberParticipantId, {
      status: "left",
      updatedAt: Date.now(),
    });
  });

  await expect(
    asOwner.query(api.directMessages.listDirectTyping, {
      conversationId: fixture.conversationId,
    }),
  ).resolves.toEqual({
    total_count: 0,
    users: [],
  });
});
