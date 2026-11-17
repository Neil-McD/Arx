/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import { communityLooksFinished } from "./communityPublic";
import schema from "./schema";

const modules = import.meta.glob(["./communityPublic.ts", "./_generated/**/*.*s"]);

afterEach(() => { vi.useRealTimers(); });

test("a community is listed once it has a banner and a one-liner", () => {
  expect(communityLooksFinished({ oneLiner: "Early climbers.", bannerUrl: "https://x.test/b.webp" })).toBe(true);
  expect(communityLooksFinished({ oneLiner: "Early climbers.", bannerStorageId: "storage" })).toBe(true);
  expect(communityLooksFinished({ oneLiner: "Early climbers." })).toBe(false);
  expect(communityLooksFinished({ oneLiner: "  ", bannerUrl: "https://x.test/b.webp" })).toBe(false);
  expect(communityLooksFinished({ bannerUrl: "https://x.test/b.webp" })).toBe(false);
});

test("Discover lists finished communities with their host, size and a sign of life", async () => {
  const nowMs = 1_794_000_000_000;
  vi.useFakeTimers();
  vi.setSystemTime(nowMs);
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "discover-owner", displayName: "Maya Chen", handle: "maya", normalizedHandle: "maya", createdAt: nowMs, updatedAt: nowMs,
    });
    const community = (slug: string, extra: Record<string, unknown>) => ctx.db.insert("communities", {
      ownerId, slug, name: `Community ${slug}`, visibility: "published", inferenceFundingPolicy: "managed_required", entryPolicy: "open",
      activeMemberCount: 12, createdAt: nowMs, updatedAt: nowMs, ...extra,
    } as any);
    const finished = await community("finished", { oneLiner: "Early climbers who train together.", bannerUrl: "https://x.test/b.webp" });
    await community("no-banner", { oneLiner: "No banner yet." });
    await community("no-line", { bannerUrl: "https://x.test/b.webp" });
    const channel = (slug: string, accessMode: "all_members" | "restricted") => ctx.db.insert("communityChannels", {
      communityId: finished, slug, name: slug, accessMode, postingPolicy: "members", status: "active", position: 0,
      createdAt: nowMs, updatedAt: nowMs,
    } as any);
    const general = await channel("general", "all_members");
    const pod = await channel("setters", "restricted");
    const post = (hoursAgo: number, extra: Record<string, unknown> = {}) => ctx.db.insert("communityInteractionRoots", {
      communityId: finished, channelId: general, actorType: "human", actorUserId: ownerId, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: "A post", replyCount: 0, reactionSummary: [], idempotencyKey: `post-${hoursAgo}-${JSON.stringify(extra)}`,
      createdAt: nowMs - hoursAgo * 3_600_000, updatedAt: nowMs - hoursAgo * 3_600_000, ...extra,
    } as any);
    await post(2);
    await post(30);
    // Not counted: older than a week, the guide's own, a private talk, a removed post.
    await post(24 * 9);
    await post(1, { actorType: "community_agent", actorUserId: undefined, actorAgentKey: "guide" });
    await post(1, { visibilityScope: "private" });
    await post(1, { status: "deleted" });
    // Not counted: a pod's room, which only its members may see.
    await post(0.5, { channelId: pod });
    // Sixty of the guide's posts, newer than everything: they don't hide the two that count.
    for (let index = 0; index < 60; index += 1) {
      await post(0.1 + index / 1000, { actorType: "community_agent", actorUserId: undefined, actorAgentKey: "guide" });
    }
  });

  const { communities } = await t.query(api.communityPublic.listPublicDiscoverCommunities, {});
  expect(communities.map((community: any) => community.slug)).toEqual(["finished"]);
  expect(communities[0]).toMatchObject({
    host: { name: "Maya Chen" },
    member_count: 12,
    posts_this_week: 2,
    last_active_at: new Date(nowMs - 2 * 3_600_000).toISOString(),
  });
});
