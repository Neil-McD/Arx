/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  clearCommunityTypingLease,
  renewCommunityTypingLease,
  resolveCommunityTypingPresence,
} from "./communityTypingPresenceCore";

const modules = import.meta.glob(["./_generated/**/*.*s"]);

test("typing leases remain isolated by channel and legacy leases belong only to General", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const nowMs = Date.now();
    const createUser = async (subject: string) =>
      await ctx.db.insert("users", {
        authSubject: subject,
        displayName: subject,
        handle: subject,
        normalizedHandle: subject,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const ownerId = await createUser("typing-channel-owner");
    const viewerId = await createUser("typing-channel-viewer");
    const legacyUserId = await createUser("typing-channel-legacy");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "typing-channel-community",
      name: "Typing channel community",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const userId of [viewerId, legacyUserId]) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role: "member",
        accessSource: "manual_grant",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    const customChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    await renewCommunityTypingLease({
      ctx,
      communityId,
      channelId: customChannelId,
      userId: ownerId,
      nowMs,
    });
    await renewCommunityTypingLease({
      ctx,
      communityId,
      userId: ownerId,
      nowMs: nowMs + 1,
    });
    await ctx.db.insert("communityTypingPresence", {
      communityId,
      userId: legacyUserId,
      displayUntil: nowMs + 20_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const community = await ctx.db.get(communityId);
    if (!community) throw new Error("typing_channel_community_missing");

    const customPresence = await resolveCommunityTypingPresence({
      ctx,
      community,
      channelId: customChannelId,
      viewerUserId: viewerId,
    });
    expect(customPresence.users.map((row) => row.user_id)).toEqual([
      "typing-channel-owner",
    ]);

    const generalPresence = await resolveCommunityTypingPresence({
      ctx,
      community,
      viewerUserId: viewerId,
    });
    expect(
      generalPresence.users.map((row) => row.user_id).sort(),
    ).toEqual(["typing-channel-legacy", "typing-channel-owner"]);

    await expect(
      clearCommunityTypingLease({
        ctx,
        communityId,
        channelId: customChannelId,
        userId: ownerId,
      }),
    ).resolves.toEqual({ cleared: true });
    const remainingOwnerRows = await ctx.db
      .query("communityTypingPresence")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", communityId).eq("userId", ownerId),
      )
      .collect();
    expect(remainingOwnerRows).toHaveLength(1);
    expect(remainingOwnerRows[0]?.channelId).toBeTruthy();
  });
});
