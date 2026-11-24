/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { intakeCommunityAgentTurn } from "./communityAgentConciergeCore";
import {
  THREAD_FOLLOWUP_MAX_CONSECUTIVE,
  THREAD_FOLLOWUP_SILENCE_TOKEN,
  THREAD_FOLLOWUP_WINDOW_MS,
  isSilentThreadFollowupReply,
  shouldAutoFollowThreadReply,
} from "../shared/communityThreadFollowup";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";

const modules = import.meta.glob([
  "./communityAgentConcierge.ts",
  "./communityAgentServeWorker.ts",
  "./communityInteractionEvidence.ts",
  "./communityMemberCoach.ts",
  "./_generated/**/*.*s",
]);

async function createThreadFixture(t: ReturnType<typeof convexTest>, suffix: string, baseTimeMs = 100_000) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `followup-owner-${suffix}`,
      displayName: `Owner ${suffix}`,
      handle: `followup-owner-${suffix}`,
      normalizedHandle: `followup-owner-${suffix}`,
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: `followup-member-${suffix}`,
      displayName: `Member ${suffix}`,
      handle: `followup-member-${suffix}`,
      normalizedHandle: `followup-member-${suffix}`,
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
    });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `followup-${suffix}`,
      name: `Followup ${suffix}`,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      state: "active",
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
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
      createdByUserId: ownerId,
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId,
      actorType: "human",
      actorUserId: memberId,
      kind: "question",
      status: "live",
      visibilityScope: "community",
      contentSummary: "How do I start?",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `followup-root-${suffix}`,
      createdAt: baseTimeMs,
      updatedAt: baseTimeMs,
    });
    return {
      ownerId,
      ownerAuthSubject: `followup-owner-${suffix}`,
      memberId,
      communityId,
      channelId,
      rootId,
      baseTimeMs,
    };
  });
}

async function addReply(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createThreadFixture>>,
  args: {
    seq: number;
    actorType: "human" | "community_agent";
    actorUserId?: any;
    targetReplyId?: any;
    createdAt: number;
  },
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("communityInteractionReplies", {
      communityId: fixture.communityId,
      channelId: fixture.channelId,
      rootId: fixture.rootId,
      seq: args.seq,
      actorType: args.actorType,
      ...(args.actorType === "human" ? { actorUserId: args.actorUserId ?? fixture.memberId } : {}),
      ...(args.actorType === "community_agent" ? { actorAgentKey: "community_agent" } : {}),
      ...(args.targetReplyId ? { targetReplyId: args.targetReplyId } : {}),
      status: "live",
      visibilityScope: "community",
      contentSummary: `Reply ${args.seq}`,
      reactionSummary: [],
      idempotencyKey: `followup-reply-${fixture.rootId}-${args.seq}`,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    }),
  );
}

