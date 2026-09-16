/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  COMMUNITY_AGENT_SERVE_LEASE_MS,
  COMMUNITY_AGENT_SERVE_MAX_ATTEMPTS,
  COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS,
  COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS,
} from "../shared/communityAgentServeContract";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";

const modules = import.meta.glob([
  "./communityAgentServeWorker.ts",
  "./communityAgentChannelAccess.ts",
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

async function createServeFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  return await t.run(async (ctx) => {
    const nowMs = 1_000;
    const userId = await ctx.db.insert("users", {
      authSubject: `serve-${suffix}`,
      displayName: `Serve ${suffix}`,
      handle: `serve-${suffix}`,
      normalizedHandle: `serve-${suffix}`,
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
      slug: `serve-${suffix}`,
      name: `Serve ${suffix}`,
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
      contentSummary: `@Serve ${suffix} help me`,
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `serve-root-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityInteractionContentBlocks", {
      communityId,
      rootId,
      blockOrder: 0,
      blockType: "markdown_text",
      text: `@Serve ${suffix} help me`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const mentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId,
      channelId,
      rootId,
      mentionKind: "community_agent",
      mentionedAgentKey: "community_agent",
      notifyState: "sent",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { channelId, communityId, mentionId, rootId, userId };
  });
}

async function insertServeRequest(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createServeFixture>>,
  overrides: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) => await ctx.db.insert("communityAgentServeRequests", {
    communityId: fixture.communityId,
    agentKey: "community_agent",
    sourceMentionId: fixture.mentionId,
    sourceRootId: fixture.rootId,
    requesterUserId: fixture.userId,
    sponsorUserId: fixture.userId,
    status: "queued",
    intakeReason: "accepted",
    sourceVisibilityScope: "community",
    responseVisibilityScope: "community",
    createdAt: 2_000,
    updatedAt: 2_000,
    ...overrides,
  } as any));
}

test("serve-request schema accepts every canonical funding rejection", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "funding-codes");
  const reasons = [
    "founder_subscription_inactive",
    "founder_subscription_ambiguous",
    "founder_subscription_owner_mismatch",
  ] as const;

  await t.run(async (ctx) => {
    for (const [index, intakeReason] of reasons.entries()) {
      const mentionId = await ctx.db.insert("communityInteractionMentions", {
        communityId: fixture.communityId,
        channelId: fixture.channelId,
        rootId: fixture.rootId,
        mentionKind: "community_agent",
        mentionedAgentKey: "community_agent",
        notifyState: "suppressed",
        createdAt: 3_000 + index,
        updatedAt: 3_000 + index,
      });
      await ctx.db.insert("communityAgentServeRequests", {
        communityId: fixture.communityId,
        agentKey: "community_agent",
        sourceMentionId: mentionId,
        sourceRootId: fixture.rootId,
        requesterUserId: fixture.userId,
        sponsorUserId: fixture.userId,
        status: "skipped",
        intakeReason,
        skipReason: intakeReason,
        createdAt: 3_000 + index,
        updatedAt: 3_000 + index,
      });
    }
    await expect(ctx.db.query("communityAgentServeRequests").collect()).resolves.toHaveLength(3);
  });
});

test("serve recovery begins only after the original Convex action cannot still complete", () => {
  expect(COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS).toBe(30 * 60 * 1000);
  expect(COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS).toBeGreaterThan(0);
  expect(COMMUNITY_AGENT_SERVE_LEASE_MS).toBe(
    COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS + COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS,
  );
  expect(COMMUNITY_AGENT_SERVE_LEASE_MS).toBeGreaterThan(
    COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS,
  );
});

test("claims use explicit leases and stale attempts cannot fail a newer attempt", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "attempt-fence");
  const requestId = await insertServeRequest(t, fixture);

  const first = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  );
  expect(first).toMatchObject({
    requestId,
    attempt: 1,
    leaseExpiresAt: 10_000 + COMMUNITY_AGENT_SERVE_LEASE_MS,
  });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_001 },
  )).resolves.toMatchObject({ requestId: null });

  const second = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: first.leaseExpiresAt },
  );
  expect(second).toMatchObject({ requestId, attempt: 2 });

  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.failCommunityAgentServeRequestInternal,
    {
      requestId,
      expectedAttempt: 1,
      errorCode: "stale_worker",
      errorMessage: "Old attempt must not own the request.",
      nowMs: first.leaseExpiresAt + 1,
    },
  )).resolves.toMatchObject({ ok: false, skipped: true });
  await expect(t.run((ctx) => ctx.db.get(requestId))).resolves.toMatchObject({
    status: "running",
    attempt: 2,
  });

  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.failCommunityAgentServeRequestInternal,
    {
      requestId,
      expectedAttempt: 2,
      errorCode: "current_worker_failed",
      errorMessage: "Current attempt owns the transition.",
      nowMs: first.leaseExpiresAt + 2,
    },
  )).resolves.toMatchObject({ ok: true });
  const failedRequest = await t.run((ctx) => ctx.db.get(requestId));
  expect(failedRequest).toMatchObject({
    status: "error",
    errorCode: "current_worker_failed",
  });
  expect(failedRequest).not.toHaveProperty("leaseExpiresAt");
});

test("global recovery uses the lease index and treats legacy running rows without leases as expired", async () => {
  const t = convexTest(schema, modules);
  const activeFixture = await createServeFixture(t, "active-lease");
  const expiredFixture = await createServeFixture(t, "expired-lease");
  const activeRequestId = await insertServeRequest(t, activeFixture, {
    status: "running",
    attempt: 1,
    leaseExpiresAt: 50_000,
    createdAt: 1,
    updatedAt: 1,
  });
  const expiredRequestId = await insertServeRequest(t, expiredFixture, {
    status: "running",
    attempt: 1,
    createdAt: 2,
    updatedAt: 2,
  });

  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { nowMs: 10_000 },
  )).resolves.toMatchObject({ requestId: expiredRequestId, attempt: 2 });
  await expect(t.run((ctx) => ctx.db.get(activeRequestId))).resolves.toMatchObject({
    status: "running",
    attempt: 1,
    leaseExpiresAt: 50_000,
  });
});

test("bounded recovery exhausts poison requests instead of cycling forever", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "exhausted");
  const requestId = await insertServeRequest(t, fixture, {
    status: "running",
    attempt: COMMUNITY_AGENT_SERVE_MAX_ATTEMPTS,
    leaseExpiresAt: 9_999,
  });

  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  )).resolves.toMatchObject({ requestId: null });
  const exhaustedRequest = await t.run((ctx) => ctx.db.get(requestId));
  expect(exhaustedRequest).toMatchObject({
    status: "error",
    errorCode: "community_agent_serve_attempts_exhausted",
  });
  expect(exhaustedRequest).not.toHaveProperty("leaseExpiresAt");
});

test("only the current attempt can materialize the one canonical reply", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "finalize-fence");
  const requestId = await insertServeRequest(t, fixture);
  const first = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  );
  const second = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: first.leaseExpiresAt },
  );

  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    {
      requestId,
      expectedAttempt: 1,
      content: "Stale answer",
      nowMs: first.leaseExpiresAt + 1,
    },
  )).resolves.toMatchObject({ ok: false, errorCode: "serve_request_attempt_stale" });
  await expect(t.run((ctx) => ctx.db.query("communityInteractionReplies").collect())).resolves.toHaveLength(0);

  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    {
      requestId,
      expectedAttempt: second.attempt,
      content: "Current answer",
      nowMs: first.leaseExpiresAt + 2,
    },
  )).resolves.toMatchObject({ ok: true, duplicate: false });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    {
      requestId,
      expectedAttempt: second.attempt,
      content: "Duplicate answer",
      nowMs: first.leaseExpiresAt + 3,
    },
  )).resolves.toMatchObject({ ok: false, errorCode: "serve_request_attempt_stale" });

  const rows = await t.run((ctx) => ctx.db.query("communityInteractionReplies").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    rootId: fixture.rootId,
    actorType: "community_agent",
    actorAgentKey: "community_agent",
    contentSummary: "Current answer",
  });
  const respondedRequest = await t.run((ctx) => ctx.db.get(requestId));
  expect(respondedRequest).toMatchObject({
    status: "responded",
    attempt: 2,
    responseReplyId: rows[0]._id,
  });
  expect(respondedRequest).not.toHaveProperty("leaseExpiresAt");
});

test.each(["archived", "restricted", "replies_disabled"])("final posting rechecks channel authority after claim: %s", async (change) => {
  const t = convexTest(schema, modules);
  const f = await createServeFixture(t, `channel-recheck-${change}`);
  const requestId = await insertServeRequest(t, f);
  const claimed = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(f.channelId, change === "archived" ? { status: "archived" }
      : change === "restricted" ? { accessMode: "restricted" } : { replyPolicy: "disabled" });
  });
  await expect(t.mutation(internalRefs.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, {
    requestId, expectedAttempt: claimed.attempt, content: "Must not post", nowMs: 10_001,
  })).resolves.toMatchObject({ ok: false, errorCode: "channel_access_missing" });
  expect(await t.run(ctx => ctx.db.query("communityInteractionReplies").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ status: "error", errorCode: "channel_access_missing" });
});

test.each([false, true])("private-room agent execution is scoped and revocation blocks final output: revoked=%s", async (revoked) => {
  const t = convexTest(schema, modules);
  const f = await createServeFixture(t, `private-agent-${revoked}`);
  const grantId = await t.run(async ctx => {
    await ctx.db.patch(f.channelId, { systemRole: undefined, slug: "private-client", name: "Private client", position: 1, accessMode: "restricted" });
    return ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId,
      principalKey: "community_agent", status: "active", createdByUserId: f.userId, createdAt: 1, updatedAt: 1 });
  });
  const requestId = await insertServeRequest(t, f);
  const claim = await t.mutation(internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 });
  const args = { requestId, expectedAttempt: claim.attempt };
  expect(await t.query(internalRefs.communityAgentChannelAccess.authorizeServeToolsInternal, args)).toEqual({ restricted: true });
  expect(await t.query(internalRefs.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args)).toMatchObject({ ok: true });
  if (revoked) {
    await t.run(ctx => ctx.db.patch(grantId, { status: "revoked" }));
    await expect(t.query(internalRefs.communityAgentChannelAccess.authorizeServeToolsInternal, args)).rejects.toThrow();
  }
  expect(await t.mutation(internalRefs.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    { ...args, content: "Private room answer", nowMs: 10_001 })).toMatchObject({ ok: !revoked });
  const replies = await t.run(ctx => ctx.db.query("communityInteractionReplies").collect());
  expect(replies).toHaveLength(revoked ? 0 : 1);
  if (!revoked) expect(replies[0]).toMatchObject({ rootId: f.rootId, channelId: f.channelId });
});

test("ordinary owner mentions need no membership row or workflow", async () => {
  const t = convexTest(schema, modules);
  const f = await createServeFixture(t, "owner-no-membership");
  await t.run(async (ctx) => {
    const membership = (await ctx.db.query("communityMemberships").first())!;
    await ctx.db.delete(membership._id);
  });
  const requestId = await insertServeRequest(t, f);
  const claim = await t.mutation(internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, {
    requestId, nowMs: 10_000,
  });
  const context = await t.query(internalRefs.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, {
    requestId, expectedAttempt: claim.attempt,
  });
  expect(context).toMatchObject({ ok: true, workflowPrompt: null });
  expect(context.threadContext.rendered).toContain("role=owner");
  expect(context.threadContext.rendered).not.toContain("Workflow orientation");
});

test("thread context is chronological, cutoff-bound, and scoped through member orientation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "thread-context");
  const prepared = await t.run(async (ctx) => {
    const memberId = await ctx.db.insert("users", {
      authSubject: "serve-thread-context-member",
      displayName: "Blair",
      handle: "blair",
      normalizedHandle: "blair",
      createdAt: 1_100,
      updatedAt: 1_100,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: memberId,
      displayName: "Blair Member",
      timezone: "America/New_York",
      createdAt: 1_100,
      updatedAt: 1_100,
    });
    await ctx.db.insert("communityMemberships", {
      communityId: fixture.communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      createdAt: 1_100,
      updatedAt: 1_100,
    });
    await ctx.db.insert("memberProfileSpines", {
      userId: memberId,
      situation: "Helping launch the first cohort",
      goals: ["Welcome the first members"],
      interests: ["Community design"],
      links: [],
      factCount: 3,
      updatedAt: 1_100,
    });
    await ctx.db.insert("memberFacts", {
      userId: memberId,
      communityId: fixture.communityId,
      kind: "preference",
      body: "Prefers concise launch plans",
      provenance: "form_answer",
      confidence: 1,
      evidenceRefs: [],
      stalenessScore: 0,
      consentState: "approved",
      createdByActorType: "member",
      createdByUserId: memberId,
      version: 1,
      createdAt: 1_100,
      updatedAt: 1_100,
    });
    await ctx.db.insert("memberFacts", {
      userId: memberId,
      communityId: fixture.communityId,
      kind: "goal",
      body: "PRIVATE PENDING FACT",
      provenance: "inferred_agent",
      confidence: 0.5,
      evidenceRefs: [],
      stalenessScore: 0,
      consentState: "pending",
      createdByActorType: "agent",
      version: 1,
      createdAt: 1_101,
      updatedAt: 1_101,
    });

    const insertReply = async (seq: number, actorUserId: any, text: string, targetReplyId?: any) => {
      const replyId = await ctx.db.insert("communityInteractionReplies", {
        communityId: fixture.communityId,
        channelId: fixture.channelId,
        rootId: fixture.rootId,
        seq,
        actorType: "human",
        actorUserId,
        ...(targetReplyId ? { targetReplyId } : {}),
        status: "live",
        visibilityScope: "community",
        contentSummary: text,
        reactionSummary: [],
        idempotencyKey: `thread-context-reply-${seq}`,
        createdAt: 1_200 + seq,
        updatedAt: 1_200 + seq,
      });
      await ctx.db.insert("communityInteractionContentBlocks", {
        communityId: fixture.communityId,
        replyId,
        blockOrder: 0,
        blockType: "markdown_text",
        text,
        createdAt: 1_200 + seq,
        updatedAt: 1_200 + seq,
      });
      return replyId;
    };
    const reply1 = await insertReply(1, memberId, "We should begin with existing members.");
    const reply2 = await insertReply(2, fixture.userId, "What should the welcome say?", reply1);
    const sourceReplyId = await insertReply(3, memberId, "@Agent help answer that.", reply2);
    await insertReply(4, fixture.userId, "FUTURE REPLY MUST NOT APPEAR", sourceReplyId);
    await ctx.db.patch(fixture.rootId, { replyCount: 4, lastReplyAt: 1_204, updatedAt: 1_204 });
    return { memberId, sourceReplyId };
  });
  const requestId = await insertServeRequest(t, fixture, {
    sourceReplyId: prepared.sourceReplyId,
    requesterUserId: prepared.memberId,
    sponsorUserId: prepared.memberId,
  });
  const claim = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  );
  const context = await t.query(
    internalRefs.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
    { requestId, expectedAttempt: claim.attempt },
  );
  expect(context).toMatchObject({ ok: true });
  expect(context.agent.displayName).toBe("Serve thread-context");
  expect(context.threadContext.version).toBe(2);
  expect(context.threadContext.rendered).toContain(
    "self_agent=Serve thread-context [agent:community_agent]",
  );
  expect(context.threadContext.rendered).toContain("position=\"reply:1\"");
  expect(context.threadContext.rendered).toContain("position=\"reply:3\"");
  expect(context.threadContext.rendered).toContain("requester=Blair Member (@blair)");
  expect(context.threadContext.rendered).toContain('speaker_role="requester"');
  expect(context.threadContext.rendered).toContain('speaker_role="participant"');
  expect(context.threadContext.rendered).toContain("situation=Helping launch the first cohort");
  expect(context.threadContext.rendered).toContain("preference=Prefers concise launch plans");
  expect(context.threadContext.rendered).not.toContain("PRIVATE PENDING FACT");
  expect(context.threadContext.rendered).not.toContain("FUTURE REPLY MUST NOT APPEAR");
});

test("context snapshots are mandatory, exact, idempotent, and attempt-fenced", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "context-snapshot");
  const requestId = await insertServeRequest(t, fixture);
  const first = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  );
  const promptBundle = buildCommunityAgentServePromptBundle({
    community: { name: "Snapshot", slug: "snapshot" },
    agent: { displayName: "Snapshot agent" },
    threadContext: { rendered: "thread" },
  });
  const messages = promptBundle.messages;
  const promptSections = promptBundle.systemPromptBundle.sections;
  const snapshotJson = JSON.stringify({
    version: 1,
    sha256: "a".repeat(64),
    messages,
  });
  const snapshotV2Json = JSON.stringify({
    version: 2,
    sha256: "a".repeat(64),
    messages,
    prompt_sections: promptSections,
  });
  const invalidSnapshotV2Json = JSON.stringify({
    version: 2,
    sha256: "a".repeat(64),
    messages,
    prompt_sections: promptSections.map((section, index) =>
      index === 0 ? { ...section, chars: section.chars + 1 } : section
    ),
  });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    {
      requestId,
      expectedAttempt: first.attempt,
      snapshotJson: invalidSnapshotV2Json,
      nowMs: 10_001,
    },
  )).resolves.toMatchObject({ ok: false, errorCode: "serve_context_snapshot_invalid" });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    { requestId, expectedAttempt: first.attempt, snapshotJson, nowMs: 10_002 },
  )).resolves.toMatchObject({ ok: true, duplicate: false });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    { requestId, expectedAttempt: first.attempt, snapshotJson: snapshotV2Json, nowMs: 10_003 },
  )).resolves.toMatchObject({ ok: true, duplicate: true });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    {
      requestId,
      expectedAttempt: first.attempt,
      snapshotJson: snapshotV2Json.replace("thread", "change"),
      nowMs: 10_004,
    },
  )).resolves.toMatchObject({ ok: false, errorCode: "serve_context_snapshot_conflict" });

  const second = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: first.leaseExpiresAt },
  );
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    { requestId, expectedAttempt: first.attempt, snapshotJson, nowMs: first.leaseExpiresAt + 1 },
  )).resolves.toMatchObject({ ok: false, errorCode: "serve_request_attempt_stale" });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    { requestId, expectedAttempt: second.attempt, snapshotJson: snapshotV2Json, nowMs: first.leaseExpiresAt + 2 },
  )).resolves.toMatchObject({ ok: true, duplicate: false });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    { requestId, expectedAttempt: second.attempt, snapshotJson, nowMs: first.leaseExpiresAt + 3 },
  )).resolves.toMatchObject({ ok: true, duplicate: true });

  const events = await t.run((ctx) => ctx.db.query("communityAgentRunEvents").collect());
  expect(events).toHaveLength(2);
  expect(events.map((event) => event.seq)).toEqual([0, 0]);
  expect(events.every((event) => event.kind === "context_snapshot")).toBe(true);
  expect(events.map((event) => event.content)).toEqual([snapshotJson, snapshotV2Json]);
});

test("workflow prompts are accepted only as an explicit fourth policy section", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createServeFixture(t, "workflow-prompt-snapshot");
  const requestId = await insertServeRequest(t, fixture);
  const claim = await t.mutation(
    internalRefs.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal,
    { requestId, nowMs: 10_000 },
  );
  const promptBundle = buildCommunityAgentServePromptBundle({
    community: { name: "Workflow", slug: "workflow" },
    agent: { displayName: "Workflow agent" },
    threadContext: { rendered: "thread" },
    workflowPrompt: "Help the member choose one concrete next step.",
  });
  expect(promptBundle.systemPromptBundle.sections.map((section) => section.id)).toEqual([
    "community_agent_identity",
    "concierge_operating_policy",
    "community_system_prompt",
    "community_workflow_action",
  ]);
  const snapshotJson = JSON.stringify({
    version: 2,
    sha256: "b".repeat(64),
    messages: promptBundle.messages,
    prompt_sections: promptBundle.systemPromptBundle.sections,
  });
  await expect(t.mutation(
    internalRefs.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
    { requestId, expectedAttempt: claim.attempt, snapshotJson, nowMs: 10_001 },
  )).resolves.toMatchObject({ ok: true, duplicate: false });
});
