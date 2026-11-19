/// <reference types="vite/client" />
// Home's tag lines: a tag of you that you haven't seen, in a channel or a pod,
// for every role; gone once you read the room, and never from a room or a
// post you can no longer read (shared/communityHomeTags.ts).
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communityMentionBroadcasts.ts",
  "./communityAttention.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityPods.ts",
  "./_generated/**/*.*s",
]);
const refs = internal as any;
const START = 1_800_000_000_000;

afterEach(() => { vi.useRealTimers(); });

async function fixture(ctx: MutationCtx) {
  const user = async (name: string) => {
    const id = await ctx.db.insert("users", {
      authSubject: name, displayName: name, handle: name, normalizedHandle: name,
      email: `${name}@example.com`, emailVerifiedAt: 1, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("userProfileDetails", { userId: id, displayName: name, avatarUrl: `https://example.com/${name}.png`, createdAt: 1, updatedAt: 1 });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", { userId: id, documentKey: document.key, documentVersion: document.version, acceptedAt: 1, source: "test", createdAt: 1 });
    }
    return id;
  };
  const ownerId = await user("owner");
  const memberId = await user("member");
  const friendId = await user("friend");
  const otherId = await user("other");
  const adminId = await user("admin");
  const moderatorId = await user("moderator");
  const communityId = await ctx.db.insert("communities", {
    ownerId, name: "Home tags", slug: "home-tags", visibility: "unlisted", entryPolicy: "open",
    inferenceFundingPolicy: "managed_required", lifecycleStatus: "active", lifecycleGeneration: 0, createdAt: 1, updatedAt: 1,
  });
  const membership = (userId: any, role: "member" | "admin" | "moderator" = "member") => ctx.db.insert("communityMemberships", {
    communityId, userId, role, state: "active", createdAt: 1, updatedAt: 1,
  });
  const memberMembershipId = await membership(memberId);
  const friendMembershipId = await membership(friendId);
  await membership(otherId);
  await membership(adminId, "admin");
  await membership(moderatorId, "moderator");
  const generalId = await ctx.db.insert("communityChannels", {
    communityId, systemRole: "general", name: "General", slug: "general", accessMode: "all_members",
    postingPolicy: "members", position: 0, status: "active", createdAt: 1, updatedAt: 1,
  });
  const podId = await ctx.db.insert("communityChannels", {
    communityId, name: "Founders", slug: "founders", accessMode: "restricted",
    postingPolicy: "members", position: 1, status: "active", createdAt: 1, updatedAt: 1,
  });
  const grants: Record<string, any> = {};
  for (const [name, userId, membershipId] of [["member", memberId, memberMembershipId], ["friend", friendId, friendMembershipId]] as const) {
    grants[name] = await ctx.db.insert("communityChannelParticipants", {
      communityId, channelId: podId, principalKey: `user:${userId}`, membershipId, membershipActivationSequence: 0,
      status: "active", createdByUserId: ownerId, createdAt: 1, updatedAt: 1,
    });
  }
  await ctx.db.insert("communityPods", { communityId, channelId: podId, purpose: "Founders helping founders", createdAt: 1, updatedAt: 1 });
  return { ownerId, memberId, friendId, otherId, adminId, moderatorId, communityId, generalId, podId, grants };
}

function at(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START + ms);
}

async function post(t: any, subject: string, channelId: any, f: any, key: string, text: string, mentions?: Array<Record<string, string>>) {
  return await t.withIdentity({ subject }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId, idempotencyKey: key, text, ...(mentions ? { mentions } : {}),
  });
}

async function tagsOf(t: any, subject: string, f: any) {
  return await t.withIdentity({ subject }).query(api.communityAttention.listMyHomeTags, { communityId: f.communityId });
}

async function read(t: any, subject: string, f: any, channelId: any, ms: number) {
  await t.withIdentity({ subject }).mutation(api.communityAttention.acknowledgeCommunityChatRead,
    { communityId: f.communityId, channelId, throughAtMs: START + ms });
}

