/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityRecentContext.ts",
  "./communityMentionBroadcasts.ts",
  "./communityMentionLifecycle.ts",
  "./communityOnboarding.ts",
  "./communityAgentServeWorker.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityEvidenceAudit.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "interaction-channel-owner";
const OUTSIDER_SUBJECT = "interaction-channel-outsider";

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 1_780_000_000_000;
    const createUser = async (subject: string) => {
      const userId = await ctx.db.insert("users", {
        authSubject: subject,
        displayName: subject,
        handle: subject,
        normalizedHandle: subject,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("userProfileDetails", {
        userId,
        displayName: subject,
        avatarUrl: `https://example.com/${subject}.png`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId,
          documentKey: document.key,
          documentVersion: document.version,
          acceptedAt: nowMs,
          source: "test",
          createdAt: nowMs,
        });
      }
      return userId;
    };
    const ownerId = await createUser(OWNER_SUBJECT);
    await createUser(OUTSIDER_SUBJECT);
    const createCommunity = async (slug: string) =>
      await ctx.db.insert("communities", {
        ownerId,
        slug,
        name: slug,
        visibility: "unlisted",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const communityId = await createCommunity("interaction-channel-primary");
    const otherCommunityId = await createCommunity("interaction-channel-other");
    const insertChannel = async (args: {
      communityId: any;
      slug: string;
      position: number;
      general?: boolean;
    }) =>
      await ctx.db.insert("communityChannels", {
        communityId: args.communityId,
        ...(args.general ? { systemRole: "general" as const } : {}),
        slug: args.slug,
        name: args.general ? "General" : args.slug,
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: args.position,
        ...(args.general ? {} : { createdByUserId: ownerId }),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const generalChannelId = await insertChannel({
      communityId,
      slug: "general",
      position: 0,
      general: true,
    });
    const customChannelId = await insertChannel({
      communityId,
      slug: "custom",
      position: 1,
    });
    await insertChannel({
      communityId: otherCommunityId,
      slug: "general",
      position: 0,
      general: true,
    });
    const otherChannelId = await insertChannel({
      communityId: otherCommunityId,
      slug: "other-custom",
      position: 1,
    });
    return {
      communityId,
      ownerId,
      generalChannelId,
      customChannelId,
      otherChannelId,
    };
  });
}

test("composer, feeds, idempotency, and replies preserve exact channel ownership", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asOutsider = t.withIdentity({ subject: OUTSIDER_SUBJECT });

  const customWrite = await asOwner.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    {
      communityId: fixture.communityId,
      channelId: fixture.customChannelId,
      idempotencyKey: "custom-root",
      text: "Custom channel root",
    },
  );
  const customRootId = customWrite.interaction.root_id as any;
  await asOwner.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    {
      communityId: fixture.communityId,
      idempotencyKey: "general-root",
      text: "General channel root",
    },
  );

  const customFeed = await asOwner.query(
    api.communityInteractions.listCommunityInteractionRoots,
    {
      communityId: fixture.communityId,
      channelId: fixture.customChannelId,
    },
  );
  expect(customFeed.roots).toHaveLength(1);
  expect(customFeed.roots[0]?.root).toMatchObject({
    id: String(customRootId),
    channel_id: String(fixture.customChannelId),
    content_summary: "Custom channel root",
  });

  const generalFeed = await asOwner.query(
    api.communityInteractions.listCommunityInteractionRoots,
    { communityId: fixture.communityId },
  );
  expect(generalFeed.roots).toHaveLength(1);
  expect(generalFeed.roots[0]?.root.channel_id).toBe(
    String(fixture.generalChannelId),
  );

  await expect(
    asOwner.mutation(
      api.communityInteractions.createCommunityInteractionComposerMessage,
      {
        communityId: fixture.communityId,
        idempotencyKey: "custom-root",
        text: "Custom channel root",
      },
    ),
  ).rejects.toThrow("interaction_idempotency_key_conflict");

  const replyWrite = await asOwner.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    {
      communityId: fixture.communityId,
      channelId: fixture.customChannelId,
      rootId: customRootId,
      idempotencyKey: "custom-reply",
      text: "Custom channel reply",
    },
  );
  expect(replyWrite.interaction.kind).toBe("reply");
  const replies = await asOwner.query(
    api.communityInteractions.listCommunityInteractionReplies,
    { rootId: customRootId },
  );
  expect(replies.replies).toHaveLength(1);
  expect(replies.replies[0]?.reply.channel_id).toBe(
    String(fixture.customChannelId),
  );

  await expect(
    asOwner.mutation(
      api.communityInteractions.createCommunityInteractionComposerMessage,
      {
        communityId: fixture.communityId,
        channelId: fixture.generalChannelId,
        rootId: customRootId,
        idempotencyKey: "mismatched-reply",
        text: "Wrong channel",
      },
    ),
  ).rejects.toThrow("interaction_channel_mismatch");
  await expect(
    asOwner.query(api.communityInteractions.listCommunityInteractionRoots, {
      communityId: fixture.communityId,
      channelId: fixture.otherChannelId,
    }),
  ).rejects.toThrow("community_channel_unavailable");
  await expect(
    asOutsider.query(api.communityInteractions.listCommunityInteractionRoots, {
      communityId: fixture.communityId,
      channelId: fixture.customChannelId,
    }),
  ).rejects.toThrow("community_entitlement_required");

  const evidence = await t.query(
    internal.communityInteractionEvidence
      .searchRecentCommunityInteractionEvidenceInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      query: "Custom channel root",
      limit: 10,
    },
  );
  expect(evidence.results[0]).toMatchObject({
    channel_id: String(fixture.customChannelId),
    channel_slug: "custom",
  });
  const recentContext = await t.query(
    internal.communityRecentContext.readCommunityRecentContextInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      query: "Custom channel root",
    },
  );
  expect(
    recentContext.recent_context.some(
      (item: any) =>
        item.channel_id === String(fixture.customChannelId) &&
        item.channel_slug === "custom",
    ),
  ).toBe(true);
});
