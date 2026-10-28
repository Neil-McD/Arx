/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { buildCommunityConversationThreadKey, parseCommunityConversationIdentity } from "../shared/communityConversationIdentity";
import { COMMUNITY_AGENT_GLOBAL_SCOPE_KEY, buildGlobalCommunityAgentEpisodeThreadKey } from "../shared/runtimeInvocationSurface";
const modules = import.meta.glob(["./threads.ts", "./_generated/**/*.*s"]);

async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const user = (authSubject: string) => ctx.db.insert("users", { authSubject, createdAt: 1, updatedAt: 1 });
    const ownerId = await user("owner");
    const a = await user("a");
    const b = await user("b");
    const communities = [];
    const memberships = [];
    for (const slug of ["one", "two"]) {
      const communityId = await ctx.db.insert("communities", { ownerId, name: slug, slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: 1, updatedAt: 1 });
      communities.push(communityId);
      for (const userId of [a, b]) memberships.push(await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", active: true, createdAt: 1, updatedAt: 1 }));
    }
    return { communities, memberships };
  });
  return { t, ...data, a: t.withIdentity({ subject: "a" }), b: t.withIdentity({ subject: "b" }) };
}

test("community conversations are idempotent and isolated by member and community", async () => {
  const f = await fixture();
  const args = { communityId: f.communities[0] };
  const first = await f.a.mutation(api.threads.ensureCommunityAgentConversation, args);
  expect(await f.a.mutation(api.threads.ensureCommunityAgentConversation, args)).toEqual(first);
  expect((await f.a.mutation(api.threads.ensureCloudThread, { threadKey: first.thread_key }))._id).toBe(first.thread_id);
  await expect(f.a.mutation(api.threads.ensureCloudThread, { threadKey: first.thread_key, communityId: f.communities[1] })).rejects.toThrow("community_conversation_scope_immutable");
  const otherCommunity = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[1] });
  const otherMember = await f.b.mutation(api.threads.ensureCommunityAgentConversation, args);
  expect(new Set([first.thread_id, otherCommunity.thread_id, otherMember.thread_id]).size).toBe(3);
  await expect(f.b.query(api.threads.listNewestCloudThreadMessages, { threadId: first.thread_id as any })).rejects.toThrow("thread_access_denied");
  expect(await f.t.run(ctx => ctx.db.query("memberAgentChannels").collect())).toHaveLength(3);
});

test("community binding cannot change or clear and access is rechecked after revocation", async () => {
  const f = await fixture();
  const first = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] });
  await f.a.mutation(api.threads.addCloudThreadMessage, { threadId: first.thread_id as any, messageKey: "private-note", role: "user", contentJson: { text: "Private note" } });
  await expect(f.a.mutation(api.threads.ensureCloudRuntimeRunStarted, { threadId: first.thread_id as any, runId: "wrong-community", communityId: f.communities[1] })).rejects.toThrow("runtime_run_community_lens_mismatch");
  await expect(f.a.mutation(api.threads.ensureCloudThread, { threadKey: first.thread_key, communityId: f.communities[1] })).rejects.toThrow("community_conversation_scope_immutable");
  await f.t.run(ctx => ctx.db.delete(f.memberships[0]));
  await expect(f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] })).rejects.toThrow();
  await expect(f.a.query(api.threads.listNewestCloudThreadMessages, { threadId: first.thread_id as any })).rejects.toThrow();
  await expect(f.a.query(api.threads.getCloudThreadByThreadKey, { threadKey: first.thread_key })).rejects.toThrow();
  await expect(f.a.query(api.threads.getCloudThreadMessageByOwnerMessageKey, { messageKey: "private-note" })).rejects.toThrow();
  await expect(f.a.mutation(api.threads.addCloudThreadMessage, { threadId: first.thread_id as any, role: "user", contentJson: { text: "Denied" } })).rejects.toThrow();
});

test("authentication is required and generic thread creation cannot claim scoped keys", async () => {
  const f = await fixture();
  await expect(f.t.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] })).rejects.toThrow();
  await expect(f.a.mutation(api.threads.ensureCloudThread, { threadKey: `community-conversation:${f.communities[0]}:episode:1`, communityId: f.communities[0] })).rejects.toThrow("community_conversation_use_scoped_endpoint");
});

