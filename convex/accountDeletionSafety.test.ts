/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./account.ts", "./_generated/**/*.*s"]);
const DELETING_SUBJECT = "account-deletion-safety-user";
const SURVIVING_SUBJECT = "account-deletion-safety-survivor";
const LIFECYCLE_BLOCKER = "account_delete_lifecycle_migration_blocked";

test("account deletion quarantine never provisions a missing account", async () => {
  const t = convexTest(schema, modules);
  const unprovisionedSubject = "account-deletion-unprovisioned-user";
  const asUnprovisionedIdentity = t.withIdentity({ subject: unprovisionedSubject });

  await expect(
    asUnprovisionedIdentity.mutation(api.account.deleteOwnAccount, {
      authSubject: unprovisionedSubject,
    }),
  ).rejects.toThrow("user_not_found");

  expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toEqual([]);
  expect(await t.run(async (ctx) => await ctx.db.query("criticalAuditEvents").collect())).toEqual([]);
});

test("account deletion quarantine requires verified identity", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(api.account.deleteOwnAccount, {}),
  ).rejects.toThrow("verified_identity_required");

  expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toEqual([]);
});

test("account deletion is quarantined before shared state can be destroyed", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_000_000_000;

  const fixture = await t.run(async (ctx) => {
    const deletingUserId = await ctx.db.insert("users", {
      authSubject: DELETING_SUBJECT,
      displayName: "Deleting member",
      createdAt: now,
      updatedAt: now,
    });
    const survivingUserId = await ctx.db.insert("users", {
      authSubject: SURVIVING_SUBJECT,
      displayName: "Surviving member",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: survivingUserId,
      slug: "account-deletion-safety",
      name: "Account deletion safety",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: deletingUserId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const conversationId = await ctx.db.insert("dmConversations", {
      kind: "direct",
      canonicalKey: "account-deletion-safety-pair",
      createdByUserId: deletingUserId,
      createdFromCommunityId: communityId,
      lastSeq: 1,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const deletingParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: deletingUserId,
      status: "active",
      lastReadSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    const survivingParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: survivingUserId,
      status: "active",
      lastReadSeq: 0,
      createdAt: now,
      updatedAt: now,
    });
    const dmMessageId = await ctx.db.insert("dmMessages", {
      conversationId,
      seq: 1,
      senderType: "user",
      senderUserId: deletingUserId,
      contentJson: { text: "Shared history must survive." },
      createdAt: now,
      updatedAt: now,
    });
    const chatThreadId = await ctx.db.insert("communityChatThreads", {
      communityId,
      lastSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    const legacyMessageId = await ctx.db.insert("communityChatMessages", {
      threadId: chatThreadId,
      seq: 1,
      role: "user",
      senderUserId: deletingUserId,
      contentJson: { text: "Legacy shared contribution." },
      createdAt: now,
      updatedAt: now,
    });
    const interactionRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: deletingUserId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Canonical shared contribution.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "account-deletion-safety-root",
      createdAt: now,
      updatedAt: now,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: deletingUserId,
      type: "page",
      role: "page",
      status: "published",
      title: "Shared resource",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: deletingUserId,
      title: "Shared event",
      startsAt: now + 86_400_000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: now,
      updatedAt: now,
    });

    return {
      deletingUserId,
      survivingUserId,
      communityId,
      membershipId,
      conversationId,
      deletingParticipantId,
      survivingParticipantId,
      dmMessageId,
      chatThreadId,
      legacyMessageId,
      interactionRootId,
      resourceId,
      eventId,
    };
  });

  const stateBeforeRejection = await t.run(async (ctx) => ({
    rows: await Promise.all(Object.values(fixture).map((id) => ctx.db.get(id))),
    auditEvents: await ctx.db.query("criticalAuditEvents").collect(),
  }));

  const asDeletingUser = t.withIdentity({ subject: DELETING_SUBJECT });
  await expect(
    asDeletingUser.mutation(api.account.deleteOwnAccount, {
      authSubject: DELETING_SUBJECT,
    }),
  ).rejects.toMatchObject({
    data: {
      code: LIFECYCLE_BLOCKER,
      reason: LIFECYCLE_BLOCKER,
    },
  });

  const stateAfterRejection = await t.run(async (ctx) => {
    const rows = await Promise.all(Object.values(fixture).map((id) => ctx.db.get(id)));
    const auditEvents = await ctx.db.query("criticalAuditEvents").collect();
    return { rows, auditEvents };
  });

  expect(stateAfterRejection).toEqual(stateBeforeRejection);
});
