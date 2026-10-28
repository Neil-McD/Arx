/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { nextLocalWeekdayAt } from "./stagingSeedSunrise";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "./_generated/**/*.*s"]);
const refs = internal as any;

afterEach(() => {
  delete process.env.POLYNET_ALLOW_SEED;
});

async function fixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = Date.now();
    const ownerId = await ctx.db.insert("users", {
      authSubject: "sunrise-owner", displayName: "Neil", handle: "neil-sunrise", normalizedHandle: "neil-sunrise", createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.db.insert("userProfileDetails", { userId: ownerId, displayName: "Neil", avatarUrl: "https://example.com/neil.png", createdAt: nowMs, updatedAt: nowMs });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", {
        userId: ownerId, documentKey: document.key, documentVersion: document.version, acceptedAt: nowMs, source: "test", createdAt: nowMs,
      });
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "sunrise-climbing-club", name: "Sunrise Climbing Club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: nowMs, updatedAt: nowMs,
    } as any);
    await ctx.db.insert("communityChannels", {
      communityId, systemRole: "general", slug: "general", name: "General", normalizedName: "general", accessMode: "all_members",
      postingPolicy: "members", status: "active", position: 0, createdAt: nowMs, updatedAt: nowMs,
    });
    return { ownerId, communityId };
  });
}

const seededState = (t: ReturnType<typeof convexTest>, communityId: any) => t.run(async (ctx) => {
  const seedUsers = (await ctx.db.query("users").collect()).filter((user) => user.authSubject.startsWith("seed:sunrise:"));
  const memberships = await ctx.db.query("communityMemberships").collect();
  const roots = (await ctx.db.query("communityInteractionRoots").collect()).filter((row) => row.communityId === communityId);
  return {
    seedUserIds: seedUsers.map((user) => user._id).sort(),
    memberships: memberships.map((row) => ({ role: row.role, active: row.active })),
    channels: (await ctx.db.query("communityChannels").collect()).map((row) => row.slug).sort(),
    rootIds: roots.map((row) => row._id),
    roots: roots.length,
    replies: (await ctx.db.query("communityInteractionReplies").collect()).length,
    reactions: (await ctx.db.query("communityInteractionReactions").collect()).length,
    blocks: (await ctx.db.query("communityInteractionContentBlocks").collect()).length,
    mentions: await ctx.db.query("communityInteractionMentions").collect(),
    events: await ctx.db.query("communityEvents").collect(),
    modules: await ctx.db.query("communityResourceModules").collect(),
    lessons: await ctx.db.query("communityResources").collect(),
    nodes: (await ctx.db.query("communityIntelligenceNodes").collect()).length,
    activeMemberCount: (await ctx.db.get(communityId))?.activeMemberCount,
  };
});

