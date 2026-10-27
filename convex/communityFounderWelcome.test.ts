/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  buildCommunityFounderWelcomeText,
  communityFounderWelcomeIdempotencyKey,
} from "../shared/communityFounderWelcome";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communityInteractions.ts",
  "./communityLifecycle.ts",
  "./communityInteractionEvidence.ts",
  "./communityAgentConcierge.ts",
  "./communityAgentServeWorker.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 1_780_000_000_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: "founder-welcome-owner",
      displayName: "Ada Founder",
      handle: "ada-founder",
      normalizedHandle: "ada-founder",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: "founder-welcome-outsider",
      displayName: "Outsider",
      handle: "founder-welcome-outsider",
      normalizedHandle: "founder-welcome-outsider",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: ownerId,
      displayName: "Ada Founder",
      avatarUrl: "https://example.com/ada-founder.png",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", {
        userId: ownerId,
        documentKey: document.key,
        documentVersion: document.version,
        acceptedAt: nowMs,
        source: "test",
        createdAt: nowMs,
      });
    }
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "founder-welcome",
      name: "Founder Welcome",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { channelId, communityId, outsiderId, ownerId };
  });
}

test("founder bootstrap creates one deterministic canonical welcome root", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const idempotencyKey = communityFounderWelcomeIdempotencyKey(fixture.communityId);
  const createWelcome = () => t.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      idempotencyKey,
      founderBootstrap: true,
    },
  );

  await expect(createWelcome()).resolves.toMatchObject({
    interaction: { kind: "root", deduped: false },
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.ownerId, { displayName: "Renamed Founder" });
    await ctx.db.patch(fixture.communityId, { name: "Renamed Community" });
  });
  await expect(createWelcome()).resolves.toMatchObject({
    interaction: { kind: "root", deduped: true },
  });

  const stored = await t.run(async (ctx) => {
    const roots = await ctx.db.query("communityInteractionRoots").collect();
    const blocks = await ctx.db.query("communityInteractionContentBlocks").collect();
    return { roots, blocks };
  });
  expect(stored.roots).toHaveLength(1);
  expect(stored.roots[0]).toMatchObject({
    communityId: fixture.communityId,
    channelId: fixture.channelId,
    actorType: "community_agent",
    actorAgentKey: "community_agent",
    status: "live",
    visibilityScope: "community",
  });
  expect(stored.blocks).toHaveLength(1);
  expect(stored.blocks[0]?.text).toBe(buildCommunityFounderWelcomeText({
    founderDisplayName: "Ada Founder",
    communityName: "Founder Welcome",
  }));
});

test("founder welcome prefers the canonical product profile over the auth identity name", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.ownerId, { displayName: "OAuth Provider Name" });
    const detail = await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q) => q.eq("userId", fixture.ownerId))
      .unique();
    if (!detail) throw new Error("profile_detail_required");
    await ctx.db.patch(detail._id, { displayName: "Chosen Product Name" });
  });
  await t.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      idempotencyKey: communityFounderWelcomeIdempotencyKey(fixture.communityId),
      founderBootstrap: true,
    },
  );
  const blocks = await t.run(async (ctx) => ctx.db.query("communityInteractionContentBlocks").collect());
  expect(blocks[0]?.text).toContain("Hi Chosen Product Name");
  expect(blocks[0]?.text).not.toContain("OAuth Provider Name");
});

test("canonical community creation schedules the welcome without blocking durability", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    await createFixture(t);
    const asOwner = t.withIdentity({ subject: "founder-welcome-owner" });
    const created = await asOwner.mutation(api.communityLifecycle.createCommunity, {
      name: "Scheduled Welcome",
      slug: "scheduled-welcome",
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const communityId = created.id as Id<"communities">;

    const roots = await t.run(async (ctx) => await ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_idempotencyKey", (q) => q
        .eq("communityId", communityId)
        .eq(
          "idempotencyKey",
          `community_canonical_agent:root:founder_welcome:v1:${created.id}`,
        ))
      .collect());
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      actorType: "community_agent",
      actorAgentKey: "community_agent",
      status: "live",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("founder bootstrap rejects non-owners and any widened write shape", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const idempotencyKey = communityFounderWelcomeIdempotencyKey(fixture.communityId);

  await expect(t.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.outsiderId,
      communityId: fixture.communityId,
      idempotencyKey,
      founderBootstrap: true,
    },
  )).rejects.toThrow("community_founder_welcome_owner_required");
  await expect(t.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      idempotencyKey: "wrong-key",
      founderBootstrap: true,
    },
  )).rejects.toThrow("community_founder_welcome_contract_invalid");
  await expect(t.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      idempotencyKey,
      founderBootstrap: true,
      mentions: [{ agentKey: "community_agent" }],
    },
  )).rejects.toThrow("community_founder_welcome_contract_invalid");
});

test("community-agent authored turns reject self-mentions", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: "founder-welcome-owner" });

  await expect(asOwner.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.ownerId,
      authSubject: "founder-welcome-owner",
      communityId: fixture.communityId,
      idempotencyKey: "agent-self-mention",
      text: "@Founder Welcome should not wake itself.",
      mentions: [{ agentKey: "community_agent" }],
    },
  )).rejects.toThrow("interaction_mention_agent_self_reference");

  const [roots, mentions, requests] = await t.run(async (ctx) => await Promise.all([
    ctx.db.query("communityInteractionRoots").collect(),
    ctx.db.query("communityInteractionMentions").collect(),
    ctx.db.query("communityAgentServeRequests").collect(),
  ]));
  expect(roots).toHaveLength(0);
  expect(mentions).toHaveLength(0);
  expect(requests).toHaveLength(0);
});

test("human-authored turns can still mention the community agent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: "founder-welcome-owner" });

  await asOwner.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    {
      communityId: fixture.communityId,
      channelId: fixture.channelId,
      idempotencyKey: "human-community-agent-mention",
      text: "@Founder Welcome what should I do first?",
      mentions: [{ agentKey: "community_agent" }],
    },
  );

  const [mentions, requests] = await t.run(async (ctx) => await Promise.all([
    ctx.db.query("communityInteractionMentions").collect(),
    ctx.db.query("communityAgentServeRequests").collect(),
  ]));
  expect(mentions).toHaveLength(1);
  expect(mentions[0]).toMatchObject({
    mentionKind: "community_agent",
    mentionedAgentKey: "community_agent",
    notifyState: "sent",
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    triggerKind: "mention",
    requesterUserId: fixture.ownerId,
    status: "queued",
  });
});

test("replying to the welcome root enters the existing direct-reply serve path", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const welcome = await t.mutation(
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      idempotencyKey: communityFounderWelcomeIdempotencyKey(fixture.communityId),
      founderBootstrap: true,
    },
  );
  const asOwner = t.withIdentity({ subject: "founder-welcome-owner" });
  await asOwner.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: fixture.communityId,
    channelId: fixture.channelId,
    rootId: welcome.interaction.root_id as any,
    idempotencyKey: "reply-to-founder-welcome",
    text: "What should I do first?",
  });

  const requests = await t.run(async (ctx) =>
    await ctx.db.query("communityAgentServeRequests").collect()
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    communityId: fixture.communityId,
    triggerKind: "direct_reply",
    sourceRootId: welcome.interaction.root_id,
    requesterUserId: fixture.ownerId,
    sponsorUserId: fixture.ownerId,
    status: "queued",
  });
});
