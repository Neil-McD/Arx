/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityInteractionResidueCleanup.ts",
  "./_generated/**/*.*s",
]);

test("legacy featured and reaction cleanup is expectation-locked and preserves its targets", async () => {
  const previousDeploymentKind = process.env.POLYNET_DEPLOYMENT_KIND;
  process.env.POLYNET_DEPLOYMENT_KIND = "staging";
  try {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const now = 1_750_000_000_000;
      const userId = await ctx.db.insert("users", {
        authSubject: "interaction-residue-cleanup-user",
        displayName: "Interaction residue cleanup user",
        createdAt: now,
        updatedAt: now,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId: userId,
        slug: "interaction-residue-cleanup",
        name: "Interaction residue cleanup",
        visibility: "unlisted",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      const threadId = await ctx.db.insert("communityChatThreads", {
        communityId,
        lastSeq: 2,
        createdAt: now,
        updatedAt: now,
      });
      const featuredMessageId = await ctx.db.insert("communityChatMessages", {
        threadId,
        seq: 1,
        role: "user",
        senderUserId: userId,
        contentJson: { text: "Featured history", attachments: [{ id: "legacy", storageId: "legacy" }] },
        createdAt: now,
        updatedAt: now,
      });
      const reactionMessageId = await ctx.db.insert("communityChatMessages", {
        threadId,
        seq: 2,
        role: "user",
        senderUserId: userId,
        contentJson: { text: "Reaction history" },
        createdAt: now,
        updatedAt: now,
      });
      const featuredRootId = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        actorType: "human",
        actorUserId: userId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Featured history",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "featured-history",
        createdAt: now,
        updatedAt: now,
      });
      const reactionRootId = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        actorType: "human",
        actorUserId: userId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Reaction history",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "reaction-history",
        createdAt: now,
        updatedAt: now,
      });
      const featuredLinkId = await ctx.db.insert("communityInteractionLegacyChatLinks", {
        communityId,
        threadId,
        messageId: featuredMessageId,
        linkKind: "root",
        rootId: featuredRootId,
        createdAt: now,
        updatedAt: now,
      });
      const reactionLinkId = await ctx.db.insert("communityInteractionLegacyChatLinks", {
        communityId,
        threadId,
        messageId: reactionMessageId,
        linkKind: "root",
        rootId: reactionRootId,
        createdAt: now,
        updatedAt: now,
      });
      const featuredId = await ctx.db.insert("communityFeaturedMessages", {
        communityId,
        messageId: featuredMessageId,
        featuredByUserId: userId,
        createdAt: now,
      });
      const reactionId = await ctx.db.insert("communityMessageReactions", {
        messageId: reactionMessageId,
        userId,
        emoji: "🔥",
        createdAt: now,
      });
      return {
        featuredId,
        reactionId,
        preservedIds: [
          featuredMessageId,
          reactionMessageId,
          featuredRootId,
          reactionRootId,
          featuredLinkId,
          reactionLinkId,
        ],
      };
    });

    const args = {
      dryRun: true,
      expectedFeaturedIds: [fixture.featuredId],
      expectedReactionIds: [fixture.reactionId],
      expectedFeaturedAttachmentMessageCount: 1,
      expectedReactionAttachmentMessageCount: 0,
    };
    await expect(
      t.mutation(
        internal.communityInteractionResidueCleanup.deleteLegacyFeaturedReactionResidueInternal,
        { ...args, expectedReactionIds: [] },
      ),
    ).rejects.toThrow("community_interaction_residue_cleanup_expectation_changed");
    expect(await t.run(async (ctx) => ctx.db.get(fixture.reactionId))).not.toBeNull();

    const dryRun = await t.mutation(
      internal.communityInteractionResidueCleanup.deleteLegacyFeaturedReactionResidueInternal,
      args,
    );
    expect(dryRun).toMatchObject({ dryRun: true, deletedCount: 0 });

    const deleted = await t.mutation(
      internal.communityInteractionResidueCleanup.deleteLegacyFeaturedReactionResidueInternal,
      { ...args, dryRun: false },
    );
    expect(deleted).toMatchObject({ dryRun: false, deletedCount: 2 });
    expect(await t.run(async (ctx) => ctx.db.get(fixture.featuredId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(fixture.reactionId))).toBeNull();
    for (const id of fixture.preservedIds) {
      expect(await t.run(async (ctx) => ctx.db.get(id as any))).not.toBeNull();
    }

    const replay = await t.mutation(
      internal.communityInteractionResidueCleanup.deleteLegacyFeaturedReactionResidueInternal,
      {
        dryRun: false,
        expectedFeaturedIds: [],
        expectedReactionIds: [],
        expectedFeaturedAttachmentMessageCount: 0,
        expectedReactionAttachmentMessageCount: 0,
      },
    );
    expect(replay).toMatchObject({ dryRun: false, deletedCount: 0 });
  } finally {
    if (previousDeploymentKind === undefined) delete process.env.POLYNET_DEPLOYMENT_KIND;
    else process.env.POLYNET_DEPLOYMENT_KIND = previousDeploymentKind;
  }
});
