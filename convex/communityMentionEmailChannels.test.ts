/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityMentionEmails.ts",
  "./_generated/**/*.*s",
]);

test("mention email suppression reads the exact source channel cursor", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "mention-email-channel-owner",
      displayName: "Mention email owner",
      handle: "mention-email-channel-owner",
      normalizedHandle: "mention-email-channel-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "mention-email-channel-member",
      displayName: "Mention email member",
      handle: "mention-email-channel-member",
      normalizedHandle: "mention-email-channel-member",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "mention-email-channel",
      name: "Mention email channel",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      active: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Custom mention",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "mention-email-custom-root",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const mentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId,
      channelId,
      rootId,
      mentionKind: "user",
      mentionedUserId: memberId,
      notifyState: "pending",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.insert("communityReadCursors", {
      communityId,
      channelId,
      userId: memberId,
      streamKind: "chat",
      seenThroughAt: 2_000,
      createdAt: 2_100,
      updatedAt: 2_100,
    });
    return { mentionId };
  });

  const jobs = await t.query(
    internal.communityMentionEmails.listPendingMentionEmailJobsInternal,
    { nowMs: 1_000_000 },
  );
  expect(jobs).toEqual([
    expect.objectContaining({
      mentionId: String(fixture.mentionId),
      read: true,
      suppressed: false,
    }),
  ]);
});
