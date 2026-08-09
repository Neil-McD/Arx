/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import {
  intakeCommunityAgentTurn,
  type ConciergeMentionRow,
} from "./communityAgentConciergeCore";

const modules = import.meta.glob([
  "./communityAgentConcierge.ts",
  "./communityAgentServeWorker.ts",
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  return await t.run(async (ctx) => {
    const nowMs = 1_000;
    const userId = await ctx.db.insert("users", {
      authSubject: `concierge-${suffix}`,
      displayName: `Concierge ${suffix}`,
      handle: `concierge-${suffix}`,
      normalizedHandle: `concierge-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("operatorRoles", {
      userId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: `concierge-${suffix}`,
      name: `Concierge ${suffix}`,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId,
      role: "admin",
      accessSource: "manual_grant",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "general",
      name: "General",
      systemRole: "general",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdByUserId: userId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId,
      actorType: "human",
      actorUserId: userId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "A canonical source turn",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `concierge-root-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { channelId, communityId, rootId, userId };
  });
}

async function insertReply(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  args: {
    seq: number;
    actorType: "human" | "personal_agent" | "community_agent";
    targetReplyId?: any;
  },
) {
  return await t.run(async (ctx) => await ctx.db.insert("communityInteractionReplies", {
    communityId: fixture.communityId,
    channelId: fixture.channelId,
    rootId: fixture.rootId,
    seq: args.seq,
    actorType: args.actorType,
    ...(args.actorType === "human" ? { actorUserId: fixture.userId } : {}),
    ...(args.actorType === "community_agent" ? { actorAgentKey: "community_agent" } : {}),
    ...(args.actorType === "personal_agent"
      ? { actorUserId: fixture.userId, actorAgentKey: `personal_agent:${fixture.userId}` }
      : {}),
    ...(args.targetReplyId ? { targetReplyId: args.targetReplyId } : {}),
    status: "live",
    visibilityScope: "community",
    contentSummary: `Reply ${args.seq}`,
    reactionSummary: [],
    idempotencyKey: `concierge-reply-${fixture.rootId}-${args.seq}`,
    createdAt: 1_000 + args.seq,
    updatedAt: 1_000 + args.seq,
  }));
}

async function insertMention(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  args: { rootId?: any; replyId?: any },
): Promise<ConciergeMentionRow> {
  return await t.run(async (ctx) => {
    const mentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId: fixture.communityId,
      channelId: fixture.channelId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      mentionKind: "community_agent",
      mentionedAgentKey: "community_agent",
      notifyState: "pending",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    return {
      _id: mentionId,
      communityId: fixture.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      mentionKind: "community_agent",
      mentionedAgentKey: "community_agent",
      notifyState: "pending",
    };
  });
}

async function requests(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.query("communityAgentServeRequests").collect());
}

describe("community-agent canonical source-turn admission", () => {
  test("an explicit mention creates one durable request and retry deduplicates", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "mention");
    const mention = await insertMention(t, fixture, { rootId: fixture.rootId });

    const first = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      mention,
      nowMs: 3_000,
    }));
    const retry = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      mention,
      nowMs: 3_001,
    }));

    expect(first).toMatchObject({ status: "queued", trigger_kind: "mention" });
    expect(retry).toMatchObject({
      status: "duplicate",
      request_id: first.request_id,
      invocation_key: first.invocation_key,
    });
    expect(await requests(t)).toHaveLength(1);
  });

  test("a direct reply to the community agent creates one request without a mention", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "direct-reply");
    const agentReplyId = await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    const humanReplyId = await insertReply(t, fixture, {
      seq: 2,
      actorType: "human",
      targetReplyId: agentReplyId,
    });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "queued", trigger_kind: "direct_reply" });
    expect(await requests(t)).toHaveLength(1);
  });

  test("prior community-agent participation does not wake the agent", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "participating");
    await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    const humanReplyId = await insertReply(t, fixture, { seq: 2, actorType: "human" });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "ignored", intake_reason: "not_addressed" });
    expect(await requests(t)).toHaveLength(0);
  });

  test("a human reply continues an agent-authored root without another mention", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "agent-root");
    await t.run(async (ctx) => await ctx.db.patch(fixture.rootId, {
      actorType: "community_agent",
      actorUserId: undefined,
      actorAgentKey: "community_agent",
    }));
    const humanReplyId = await insertReply(t, fixture, { seq: 1, actorType: "human" });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "queued", trigger_kind: "direct_reply" });
    expect(await requests(t)).toHaveLength(1);
  });

  test("a reply targeting a human under an agent-authored root does not wake the agent", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "agent-root-human-target");
    await t.run(async (ctx) => await ctx.db.patch(fixture.rootId, {
      actorType: "community_agent",
      actorUserId: undefined,
      actorAgentKey: "community_agent",
    }));
    const firstHumanReplyId = await insertReply(t, fixture, { seq: 1, actorType: "human" });
    const secondHumanReplyId = await insertReply(t, fixture, {
      seq: 2,
      actorType: "human",
      targetReplyId: firstHumanReplyId,
    });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: secondHumanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "ignored", intake_reason: "not_addressed" });
    expect(await requests(t)).toHaveLength(0);
  });

  test("a human-targeted reply stays silent even after the agent participated", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "participated-human-target");
    await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    const firstHumanReplyId = await insertReply(t, fixture, { seq: 2, actorType: "human" });
    const secondHumanReplyId = await insertReply(t, fixture, {
      seq: 3,
      actorType: "human",
      targetReplyId: firstHumanReplyId,
    });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: secondHumanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "ignored", intake_reason: "not_addressed" });
    expect(await requests(t)).toHaveLength(0);
  });

  test("a reply to a noncanonical community agent does not wake the canonical agent", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "noncanonical-agent-target");
    const agentReplyId = await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    await t.run(async (ctx) => await ctx.db.patch(agentReplyId, { actorAgentKey: "other_agent" }));
    const humanReplyId = await insertReply(t, fixture, {
      seq: 2,
      actorType: "human",
      targetReplyId: agentReplyId,
    });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "ignored", intake_reason: "not_addressed" });
    expect(await requests(t)).toHaveLength(0);
  });

  test("a reply to a hidden community-agent turn does not wake the agent", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "hidden-agent-target");
    const agentReplyId = await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    await t.run(async (ctx) => await ctx.db.patch(agentReplyId, { status: "hidden" }));
    const humanReplyId = await insertReply(t, fixture, {
      seq: 2,
      actorType: "human",
      targetReplyId: agentReplyId,
    });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "ignored", intake_reason: "not_addressed" });
    expect(await requests(t)).toHaveLength(0);
  });

  test("mention plus direct reply collapses to one request for the source turn", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "cross-signal");
    const agentReplyId = await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    const humanReplyId = await insertReply(t, fixture, {
      seq: 2,
      actorType: "human",
      targetReplyId: agentReplyId,
    });
    const mention = await insertMention(t, fixture, { replyId: humanReplyId });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      mention,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "queued", trigger_kind: "direct_reply" });
    expect(await requests(t)).toHaveLength(1);
  });

  test("an ordinary human conversation creates no serve request", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "human-only");
    const humanReplyId = await insertReply(t, fixture, { seq: 1, actorType: "human" });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: humanReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "ignored", intake_reason: "not_addressed" });
    expect(await requests(t)).toHaveLength(0);
  });

  test("an agent-authored addressed source is suppressed and never queued", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "anti-loop");
    const firstAgentReplyId = await insertReply(t, fixture, { seq: 1, actorType: "community_agent" });
    const secondAgentReplyId = await insertReply(t, fixture, {
      seq: 2,
      actorType: "community_agent",
      targetReplyId: firstAgentReplyId,
    });

    const result = await t.run(async (ctx) => await intakeCommunityAgentTurn({
      ctx,
      communityId: fixture.communityId,
      rootId: fixture.rootId,
      replyId: secondAgentReplyId,
      nowMs: 3_000,
    }));

    expect(result).toMatchObject({ status: "skipped", intake_reason: "source_not_human" });
    expect(await requests(t)).toEqual([
      expect.objectContaining({ status: "skipped", intakeReason: "source_not_human" }),
    ]);
  });
});
