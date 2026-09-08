/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
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
  const otherCommunity = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[1] });
  const otherMember = await f.b.mutation(api.threads.ensureCommunityAgentConversation, args);
  expect(new Set([first.thread_id, otherCommunity.thread_id, otherMember.thread_id]).size).toBe(3);
  await expect(f.b.query(api.threads.listCloudThreadMessages, { threadId: first.thread_id as any })).rejects.toThrow("thread_access_denied");
  expect(await f.t.run(ctx => ctx.db.query("memberAgentChannels").collect())).toHaveLength(3);
});

test("community binding cannot change or clear and access is rechecked after revocation", async () => {
  const f = await fixture();
  const first = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] });
  await f.a.mutation(api.threads.addCloudThreadMessage, { threadId: first.thread_id as any, messageKey: "private-note", role: "user", contentJson: { text: "Private note" } });
  await expect(f.a.mutation(api.threads.ensureCloudRuntimeRunStarted, { threadId: first.thread_id as any, runId: "not-enabled" })).rejects.toThrow("community_conversation_runtime_not_enabled");
  for (const communityId of [f.communities[1], null]) {
    await expect(f.a.mutation(api.threads.setCloudThreadContext, { threadId: first.thread_id as any, expectedContextVersion: 0, communityId })).rejects.toThrow("community_conversation_scope_immutable");
  }
  await f.t.run(ctx => ctx.db.delete(f.memberships[0]));
  await expect(f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] })).rejects.toThrow();
  await expect(f.a.query(api.threads.listCloudThreadMessages, { threadId: first.thread_id as any })).rejects.toThrow();
  await expect(f.a.query(api.threads.getCloudThreadContext, { threadId: first.thread_id as any })).rejects.toThrow();
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
  const old = await f.a.mutation(api.threads.ensureMemberAgentGlobalChannel, { initialCommunityId: f.communities[0] });
  const before = await f.t.run(ctx => ctx.db.get(old.thread_id as any));
  const current = await f.a.mutation(api.threads.ensureCommunityAgentConversation, { communityId: f.communities[0] });
  expect(current.thread_id).not.toBe(old.thread_id);
  expect(await f.t.run(ctx => ctx.db.get(old.thread_id as any))).toEqual(before);
  const listed = await f.a.query(api.threads.listCloudThreadsByOwner, {});
  expect(listed.map(row => String(row._id))).toContain(old.thread_id);
  expect(listed.map(row => String(row._id))).not.toContain(current.thread_id);
});
