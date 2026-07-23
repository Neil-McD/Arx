/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityInteractionAttachmentCutover.ts",
  "./_generated/**/*.*s",
]);

test("legacy attachment cutover is expectation-locked and idempotent", async () => {
  const previousDeploymentKind = process.env.POLYNET_DEPLOYMENT_KIND;
  process.env.POLYNET_DEPLOYMENT_KIND = "staging";
  try {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const now = 1_750_000_000_000;
      const userId = await ctx.db.insert("users", {
        authSubject: "interaction-attachment-cutover-user",
        displayName: "Interaction attachment cutover user",
        createdAt: now,
        updatedAt: now,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId: userId,
        slug: "interaction-attachment-cutover",
        name: "Interaction attachment cutover",
        visibility: "unlisted",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      const threadId = await ctx.db.insert("communityChatThreads", {
        communityId,
        lastSeq: 4,
        createdAt: now,
        updatedAt: now,
      });
      const expectedTargets = [];
      for (let index = 0; index < 4; index += 1) {
        const storageId = await ctx.storage.store(
          new Blob([`fixture-${index}`], { type: "image/png" }),
        );
        const messageId = await ctx.db.insert("communityChatMessages", {
          threadId,
          seq: index + 1,
          role: "user",
          senderUserId: userId,
          contentJson: {
            text: `Fixture ${index}`,
            attachments: [{
              id: `fixture-${index}`,
              name: `fixture-${index}.png`,
              type: "image",
              mime: "image/png",
              size: 9,
              storageId,
              data_url: "data:image/png;base64,Zml4dHVyZQ==",
            }],
          },
          createdAt: now + index,
          updatedAt: now + index,
        });
        const rootId = await ctx.db.insert("communityInteractionRoots", {
          communityId,
          actorType: "human",
          actorUserId: userId,
          kind: "discussion",
          status: "live",
          visibilityScope: "community",
          contentSummary: `Fixture ${index}`,
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey: `attachment-cutover-${index}`,
          createdAt: now + index,
          updatedAt: now + index,
        });
        await ctx.db.insert("communityInteractionLegacyChatLinks", {
          communityId,
          threadId,
          messageId,
          linkKind: "root",
          rootId,
          createdAt: now + index,
          updatedAt: now + index,
        });
        expectedTargets.push({ messageId, rootId, storageId });
      }
      return { expectedTargets };
    });

    const before = await t.query(
      internal.communityInteractionAttachmentCutover.auditLegacyInteractionAttachmentCutoverInternal,
      {
        expectedTargets: fixture.expectedTargets,
        expectedCanonicalTotal: 0,
      },
    );
    expect(before).toMatchObject({
      legacyAttachmentMessageCount: 4,
      canonicalAttachmentCount: 0,
    });

    const wrongTargets = fixture.expectedTargets.map((target, index) =>
      index === 0
        ? { ...target, storageId: fixture.expectedTargets[1].storageId }
        : target
    );
    await expect(
      t.mutation(
        internal.communityInteractionAttachmentCutover.migrateLegacyInteractionAttachmentsInternal,
        {
          dryRun: true,
          expectedTargets: wrongTargets,
          expectedCanonicalTotal: 0,
        },
      ),
    ).rejects.toThrow("community_interaction_attachment_cutover_duplicate_storageId");

    const dryRun = await t.mutation(
      internal.communityInteractionAttachmentCutover.migrateLegacyInteractionAttachmentsInternal,
      {
        dryRun: true,
        expectedTargets: fixture.expectedTargets,
        expectedCanonicalTotal: 0,
      },
    );
    expect(dryRun).toMatchObject({
      dryRun: true,
      createdCount: 0,
      canonicalAttachmentCount: 0,
    });

    const migrated = await t.mutation(
      internal.communityInteractionAttachmentCutover.migrateLegacyInteractionAttachmentsInternal,
      {
        dryRun: false,
        expectedTargets: fixture.expectedTargets,
        expectedCanonicalTotal: 0,
      },
    );
    expect(migrated).toMatchObject({
      dryRun: false,
      createdCount: 4,
      canonicalAttachmentCount: 4,
    });

    const canonicalRows = await t.run(async (ctx) =>
      await ctx.db.query("communityInteractionAttachments").collect()
    );
    expect(canonicalRows).toHaveLength(4);
    expect(canonicalRows.every((row) =>
      row.status === "uploaded"
      && row.attachmentKind === "image"
      && Boolean(row.storageId)
      && !row.externalUrl
    )).toBe(true);

    const replay = await t.mutation(
      internal.communityInteractionAttachmentCutover.migrateLegacyInteractionAttachmentsInternal,
      {
        dryRun: false,
        expectedTargets: fixture.expectedTargets,
        expectedCanonicalTotal: 4,
      },
    );
    expect(replay).toMatchObject({
      dryRun: false,
      createdCount: 0,
      canonicalAttachmentCount: 4,
    });
  } finally {
    if (previousDeploymentKind === undefined) delete process.env.POLYNET_DEPLOYMENT_KIND;
    else process.env.POLYNET_DEPLOYMENT_KIND = previousDeploymentKind;
  }
});