describe("Sunrise staging seed", () => {
  it("finds the next local weekday time across time zones", () => {
    // Wednesday 2026-10-28 12:00 UTC is 05:00 in Los Angeles (PDT).
    const now = Date.parse("2026-10-28T12:00:00.000Z");
    expect(new Date(nextLocalWeekdayAt(now, 4, 5, 45, "America/Los_Angeles")).toISOString()).toBe("2026-10-29T12:45:00.000Z");
    expect(new Date(nextLocalWeekdayAt(now, 3, 5, 45, "America/Los_Angeles")).toISOString()).toBe("2026-10-28T12:45:00.000Z");
    expect(new Date(nextLocalWeekdayAt(now, 3, 4, 45, "America/Los_Angeles")).toISOString()).toBe("2026-11-04T12:45:00.000Z");
    // After the US daylight-saving change, 5:30 local is an hour later in UTC.
    expect(new Date(nextLocalWeekdayAt(now, 6, 5, 30, "America/Los_Angeles")).toISOString()).toBe("2026-10-31T12:30:00.000Z");
    expect(new Date(nextLocalWeekdayAt(Date.parse("2026-11-01T20:00:00.000Z"), 2, 5, 45, "America/Los_Angeles")).toISOString()).toBe("2026-11-03T13:45:00.000Z");
  });

  it("refuses without POLYNET_ALLOW_SEED", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t);
    await expect(t.mutation(refs.stagingSeedSunrise.seedSunriseInternal, { communityId: f.communityId })).rejects.toThrow(/seed_not_allowed/);
    await expect(t.mutation(refs.stagingSeedSunrise.simulateSunriseLiveInternal, { communityId: f.communityId, action: "presence" }))
      .rejects.toThrow(/seed_not_allowed/);
  });

  it("seeds members, two channels, posts, an owner mention, events, a course and memories, and reseeds cleanly", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t);
    process.env.POLYNET_ALLOW_SEED = "1";
    const seed = () => t.mutation(refs.stagingSeedSunrise.seedSunriseInternal, { communityId: f.communityId });

    const first = await seed();
    expect(first).toMatchObject({ timeZone: "America/Los_Angeles", posts: 8, replies: 9, removedPosts: 0, ownerMention: { handle: "neil-sunrise" } });
    expect(first.channels.map((channel: any) => channel.slug)).toEqual(["general", "beta"]);
    const state = await seededState(t, f.communityId);
    expect(state.seedUserIds).toHaveLength(4);
    expect(state.memberships.filter((row) => row.active)).toHaveLength(4);
    expect(state.memberships.filter((row) => row.role === "moderator")).toHaveLength(1);
    expect(state.activeMemberCount).toBe(5);
    expect(state.channels).toEqual(["beta", "general"]);
    expect(state).toMatchObject({ roots: 8, replies: 9, reactions: 13, nodes: 3 });
    // The owner's mention came through the member composer and is unread.
    expect(state.mentions).toHaveLength(1);
    expect(state.mentions[0]).toMatchObject({ mentionKind: "user", mentionedUserId: f.ownerId, notifyState: "pending" });
    const mentionRoot: any = await t.run((ctx) => ctx.db.get(state.mentions[0].rootId!));
    expect(mentionRoot?.contentSummary).toContain("@neil-sunrise");
    expect(mentionRoot?.idempotencyKey).toContain("seed:sunrise:");

    // Events: three upcoming sessions (one online with a description), one past, one cancelled.
    const nowMs = Date.now();
    expect(state.events).toHaveLength(5);
    expect(state.events.filter((event) => event.status === "cancelled").map((event) => event.title)).toEqual(["Friday Fingerboard Clinic"]);
    expect(state.events.filter((event) => event.startsAt < nowMs)).toHaveLength(1);
    const online = state.events.find((event) => event.locationType === "online")!;
    expect(online.url).toMatch(/^https:\/\//);
    expect(online.descriptionMd).toBeTruthy();
    const localStart = (ms: number) => new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(ms));
    expect(state.events.filter((event) => event.status === "live" && event.startsAt > nowMs).map((event) => localStart(event.startsAt)).sort())
      .toEqual(["Sat 05:30", "Thu 05:45", "Tue 05:45"]);

    // The course is live and its lessons list where /learn reads them.
    const courses = await t.query(refs.communityResources.listCommunityResourceSemanticDirectoryInternal, { userId: f.ownerId, communityId: f.communityId });
    expect(courses.entries.map((entry: any) => entry.name ?? entry.title)).toEqual(["Board basics"]);
    const lessons = await t.query(refs.communityResources.listCommunityResourceSemanticDirectoryInternal, {
      userId: f.ownerId, communityId: f.communityId, moduleId: state.modules[0]._id,
    });
    expect(lessons.entries).toHaveLength(3);

    // Memories are readable to members where /knowledge reads them.
    const memory = await t.mutation(refs.communityIntelligenceDirectory.searchCommunityMemoryInternal, {
      trustedUserId: state.seedUserIds[0], communityId: f.communityId, surface: "member_agent_dock", limit: 12, forceMemberView: true,
    });
    expect(memory.ok).toBe(true);
    expect(memory.nodes.map((node: any) => node.title).sort()).toEqual(["Board etiquette", "Early sessions need warmer fingers", "How a Sunrise session runs"]);

    // A rerun replaces the posts and events and reuses everything else.
    const second = await seed();
    expect(second.removedPosts).toBe(8);
    const again = await seededState(t, f.communityId);
    expect(again.seedUserIds).toEqual(state.seedUserIds);
    expect(again).toMatchObject({ roots: 8, replies: 9, reactions: 13, blocks: state.blocks, nodes: 3, channels: ["beta", "general"] });
    expect(again.rootIds.some((id) => state.rootIds.includes(id))).toBe(false);
    expect(again.mentions).toHaveLength(1);
    expect(again.events).toHaveLength(5);
    expect(again.modules).toHaveLength(1);
    expect(again.lessons).toHaveLength(3);
  });

  it("simulates a second person: presence, typing and a real post with a mention", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t);
    process.env.POLYNET_ALLOW_SEED = "1";
    const live = (args: Record<string, unknown>) => t.mutation(refs.stagingSeedSunrise.simulateSunriseLiveInternal, { communityId: f.communityId, ...args });
    await expect(live({ action: "presence" })).rejects.toThrow(/seed_sunrise_not_seeded/);
    await t.mutation(refs.stagingSeedSunrise.seedSunriseInternal, { communityId: f.communityId });

    const presence = await live({ action: "presence" });
    expect(presence.leases).toHaveLength(4);
    const typing = await live({ action: "typing", memberKey: "priya", channelSlug: "beta" });
    expect(typing).toMatchObject({ action: "typing", member: "priya", channel: "beta" });
    const post = await live({ action: "post", memberKey: "theo", channelSlug: "beta", text: "@neil-sunrise anyone on the board tomorrow?" });
    expect(post).toMatchObject({ action: "post", member: "theo", channel: "beta", mentions: 1 });
    await expect(live({ action: "post", memberKey: "nobody", text: "hi" })).rejects.toThrow(/seed_member_unknown/);

    const state = await t.run(async (ctx) => ({
      presence: (await ctx.db.query("communityPresence").collect()).filter((row) => (row.activeUntil ?? 0) > Date.now()).length,
      typing: await ctx.db.query("communityTypingPresence").collect(),
      beta: await ctx.db.query("communityChannels").withIndex("by_community_slug", (q) => q.eq("communityId", f.communityId).eq("slug", "beta")).first(),
      post: await ctx.db.get(post.rootId as any),
      mentions: (await ctx.db.query("communityInteractionMentions").collect()).filter((row) => row.mentionedUserId === f.ownerId).length,
    }));
    expect(state.presence).toBe(4);
    expect(state.typing).toHaveLength(1);
    expect(state.typing[0].channelId).toBe(state.beta!._id);
    expect(state.post).toMatchObject({ channelId: state.beta!._id, status: "live", contentSummary: "@neil-sunrise anyone on the board tomorrow?" });
    expect(state.mentions).toBe(2);

    // A reseed clears live posts too.
    const reseed = await t.mutation(refs.stagingSeedSunrise.seedSunriseInternal, { communityId: f.communityId });
    expect(reseed.removedPosts).toBe(9);
  });
});
