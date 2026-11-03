/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { readMemberStanding } from "./communitySemanticMembers";

// The community card's own facts (who holds which role, the courses) and a
// member's standing: counts and dates the platform keeps, never restricted channels.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.parse("2026-11-03T12:00:00.000Z");

afterEach(() => { vi.unstubAllEnvs(); });

async function fixture() {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.example.com");
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = async (handle: string, name: string) => {
      const id = await ctx.db.insert("users", { authSubject: `${handle}-subject`, displayName: name, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW } as any);
      return id;
    };
    const owner = await user("neil", "Neil");
    const admin = await user("ana", "Ana Ito");
    const moderator = await user("maya-crimps", "Maya Chen");
    const member = await user("theo", "Theo Brennan");
    const former = await user("gone", "Gone Mod");
    const communityId = await ctx.db.insert("communities", {
      ownerId: owner, slug: "sunrise", name: "Sunrise", oneLiner: "Early climbers.", about: "We meet at 5:30.", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "approval", activeMemberCount: 4, createdAt: NOW - 90 * 86_400_000, updatedAt: NOW,
    } as any);
    const membership = (userId: any, role: string, active = true) => ctx.db.insert("communityMemberships", {
      communityId, userId, role, accessSource: "free_grant", active, activationSequence: 1, activatedAt: NOW - 30 * 86_400_000, createdAt: NOW - 30 * 86_400_000, updatedAt: NOW,
    } as any);
    await membership(admin, "admin");
    await membership(moderator, "moderator");
    const memberRow = await membership(member, "member");
    await membership(former, "moderator", false);
    const channel = (slug: string, accessMode: string) => ctx.db.insert("communityChannels", {
      communityId, slug, name: slug, normalizedName: slug, accessMode, postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW,
    } as any);
    const general = await channel("general", "all_members");
    const secret = await channel("founders", "restricted");
    let n = 0;
    const post = (channelId: any, status: string, at: number) => ctx.db.insert("communityInteractionRoots", {
      communityId, channelId, actorType: "human", actorUserId: member, kind: "discussion", status, visibilityScope: "community",
      contentSummary: "hi", replyCount: 0, reactionSummary: [], idempotencyKey: `p${n++}`, createdAt: at, updatedAt: at,
    } as any);
    const root = await post(general, "live", NOW - 5_000);
    await post(general, "live", NOW - 4_000);
    const deleted = await post(general, "deleted", NOW - 3_500);
    await post(general, "hidden", NOW - 3_000);
    await post(secret, "live", NOW - 1_000);
    await ctx.db.insert("communityInteractionReplies", {
      communityId, channelId: general, rootId: root, seq: 1, actorType: "human", actorUserId: member, status: "live", visibilityScope: "community",
      contentSummary: "reply", reactionSummary: [], idempotencyKey: "r1", createdAt: NOW - 2_000, updatedAt: NOW - 2_000,
    } as any);
    // A live reply left on a deleted post: not counted, and not "last active".
    await ctx.db.insert("communityInteractionReplies", {
      communityId, channelId: general, rootId: deleted, seq: 1, actorType: "human", actorUserId: member, status: "live", visibilityScope: "community",
      contentSummary: "orphan", reactionSummary: [], idempotencyKey: "r2", createdAt: NOW - 500, updatedAt: NOW - 500,
    } as any);
    const course = (name: string, status?: string) => ctx.db.insert("communityResourceModules", {
      communityId, createdByUserId: owner, name, sortOrder: n++, ...(status ? { status } : {}), createdAt: NOW, updatedAt: NOW,
    } as any);
    const basics = await course("Board basics", "live");
    await course("Draft course", "draft");
    for (const [title, status, role] of [["One", "published", "page"], ["Two", "published", undefined], ["Draft", "draft", "page"], ["Upload", "published", "source"]] as const) {
      await ctx.db.insert("communityResources", {
        communityId, moduleId: basics, type: "note", pinned: false, title, status, ...(role ? { role } : {}), sortOrder: n++, createdByUserId: owner, createdAt: NOW, updatedAt: NOW,
      } as any);
    }
    return { communityId, member, memberRow };
  });
  return { t, ...ids };
}

test("the card's own facts: owner, active admins and moderators by name, live courses with their published lessons", async () => {
  const f = await fixture();
  const source = await f.t.query(internal.communityOntologyCards.loadCommunityCardSourceInternal, { communityId: f.communityId });
  expect(source).toMatchObject({
    name: "Sunrise", slug: "sunrise", entryPolicy: "approval", memberCount: 4, canonicalUrl: "https://polynet.example.com/c/sunrise",
    people: [
      { name: "Neil", handle: "neil", role: "owner" },
      { name: "Ana Ito", handle: "ana", role: "admin" },
      { name: "Maya Chen", handle: "maya-crimps", role: "moderator" },
    ],
    courses: [{ title: "Board basics", lessons: 2 }],
  });
});

test("a member's standing counts only live posts and replies in shared channels, never a restricted one", async () => {
  const f = await fixture();
  const standing = await f.t.run(async (ctx) => {
    const community = await ctx.db.get(f.communityId);
    const membership = await ctx.db.get(f.memberRow);
    return readMemberStanding(ctx, community, f.member, membership);
  });
  expect(standing).toEqual({
    joinedAt: new Date(NOW - 30 * 86_400_000).toISOString(),
    sharedPosts: 2,
    sharedReplies: 1,
    countsCapped: false,
    // The restricted channel's newer post doesn't move "last active" either.
    lastActiveAt: new Date(NOW - 2_000).toISOString(),
  });
});
