/// <reference types="vite/client" />
// A pod behaves exactly like a channel for its signals (the dot, the tag, the
// tag email); the only difference is who is in it (docs/specs/pods-v0.md,
// "What tells you something happened").
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const sendEmail = vi.hoisted(() => vi.fn(async (_params: unknown) => ({ providerMessageId: "simulated" })));
vi.mock("./emailCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emailCore")>()),
  sendRenderedEmail: sendEmail,
}));

const modules = import.meta.glob([
  "./communityMentionEmails.ts",
  "./communityMentionBroadcasts.ts",
  "./communityAttention.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityPods.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);
const refs = internal as any;
const START = 1_800_000_000_000;
// Past the tag email's 15 minute wait for the dot.
const AFTER_GRACE = 20 * 60_000;

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
  const outsiderId = await user("outsider");
  const adminId = await user("admin");
  const communityId = await ctx.db.insert("communities", {
    ownerId, name: "Pod signals", slug: "pod-signals", visibility: "unlisted", entryPolicy: "open",
    inferenceFundingPolicy: "managed_required", lifecycleStatus: "active", lifecycleGeneration: 0, createdAt: 1, updatedAt: 1,
  });
  const membership = (userId: any, role: "member" | "admin" = "member") => ctx.db.insert("communityMemberships", {
    communityId, userId, role, state: "active", createdAt: 1, updatedAt: 1,
  });
  const memberMembershipId = await membership(memberId);
  const friendMembershipId = await membership(friendId);
  await membership(outsiderId);
  await membership(adminId, "admin");
  await ctx.db.insert("communityChannels", {
    communityId, systemRole: "general", name: "General", slug: "general", accessMode: "all_members",
    postingPolicy: "members", position: 0, status: "active", createdAt: 1, updatedAt: 1,
  });
  const podId = await ctx.db.insert("communityChannels", {
    communityId, name: "Founders", slug: "founders", accessMode: "restricted",
    postingPolicy: "members", position: 1, status: "active", createdAt: 1, updatedAt: 1,
  });
  for (const [userId, membershipId] of [[memberId, memberMembershipId], [friendId, friendMembershipId]] as const) {
    await ctx.db.insert("communityChannelParticipants", {
      communityId, channelId: podId, principalKey: `user:${userId}`, membershipId, membershipActivationSequence: 0,
      status: "active", createdByUserId: ownerId, createdAt: 1, updatedAt: 1,
    });
  }
  const podRecordId = await ctx.db.insert("communityPods", { communityId, channelId: podId, purpose: "Founders helping founders", createdAt: 1, updatedAt: 1 });
  return { ownerId, memberId, friendId, outsiderId, adminId, communityId, podId, podRecordId };
}

type PodRow = { channel_slug: string; chat: boolean; mentions: boolean };
// What the web reads: both sections of the paged attention query, combined.
async function attentionOf(t: any, subject: string, communityId: any) {
  const client = t.withIdentity({ subject });
  const page = (section: "shared" | "private") => client.query(api.communityAttention.listMyCommunityAttentionPage,
    { communityId, section, paginationOpts: { numItems: 10, cursor: null } });
  const [shared, own] = await Promise.all([page("shared"), page("private")]);
  const channels = [...shared.page, ...own.page] as PodRow[];
  return {
    chat: shared.attention.chat || own.attention.chat,
    mentions: shared.attention.mentions || own.attention.mentions,
    pod: channels.find((row) => row.channel_slug === "founders") ?? null,
  };
}

function at(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START + ms);
}

async function post(t: any, subject: string, f: any, key: string, text: string, mentions?: Array<Record<string, string>>) {
  return await t.withIdentity({ subject }).mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.podId, idempotencyKey: key, text, ...(mentions ? { mentions } : {}),
  });
}