describe("smart thread follow-up without re-tagging", () => {
  test("pure gate and silence sentinel handle bounds, wrap-ups, and exclusions", () => {
    const now = 10_000_000;
    expect(
      shouldAutoFollowThreadReply({
        enabled: true,
        hasTargetReply: false,
        hasOtherMentions: false,
        lastAgentReplyCreatedAt: now - 10 * 60_000,
        consecutiveAutoFollowups: 0,
        nowMs: now,
      }),
    ).toEqual({ allowed: true });

    expect(
      shouldAutoFollowThreadReply({
        enabled: false,
        hasTargetReply: false,
        hasOtherMentions: false,
        lastAgentReplyCreatedAt: now - 60_000,
        consecutiveAutoFollowups: 0,
        nowMs: now,
      }),
    ).toEqual({ allowed: false, reason: "disabled" });

    expect(
      shouldAutoFollowThreadReply({
        enabled: true,
        hasTargetReply: true,
        hasOtherMentions: false,
        lastAgentReplyCreatedAt: now - 60_000,
        consecutiveAutoFollowups: 0,
        nowMs: now,
      }),
    ).toEqual({ allowed: false, reason: "targets_other_reply" });

    expect(
      shouldAutoFollowThreadReply({
        enabled: true,
        hasTargetReply: false,
        hasOtherMentions: true,
        lastAgentReplyCreatedAt: now - 60_000,
        consecutiveAutoFollowups: 0,
        nowMs: now,
      }),
    ).toEqual({ allowed: false, reason: "mentions_other_member" });

    expect(
      shouldAutoFollowThreadReply({
        enabled: true,
        hasTargetReply: false,
        hasOtherMentions: false,
        lastAgentReplyCreatedAt: now - THREAD_FOLLOWUP_WINDOW_MS - 1,
        consecutiveAutoFollowups: 0,
        nowMs: now,
      }),
    ).toEqual({ allowed: false, reason: "window_expired" });

    expect(
      shouldAutoFollowThreadReply({
        enabled: true,
        hasTargetReply: false,
        hasOtherMentions: false,
        lastAgentReplyCreatedAt: now - 60_000,
        consecutiveAutoFollowups: THREAD_FOLLOWUP_MAX_CONSECUTIVE,
        nowMs: now,
      }),
    ).toEqual({ allowed: false, reason: "consecutive_cap_reached" });

    expect(isSilentThreadFollowupReply(THREAD_FOLLOWUP_SILENCE_TOKEN)).toBe(true);
    expect(isSilentThreadFollowupReply(" `[[silent]]`. ")).toBe(true);
    expect(isSilentThreadFollowupReply("")).toBe(true);
    expect(isSilentThreadFollowupReply("Sure, start with Lesson 1.")).toBe(false);
  });

  test("prompt bundle includes silence-by-default instruction only for thread_followup", () => {
    const base = {
      community: { name: "Sunrise Club", slug: "sunrise" },
      agent: { displayName: "Sunrise Guide" },
      threadContext: { rendered: "Member: thanks!" },
    };
    const followup = buildCommunityAgentServePromptBundle({ ...base, triggerKind: "thread_followup" });
    const mention = buildCommunityAgentServePromptBundle({ ...base, triggerKind: "mention" });

    const followupUser = String(followup.messages[1]?.content ?? "");
    const mentionUser = String(mention.messages[1]?.content ?? "");
    expect(followupUser).toContain(THREAD_FOLLOWUP_SILENCE_TOKEN);
    expect(followupUser).toContain("Silence is the default");
    expect(mentionUser).not.toContain(THREAD_FOLLOWUP_SILENCE_TOKEN);
  });

  test("queues thread_followup within 2h window, skips other-human replies/mentions and expired windows", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createThreadFixture(t, "window");

    // Guide answered at t+1m.
    await addReply(t, fixture, { seq: 1, actorType: "community_agent", createdAt: fixture.baseTimeMs + 60_000 });
    const humanReply1 = await addReply(t, fixture, { seq: 2, actorType: "human", createdAt: fixture.baseTimeMs + 10 * 60_000 });

    // Normal follow-up without mention queues as thread_followup.
    const queued = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: humanReply1,
        nowMs: fixture.baseTimeMs + 10 * 60_000,
      }),
    );
    expect(queued.status).toBe("queued");
    expect(queued.trigger_kind).toBe("thread_followup");

    // Reply mentioning another human is ignored ($0).
    const otherMentionReply = await addReply(t, fixture, { seq: 3, actorType: "human", createdAt: fixture.baseTimeMs + 11 * 60_000 });
    const ignoredMention = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: otherMentionReply,
        hasOtherMentions: true,
        nowMs: fixture.baseTimeMs + 11 * 60_000,
      }),
    );
    expect(ignoredMention.status).toBe("ignored");
    expect(ignoredMention.intake_reason).toBe("not_addressed");

    // Direct reply targeting another human's reply is ignored ($0).
    const humanTargetReply = await addReply(t, fixture, {
      seq: 4,
      actorType: "human",
      targetReplyId: humanReply1,
      createdAt: fixture.baseTimeMs + 12 * 60_000,
    });
    const ignoredTarget = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: humanTargetReply,
        nowMs: fixture.baseTimeMs + 12 * 60_000,
      }),
    );
    expect(ignoredTarget.status).toBe("ignored");

    // Reply after the 2-hour window expires is ignored ($0).
    const expiredAt = fixture.baseTimeMs + 60_000 + THREAD_FOLLOWUP_WINDOW_MS + 60_000;
    const lateReply = await addReply(t, fixture, { seq: 5, actorType: "human", createdAt: expiredAt });
    const ignoredLate = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: lateReply,
        nowMs: expiredAt,
      }),
    );
    expect(ignoredLate.status).toBe("ignored");
  });

  test("enforces 4-reply cap, ignores silent skips toward cap, resets on fresh tag, and obeys founder off-switch", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createThreadFixture(t, "cap-and-toggle");
    const agentAt = fixture.baseTimeMs + 60_000;
    await addReply(t, fixture, { seq: 1, actorType: "community_agent", createdAt: agentAt });

    // Seed 4 responded thread_followup requests on this thread.
    await t.run(async (ctx) => {
      for (let i = 0; i < THREAD_FOLLOWUP_MAX_CONSECUTIVE; i += 1) {
        await ctx.db.insert("communityAgentServeRequests", {
          communityId: fixture.communityId,
          agentKey: "community_agent",
          invocationKey: `seeded-followup-${i}`,
          triggerKind: "thread_followup",
          sourceRootId: fixture.rootId,
          requesterUserId: fixture.memberId,
          sponsorUserId: fixture.memberId,
          status: "responded",
          intakeReason: "accepted",
          createdAt: agentAt + (i + 1) * 1_000,
          updatedAt: agentAt + (i + 1) * 1_000,
        });
      }
    });

    // 5th auto follow-up is ignored.
    const cappedReply = await addReply(t, fixture, { seq: 2, actorType: "human", createdAt: agentAt + 10_000 });
    const capped = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: cappedReply,
        nowMs: agentAt + 10_000,
      }),
    );
    expect(capped.status).toBe("ignored");

    // A fresh explicit mention resets the consecutive follow-up counter.
    await t.run(async (ctx) => {
      await ctx.db.insert("communityAgentServeRequests", {
        communityId: fixture.communityId,
        agentKey: "community_agent",
        invocationKey: "fresh-mention-reset",
        triggerKind: "mention",
        sourceRootId: fixture.rootId,
        requesterUserId: fixture.memberId,
        sponsorUserId: fixture.memberId,
        status: "responded",
        intakeReason: "accepted",
        createdAt: agentAt + 20_000,
        updatedAt: agentAt + 20_000,
      });
    });

    const afterResetReply = await addReply(t, fixture, { seq: 3, actorType: "human", createdAt: agentAt + 30_000 });
    const afterReset = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: afterResetReply,
        nowMs: agentAt + 30_000,
      }),
    );
    expect(afterReset.status).toBe("queued");
    expect(afterReset.trigger_kind).toBe("thread_followup");

    // Finalizing that request with silent: true marks it skipped and writes zero replies.
    const followupRequestId = afterReset.request_id as Id<"communityAgentServeRequests">;
    const claim = await t.mutation(
      internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
      { requestId: followupRequestId, nowMs: agentAt + 31_000 },
    );
    expect(claim?.requestId).toBe(followupRequestId);
    const silentResult = await t.mutation(
      internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
      {
        requestId: followupRequestId,
        expectedAttempt: Number(claim?.attempt ?? 1),
        content: "",
        silent: true,
        nowMs: agentAt + 32_000,
      },
    );
    expect(silentResult).toMatchObject({ ok: true, silent: true, responseReplyId: null });

    const storedReq = await t.run(async (ctx) => await ctx.db.get(followupRequestId));
    expect(storedReq?.status).toBe("skipped");
    expect(storedReq?.skipReason).toBe("thread_followup_silent");

    // Founder turns off thread follow-up in Settings -> Guide.
    const ownerClient = t.withIdentity({ subject: fixture.ownerAuthSubject });
    const updatedSettings = await ownerClient.mutation(api.communityMemberCoach.setMemberCoachSettings, {
      authSubject: fixture.ownerAuthSubject,
      communityId: fixture.communityId,
      enabled: true,
      autoReasons: [],
      autoReplyEnabled: false,
      threadFollowupEnabled: false,
    });
    expect(updatedSettings.thread_followup_enabled).toBe(false);

    const replyWhileOff = await addReply(t, fixture, { seq: 4, actorType: "human", createdAt: agentAt + 40_000 });
    const ignoredOff = await t.run(async (ctx) =>
      await intakeCommunityAgentTurn({
        ctx,
        communityId: fixture.communityId,
        rootId: fixture.rootId,
        replyId: replyWhileOff,
        nowMs: agentAt + 40_000,
      }),
    );
    expect(ignoredOff.status).toBe("ignored");
  });
});
