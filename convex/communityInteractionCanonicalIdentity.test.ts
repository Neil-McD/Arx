/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  const subject = "community-interaction-canonical-identity-owner";
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: subject,
      displayName: "Canonical identity owner",
      handle: "canonical-identity-owner",
      normalizedHandle: "canonical-identity-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: ownerId,
      displayName: "Canonical identity owner",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const [documentKey, documentVersion] of [
      ["terms_of_service", "terms_of_service_v1"],
      ["privacy_ai_data_policy", "privacy_ai_data_policy_v1"],
    ] as const) {
      await ctx.db.insert("legalAcceptances", {
        userId: ownerId,
        documentKey,
        documentVersion,
        acceptedAt: nowMs,
        source: "test",
        createdAt: nowMs,
      });
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "canonical-identity",
      name: "Canonical identity",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "canonical-identity-other",
      name: "Canonical identity other",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const insertRoot = async (
      suffix: string,
      status: "live" | "hidden" | "deleted" = "live",
      visibilityScope: "admin" | "community" = "community",
    ) =>
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status,
        visibilityScope,
        contentSummary: `Root ${suffix}`,
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: `canonical-identity-root-${suffix}`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const rootId = await insertRoot("primary");
    const otherRootId = await insertRoot("other");
    const hiddenRootId = await insertRoot("hidden", "hidden");
    const deletedRootId = await insertRoot("deleted", "deleted");
    const adminRootId = await insertRoot("admin", "live", "admin");
    await ctx.db.insert("communityInteractionContentBlocks", {
      communityId,
      rootId,
      blockOrder: 0,
      blockType: "markdown_text",
      text: "Original canonical text",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    let replySeq = 0;
    const insertReply = async (
      suffix: string,
      root: typeof rootId,
      status: "live" | "hidden" | "deleted" = "live",
      visibilityScope: "admin" | "community" = "community",
      targetCommunityId = communityId,
    ) =>
      await ctx.db.insert("communityInteractionReplies", {
        communityId: targetCommunityId,
        rootId: root,
        seq: ++replySeq,
        actorType: "human",
        actorUserId: ownerId,
        status,
        visibilityScope,
        contentSummary: `Reply ${suffix}`,
        reactionSummary: [],
        idempotencyKey: `canonical-identity-reply-${suffix}`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const liveTargetId = await insertReply("live", rootId);
    const hiddenTargetId = await insertReply("hidden", rootId, "hidden");
    const deletedTargetId = await insertReply("deleted", rootId, "deleted");
    const adminTargetId = await insertReply("admin", rootId, "live", "admin");
    const crossRootTargetId = await insertReply("cross-root", otherRootId);
    const crossCommunityTargetId = await insertReply(
      "cross-community",
      rootId,
      "live",
      "community",
      otherCommunityId,
    );
    const missingTargetId = await insertReply("missing", rootId);
    await ctx.db.delete(missingTargetId);

    const legacyThreadId = await ctx.db.insert("communityChatThreads", {
      communityId,
      lastSeq: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const legacyContent = {
      text: "Original legacy text",
      attachments: [{ name: "preserve-me.png", storage_id: "legacy-storage" }],
    };
    const legacyMessageId = await ctx.db.insert("communityChatMessages", {
      threadId: legacyThreadId,
      seq: 1,
      role: "user",
      senderUserId: ownerId,
      contentJson: legacyContent,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityInteractionLegacyChatLinks", {
      communityId,
      threadId: legacyThreadId,
      messageId: legacyMessageId,
      linkKind: "root",
      rootId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      subject,
      communityId,
      rootId,
      otherRootId,
      hiddenRootId,
      deletedRootId,
      adminRootId,
      liveTargetId,
      hiddenTargetId,
      deletedTargetId,
      adminTargetId,
      crossRootTargetId,
      crossCommunityTargetId,
      missingTargetId,
      legacyMessageId,
      legacyContent,
    };
  });
}

function composerArgs(fixture: Awaited<ReturnType<typeof createFixture>>, suffix: string) {
  return {
    communityId: fixture.communityId,
    idempotencyKey: `canonical-identity-composer-${suffix}`,
    text: `Message ${suffix}`,
  };
}

describe("canonical community interaction identity", () => {
  test("accepts only canonical same-root readable reply targets and preserves retry identity", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const actor = t.withIdentity({ subject: fixture.subject });
    const createMessage = (api as any).communityInteractions.createCommunityInteractionComposerMessage;

    const rootReply = await actor.mutation(createMessage, {
      ...composerArgs(fixture, "root-reply"),
      rootId: fixture.rootId,
      targetReplyId: null,
    });
    expect(rootReply.interaction.kind).toBe("reply");

    const nestedArgs = {
      ...composerArgs(fixture, "nested"),
      rootId: fixture.rootId,
      targetReplyId: fixture.liveTargetId,
    };
    const nested = await actor.mutation(createMessage, nestedArgs);
    expect(nested.interaction.deduped).toBe(false);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.liveTargetId, { status: "hidden" });
    });
    const retry = await actor.mutation(createMessage, nestedArgs);
    expect(retry.interaction.deduped).toBe(true);
    await expect(
      actor.mutation(createMessage, {
        ...nestedArgs,
        targetReplyId: fixture.crossRootTargetId,
      }),
    ).rejects.toThrow("interaction_idempotency_key_conflict");

    for (const [suffix, targetReplyId] of [
      ["hidden", fixture.hiddenTargetId],
      ["deleted", fixture.deletedTargetId],
      ["admin", fixture.adminTargetId],
      ["cross-root", fixture.crossRootTargetId],
      ["cross-community", fixture.crossCommunityTargetId],
      ["missing", fixture.missingTargetId],
    ] as const) {
      await expect(
        actor.mutation(createMessage, {
          ...composerArgs(fixture, suffix),
          rootId: fixture.rootId,
          targetReplyId,
        }),
      ).rejects.toThrow("interaction_target_reply_invalid");
    }
    await expect(
      actor.mutation(createMessage, {
        ...composerArgs(fixture, "target-without-root"),
        rootId: null,
        targetReplyId: fixture.hiddenTargetId,
      }),
    ).rejects.toThrow("interaction_target_reply_requires_root");
    for (const [suffix, rootId] of [
      ["hidden-root", fixture.hiddenRootId],
      ["deleted-root", fixture.deletedRootId],
      ["admin-root", fixture.adminRootId],
    ] as const) {
      await expect(
        actor.mutation(createMessage, {
          ...composerArgs(fixture, suffix),
          rootId,
          targetReplyId: null,
        }),
      ).rejects.toThrow("interaction_root_not_readable");
    }
    await expect(
      actor.mutation(createMessage, {
        ...composerArgs(fixture, "wrong-table"),
        rootId: fixture.rootId,
        targetReplyId: fixture.otherRootId,
      }),
    ).rejects.toThrow();
  });

  test("canonical edits do not mutate historical legacy content", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const actor = t.withIdentity({ subject: fixture.subject });

    await actor.mutation(
      (api as any).communityInteractions.editCommunityInteractionMessage,
      {
        targetType: "root",
        targetId: fixture.rootId,
        text: "Edited canonical text",
      },
    );
    const state = await t.run(async (ctx) => {
      const root = await ctx.db.get(fixture.rootId);
      const blocks = await ctx.db
        .query("communityInteractionContentBlocks")
        .withIndex("by_root_order", (q) => q.eq("rootId", fixture.rootId))
        .collect();
      const legacy = await ctx.db.get(fixture.legacyMessageId);
      return { root, blocks, legacy };
    });
    expect(state.root?.contentSummary).toBe("Edited canonical text");
    expect(state.blocks.map((block) => block.text)).toEqual(["Edited canonical text"]);
    expect(state.legacy?.contentJson).toEqual(fixture.legacyContent);
  });
});
