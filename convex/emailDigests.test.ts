import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { listRecentCanonicalCommunityChatMessages } from "./emailDigests";
import schema from "./schema";

const modules = import.meta.glob(["./emailDigests.ts", "./_generated/**/*.*s"]);

async function createCommunity(t: ReturnType<typeof convexTest>, suffix: string) {
  return await t.run(async (ctx) => {
    const nowMs = 1_780_000_000_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: `digest-owner-${suffix}`,
      displayName: "Digest owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `digest-${suffix}`,
      name: "Digest community",
      visibility: "unlisted",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, nowMs };
  });
}

function rootFields(communityId: any, summary: string, createdAt: number, overrides: Record<string, unknown> = {}) {
  return {
    communityId,
    actorType: "human" as const,
    kind: "discussion" as const,
    status: "live" as const,
    visibilityScope: "community" as const,
    contentSummary: summary,
    replyCount: 0,
    reactionSummary: [],
    idempotencyKey: `root:${summary}:${createdAt}`,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function replyFields(
  communityId: any,
  rootId: any,
  summary: string,
  createdAt: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    communityId,
    rootId,
    seq: createdAt,
    actorType: "human" as const,
    status: "live" as const,
    visibilityScope: "community" as const,
    contentSummary: summary,
    reactionSummary: [],
    idempotencyKey: `reply:${summary}:${createdAt}`,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("weekly community digest canonical interaction input", () => {
  test("uses current canonical summaries and fails closed on unreadable interactions and parents", async () => {
    const t = convexTest(schema, modules);
    const { communityId, nowMs } = await createCommunity(t, "authority");
    const periodStartMs = nowMs - 1_000;
    await t.run(async (ctx) => {
      const oldReadableRootId = await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "old readable parent", periodStartMs - 1),
      );
      const hiddenParentId = await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "hidden parent", periodStartMs - 2, { status: "hidden" }),
      );
      const otherOwnerId = await ctx.db.insert("users", {
        authSubject: "digest-other-owner",
        displayName: "Other owner",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const otherCommunityId = await ctx.db.insert("communities", {
        ownerId: otherOwnerId,
        slug: "digest-other-community",
        name: "Other community",
        visibility: "unlisted",
        entryPolicy: "approval",
        activeMemberCount: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const otherCommunityRootId = await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(otherCommunityId, "other community parent", periodStartMs - 3),
      );

      await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "edited canonical summary", nowMs - 10, {
          editedAt: nowMs - 5,
          updatedAt: nowMs - 5,
        }),
      );
      await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "public canonical root", nowMs - 20, {
          visibilityScope: "public",
        }),
      );
      await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "hidden root", nowMs - 30, { status: "hidden" }),
      );
      await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "deleted root", nowMs - 40, { status: "deleted" }),
      );
      await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "private root", nowMs - 50, { visibilityScope: "private" }),
      );
      await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "admin root", nowMs - 60, { visibilityScope: "admin" }),
      );
      await ctx.db.insert(
        "communityInteractionReplies",
        replyFields(communityId, oldReadableRootId, "new reply to old root", nowMs - 15),
      );
      await ctx.db.insert(
        "communityInteractionReplies",
        replyFields(communityId, oldReadableRootId, "private reply", nowMs - 25, {
          visibilityScope: "private",
        }),
      );
      await ctx.db.insert(
        "communityInteractionReplies",
        replyFields(communityId, oldReadableRootId, "deleted reply", nowMs - 35, {
          status: "deleted",
        }),
      );
      await ctx.db.insert(
        "communityInteractionReplies",
        replyFields(communityId, hiddenParentId, "reply with hidden parent", nowMs - 45),
      );
      await ctx.db.insert(
        "communityInteractionReplies",
        replyFields(communityId, otherCommunityRootId, "reply with foreign parent", nowMs - 55),
      );
    });

    const messages = await t.run(async (ctx) =>
      await listRecentCanonicalCommunityChatMessages(ctx, {
        communityId,
        periodStartMs,
        periodEndMs: nowMs,
      }),
    );

    expect(messages.map((message) => message.contentSummary)).toEqual([
      "edited canonical summary",
      "new reply to old root",
      "public canonical root",
    ]);
    expect(messages.map((message) => message.objectType)).toEqual(["root", "reply", "root"]);
  });

  test("reads at most fifty roots and fifty replies in deterministic newest-first order", async () => {
    const t = convexTest(schema, modules);
    const { communityId, nowMs } = await createCommunity(t, "bound");
    const periodStartMs = nowMs - 10_000;
    const { sentinelRootId, sentinelReplyId } = await t.run(async (ctx) => {
      const oldRootId = await ctx.db.insert(
        "communityInteractionRoots",
        rootFields(communityId, "old reply parent", periodStartMs - 1),
      );
      let sentinelRootId: any = null;
      let sentinelReplyId: any = null;
      for (let index = 0; index < 51; index += 1) {
        const createdAt = periodStartMs + index;
        const rootId = await ctx.db.insert(
          "communityInteractionRoots",
          rootFields(communityId, `root ${index}`, createdAt),
        );
        const replyId = await ctx.db.insert(
          "communityInteractionReplies",
          replyFields(communityId, oldRootId, `reply ${index}`, createdAt),
        );
        if (index === 0) {
          sentinelRootId = rootId;
          sentinelReplyId = replyId;
        }
      }
      return { sentinelRootId, sentinelReplyId };
    });

    const messages = await t.run(async (ctx) =>
      await listRecentCanonicalCommunityChatMessages(ctx, {
        communityId,
        periodStartMs,
        periodEndMs: nowMs,
      }),
    );

    expect(messages).toHaveLength(100);
    expect(messages.some((message) => message._id === sentinelRootId)).toBe(false);
    expect(messages.some((message) => message._id === sentinelReplyId)).toBe(false);
    expect(messages.map((message) => message.createdAt)).toEqual(
      messages.map((message) => message.createdAt).sort((a, b) => b - a),
    );
  });
});