test("a tag in an open channel is a line for the person tagged only, until they read the room", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "friend", f.generalId, f, "tag", "@member can you look at the deck before Friday?", [{ userId: f.memberId }]);

  const seen = await tagsOf(t, "member", f);
  expect(seen.more).toBeNull();
  expect(seen.lines).toHaveLength(1);
  expect(seen.lines[0]).toMatchObject({
    title: "friend tagged you in #General",
    detail: "can you look at the deck before Friday?",
    channelSlug: "general",
  });
  expect(seen.lines[0].rootId).toBeTruthy();
  // Not the author, not someone else.
  expect((await tagsOf(t, "friend", f)).lines).toEqual([]);
  expect((await tagsOf(t, "other", f)).lines).toEqual([]);

  // Opening the room clears it (the dot's own read position).
  at(2_000);
  await read(t, "member", f, f.generalId, 2_000);
  expect((await tagsOf(t, "member", f)).lines).toEqual([]);
});

test("a tag in a pod reaches a pod member and a tagged owner who isn't in it", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "friend", f.podId, f, "tag", "@member @owner your call", [{ userId: f.memberId }, { userId: f.ownerId }]);
  for (const subject of ["member", "owner"]) {
    expect((await tagsOf(t, subject, f)).lines.map((line: any) => [line.title, line.detail, line.channelSlug]))
      .toEqual([["friend tagged you in Founders", "your call", "founders"]]);
  }
  expect((await tagsOf(t, "admin", f)).lines).toEqual([]);
});

test("a tag the person can no longer read is never shown: out of the pod, or the post taken down", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "friend", f.podId, f, "pod", "@member pod things", [{ userId: f.memberId }]);
  const general = await post(t, "friend", f.generalId, f, "general", "@member general things", [{ userId: f.memberId }]);
  expect((await tagsOf(t, "member", f)).lines).toHaveLength(2);

  await t.run((ctx) => ctx.db.patch(f.grants.member, { status: "revoked" }));
  expect((await tagsOf(t, "member", f)).lines.map((line: any) => line.channelSlug)).toEqual(["general"]);

  const rootId = (await t.run((ctx) => ctx.db.query("communityInteractionRoots").collect()))
    .find((row) => row.contentSummary.includes("general things"))!._id;
  expect(general).toBeTruthy();
  await t.run((ctx) => ctx.db.patch(rootId, { status: "hidden" }));
  expect((await tagsOf(t, "member", f)).lines).toEqual([]);
  await t.run((ctx) => ctx.db.patch(rootId, { status: "deleted" }));
  expect((await tagsOf(t, "member", f)).lines).toEqual([]);
});

test("@everybody reads as tagging everybody, for those it reaches", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "owner", f.generalId, f, "everybody", "@everybody call moved to Friday", [{ roleKey: "everybody" }]);
  const broadcast = await t.run(async (ctx) => (await ctx.db.query("communityMentionBroadcasts").collect())[0]);
  await t.mutation(refs.communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal,
    { broadcastId: broadcast!._id, nowMs: START + 1_000 });
  for (const subject of ["member", "other", "moderator"]) {
    expect((await tagsOf(t, subject, f)).lines.map((line: any) => [line.title, line.detail]))
      .toEqual([["owner tagged everybody in #General", "call moved to Friday"]]);
  }
  // Not the one who wrote it.
  expect((await tagsOf(t, "owner", f)).lines).toEqual([]);
});

test("three lines, newest first, then one line for the rest that opens the next one's room", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  for (const [index, channelId] of [f.podId, f.generalId, f.generalId, f.generalId, f.generalId].entries()) {
    at(1_000 * (index + 1));
    await post(t, "friend", channelId, f, `tag-${index}`, `@member number ${index}`, [{ userId: f.memberId }]);
  }
  const seen = await tagsOf(t, "member", f);
  expect(seen.lines.map((line: any) => line.detail)).toEqual(["number 4", "number 3", "number 2"]);
  expect(seen.more).toMatchObject({ count: 2, title: "And 2 more tags", channelSlug: "general", action: "Open #General" });

  // Reading General leaves the pod's.
  at(10_000);
  await read(t, "member", f, f.generalId, 10_000);
  const after = await tagsOf(t, "member", f);
  expect(after.lines.map((line: any) => line.detail)).toEqual(["number 0"]);
  expect(after.more).toBeNull();
});

test("an admin and a moderator get their tags on Home too", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "member", f.generalId, f, "tag", "@admin @moderator a spam post?", [{ userId: f.adminId }, { userId: f.moderatorId }]);
  expect((await tagsOf(t, "admin", f)).lines.map((line: any) => line.title)).toEqual(["member tagged you in #General"]);
  expect((await tagsOf(t, "moderator", f)).lines.map((line: any) => line.title)).toEqual(["member tagged you in #General"]);
});