test("global conversation history is not adopted or modified", async () => {
  const f = await fixture();
  // A global conversation from the retired personal-agent era, as stored history.
  const old = await f.t.run(async ctx => {
    const owner = await ctx.db.query("users").withIndex("by_authSubject", q => q.eq("authSubject", "a")).unique();
    const threadId = await ctx.db.insert("threads", { ownerId: owner!._id, threadKey: buildGlobalCommunityAgentEpisodeThreadKey(1), titleSource: "auto", communityId: f.communities[0], contextVersion: 0, lastSeq: 0, createdAt: 1, updatedAt: 1 });
    const channelId = await ctx.db.insert("memberAgentChannels", { ownerId: owner!._id, scopeKey: COMMUNITY_AGENT_GLOBAL_SCOPE_KEY, nextOrdinal: 2, createdAt: 1, updatedAt: 1 });
    const episodeId = await ctx.db.insert("memberAgentEpisodes", { channelId, threadId, ordinal: 1, status: "active", startedAt: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(channelId, { activeEpisodeId: episodeId });
    return { thread_id: String(threadId) };
  });
  const before = await f.t.run(ctx => ctx.db.get(old.thread_id as any));
  const current = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] });
  expect(current.thread_id).not.toBe(old.thread_id);
  expect(await f.t.run(ctx => ctx.db.get(old.thread_id as any))).toEqual(before);
});

test("concurrent resolution creates one container and concurrent rollover creates one replacement", async () => {
  const f = await fixture();
  const communityId = f.communities[0];
  const resolved = await Promise.all([1, 2, 3].map(() => f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId })));
  expect(new Set(resolved.map(row => row.channel_id)).size).toBe(1);
  const original = resolved[0];
  const results = await Promise.allSettled([1, 2].map(() => f.a.mutation(api.threads.startNewCommunityAgentConversation, { communityId, expectedActiveEpisodeId: original.episode_id as any })));
  expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(row => row.status === "rejected")).toHaveLength(1);
  const episodes = await f.t.run(ctx => ctx.db.query("memberAgentEpisodes").collect());
  expect(episodes).toHaveLength(2);
  expect(episodes.filter(row => row.status === "active")).toHaveLength(1);
  expect(await f.t.run(ctx => ctx.db.query("memberAgentChannels").collect())).toHaveLength(1);
});

test("closed sessions remain readable but reject writes; history is member scoped", async () => {
  const f = await fixture();
  const communityId = f.communities[0];
  const first = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId });
  await f.a.mutation(api.threads.addCloudThreadMessage, { threadId: first.thread_id as any, role: "user", contentJson: { text: "Keep this history" } });
  const second = await f.a.mutation(api.threads.startNewCommunityAgentConversation, { communityId, expectedActiveEpisodeId: first.episode_id as any });
  await expect(f.a.mutation(api.threads.addCloudThreadMessage, { threadId: first.thread_id as any, role: "user", contentJson: { text: "Late message" } })).rejects.toThrow("member_agent_episode_not_active");
  expect(await f.a.query(api.threads.listNewestCloudThreadMessages, { threadId: first.thread_id as any })).toHaveLength(1);
  await expect(f.b.query(api.threads.listNewestCloudThreadMessages, { threadId: second.thread_id as any })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.memberships[0], { active: false, revokedAt: Date.now() }));
  await expect(f.a.query(api.threads.listNewestCloudThreadMessages, { threadId: second.thread_id as any })).rejects.toThrow();
  await expect(f.a.mutation(api.threads.startNewCommunityAgentConversation, { communityId, expectedActiveEpisodeId: second.episode_id as any })).rejects.toThrow();
});

test("canonical identity fails closed and stored relationships must match", async () => {
  expect(buildCommunityConversationThreadKey("one", 2)).toBe("community-conversation:one:episode:2");
  expect(() => buildCommunityConversationThreadKey("one", 0)).toThrow();
  expect(() => parseCommunityConversationIdentity({ threadKey: "community-conversation:broken", communityId: "one" })).toThrow();
  const f = await fixture();
  const first = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] });
  await f.t.run(ctx => ctx.db.patch(first.episode_id as any, { ordinal: 99 }));
  await expect(f.a.query(api.threads.getCloudThreadByThreadKey, { threadKey: first.thread_key })).rejects.toThrow("community_conversation_relationship_invalid");
});

test("runtime records use the bound community and running turns prevent rollover", async () => {
  const f = await fixture();
  const communityId = f.communities[0];
  const first = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId });
  await f.a.mutation(api.threads.addCloudThreadMessage, { threadId: first.thread_id as any, messageKey: "runtime-user", role: "user", contentJson: { text: "Help me" } });
  const run = await f.a.mutation(api.threads.ensureCloudRuntimeRunStarted, { threadId: first.thread_id as any, runId: "scoped-runtime" });
  expect(run.communityId).toBe(communityId);
  await expect(f.a.mutation(api.threads.startNewCommunityAgentConversation, { communityId, expectedActiveEpisodeId: first.episode_id as any })).rejects.toThrow("community_conversation_turn_running");
  await f.t.run(ctx => ctx.db.patch(f.memberships[0], { active: false, revokedAt: Date.now() }));
  await expect(f.t.query(internal.threads.listCommunityAgentRuntimeMessagesInternal, { ownerId: run.ownerId, threadId: first.thread_id as any, expectedUserMessageKey: "runtime-user" })).rejects.toThrow();
});