test("a pod's dot: the people in it see new messages, nobody else does, and reading clears it", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "friend", f, "plain", "Anyone around?");

  // In the pod: the quiet dot, no tag.
  expect((await attentionOf(t, "member", f.communityId)).pod).toMatchObject({ chat: true, mentions: false });
  // Your own message never lights your own dot.
  expect((await attentionOf(t, "friend", f.communityId)).pod).toMatchObject({ chat: false, mentions: false });
  // Not in the pod: no row at all, and nothing in the community's dot.
  expect(await attentionOf(t, "outsider", f.communityId)).toEqual({ chat: false, mentions: false, pod: null });
  // The owner and an admin can open every pod, but this one isn't theirs.
  for (const host of ["owner", "admin"]) {
    const seen = await attentionOf(t, host, f.communityId);
    expect(seen.pod).toMatchObject({ chat: false, mentions: false });
    expect(seen.chat).toBe(false);
  }

  // Opening the room marks it read the way a channel's does.
  at(2_000);
  await t.withIdentity({ subject: "member" }).mutation(api.communityAttention.acknowledgeCommunityChatRead,
    { communityId: f.communityId, channelId: f.podId, throughAtMs: START + 2_000 });
  expect((await attentionOf(t, "member", f.communityId)).pod).toMatchObject({ chat: false, mentions: false });

  // The owner hosting the pod is in it: now its activity is theirs too.
  await t.run((ctx) => ctx.db.patch(f.podRecordId, { hostUserIds: [f.ownerId] }));
  expect((await attentionOf(t, "owner", f.communityId)).pod).toMatchObject({ chat: true });
  expect((await attentionOf(t, "admin", f.communityId)).pod).toMatchObject({ chat: false });
});

test("a tag in a pod lights the accent dot for the person tagged only, even a host who isn't in it", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "friend", f, "tag", "@member @owner can you look?", [{ userId: f.memberId }, { userId: f.ownerId }]);

  expect((await attentionOf(t, "member", f.communityId)).pod).toMatchObject({ chat: true, mentions: true });
  expect((await attentionOf(t, "friend", f.communityId)).pod).toMatchObject({ chat: false, mentions: false });
  expect(await attentionOf(t, "outsider", f.communityId)).toEqual({ chat: false, mentions: false, pod: null });
  // The owner isn't in the pod: no quiet dot, but the tag reaches them.
  expect((await attentionOf(t, "owner", f.communityId)).pod).toMatchObject({ chat: false, mentions: true });
  expect((await attentionOf(t, "admin", f.communityId)).pod).toMatchObject({ chat: false, mentions: false });

  at(2_000);
  await t.withIdentity({ subject: "member" }).mutation(api.communityAttention.acknowledgeCommunityChatRead,
    { communityId: f.communityId, channelId: f.podId, throughAtMs: START + 2_000 });
  expect((await attentionOf(t, "member", f.communityId)).pod).toMatchObject({ chat: false, mentions: false });
});

test("a pod can't tag someone who can't read it", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await expect(post(t, "friend", f, "outsider-tag", "@outsider hi", [{ userId: f.outsiderId }]))
    .rejects.toThrow("interaction_mention_user_not_allowed");
});

test("tag email in a pod: a tag sends the channel's tag email, a plain post sends none", async () => {
  sendEmail.mockClear();
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "friend", f, "plain", "Morning all");
  at(1_000 + AFTER_GRACE);
  await t.action(refs.communityMentionEmails.processPendingMentionEmailsInternal, {});
  expect(await t.run((ctx) => ctx.db.query("emailOutbox").collect())).toEqual([]);

  at(2_000 + AFTER_GRACE);
  await post(t, "friend", f, "tag", "@member your deck?", [{ userId: f.memberId }]);
  at(2_000 + 2 * AFTER_GRACE);
  await t.action(refs.communityMentionEmails.processPendingMentionEmailsInternal, {});
  const outbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
  expect(outbox).toHaveLength(1);
  expect(outbox[0]).toMatchObject({ kind: "mention_notification", recipientUserId: f.memberId, communityId: f.communityId });
});

test("@everybody in a pod reaches the people who can read it, never the whole community", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  at(1_000);
  await post(t, "owner", f, "everybody", "@everybody call moved to Friday", [{ roleKey: "everybody" }]);
  const broadcast = await t.run(async (ctx) => (await ctx.db.query("communityMentionBroadcasts").collect())[0]);
  expect(broadcast).toMatchObject({ channelId: f.podId });
  await t.mutation(refs.communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal,
    { broadcastId: broadcast!._id, nowMs: START + 1_000 });
  const reached = await t.run(async (ctx) => (await ctx.db.query("communityInteractionMentions").collect())
    .filter((row) => row.mentionKind === "user" && row.notifyState !== "suppressed")
    .map((row) => String(row.mentionedUserId)).sort());
  // The pod's members, and an admin (who can open every pod); not the member
  // outside it, and not the owner who wrote it.
  expect(reached).toEqual([String(f.memberId), String(f.friendId), String(f.adminId)].sort());
  expect((await attentionOf(t, "outsider", f.communityId))).toEqual({ chat: false, mentions: false, pod: null });
});
