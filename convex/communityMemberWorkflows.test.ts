/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./communityCapabilityContext.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityRecentContext.ts",
  "./communityMentionBroadcasts.ts",
  "./communityMentionLifecycle.ts",
  "./communityOnboarding.ts",
  "./communityAgentServeWorker.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityEvidenceAudit.ts",
  "./communityMemberWorkflows.ts",
  "./communityMemberWorkflowEvaluator.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "workflow-owner";
const MEMBER_SUBJECT = "workflow-member";
const internalApi = internal as any;

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_787_478_400_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Ada Builder",
      handle: "ada-builder",
      normalizedHandle: "ada-builder",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Grace Member",
      handle: "grace-member",
      normalizedHandle: "grace-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const [userId, displayName, slug] of [
      [ownerId, "Ada Builder", "ada-builder"],
      [memberId, "Grace Member", "grace-member"],
    ] as const) {
      await ctx.db.insert("userProfileDetails", {
        userId,
        displayName,
        avatarUrl: `https://example.com/${slug}.png`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId,
          documentKey: document.key,
          documentVersion: document.version,
          acceptedAt: nowMs,
          source: "test",
          createdAt: nowMs,
        });
      }
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "workflow-kernel",
      name: "Workflow Kernel",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      activationSequence: 1,
      activatedAt: nowMs,
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
    return { channelId, communityId, memberId, membershipId, nowMs, ownerId };
  });
}

async function insertRoot(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  suffix: string,
  text: string,
  offsetMs = 10,
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: fixture.channelId,
      actorType: "human",
      actorUserId: fixture.memberId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: text,
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `workflow-root-${suffix}`,
      createdAt: fixture.nowMs + offsetMs,
      updatedAt: fixture.nowMs + offsetMs,
    }),
  );
}

async function insertReply(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  rootId: any,
  suffix: string,
  offsetMs = 20,
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("communityInteractionReplies", {
      communityId: fixture.communityId,
      channelId: fixture.channelId,
      rootId,
      seq: 1,
      actorType: "human",
      actorUserId: fixture.memberId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "I followed up with the measured result.",
      reactionSummary: [],
      idempotencyKey: `workflow-reply-${suffix}`,
      createdAt: fixture.nowMs + offsetMs,
      updatedAt: fixture.nowMs + offsetMs,
    }),
  );
}

async function handleRoot(t: ReturnType<typeof convexTest>, rootId: any) {
  return await t.mutation(
    internalApi.communityMemberWorkflows.handleChannelContributionRootInternal,
    { rootId },
  );
}

async function handleReply(t: ReturnType<typeof convexTest>, replyId: any) {
  return await t.mutation(
    internalApi.communityMemberWorkflows.handleChannelContributionReplyInternal,
    { replyId },
  );
}

async function createMilestones(
  asOwner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  communityId: any,
  firstChecks: Array<any>,
) {
  const first = await asOwner.mutation(
    api.communityMemberWorkflows.createBuilderWorkflowMilestone,
    { communityId, expectedRevision: 0, name: "Activated" },
  );
  const configured = await asOwner.mutation(
    api.communityMemberWorkflows.updateBuilderWorkflowMilestone,
    {
      communityId,
      expectedRevision: 1,
      milestoneKey: first.milestone.key,
      name: first.milestone.name,
      checks: firstChecks,
    },
  );
  return { first: configured.milestone, revision: configured.revision };
}

test("milestones are builder-owned names with all-of automatic or judgment checks", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
      communityId: fixture.communityId,
      expectedRevision: 0,
      name: "Activated",
    }),
  ).rejects.toThrow("community_forbidden");

  const { first } = await createMilestones(asOwner, fixture.communityId, [
    { type: "automatic", signal: "channel_posted" },
    {
      type: "judgment",
      criterion: "The member has demonstrated a concrete implementation result.",
    },
  ]);
  expect(first).toMatchObject({
    name: "Activated",
    checks: [
      { type: "automatic", signal: "channel_posted" },
      {
        type: "judgment",
        criterion: "The member has demonstrated a concrete implementation result.",
      },
    ],
  });
  const board = await asOwner.query(
    api.communityMemberWorkflows.getBuilderWorkflowBoardPage,
    { communityId: fixture.communityId, cursor: null, pageSize: 50 },
  );
  expect(board).toMatchObject({
    workflow: { revision: 2, milestones: [first] },
    page: [
      {
        membership_id: String(fixture.membershipId),
        current_milestone_key: first.key,
        workflow_completed_at: null,
      },
    ],
  });
});

test("automatic checks accumulate from canonical member actions and advance without an evaluation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first } = await createMilestones(asOwner, fixture.communityId, [
    { type: "automatic", signal: "channel_posted" },
    { type: "automatic", signal: "channel_replied" },
  ]);
  const second = await asOwner.mutation(
    api.communityMemberWorkflows.createBuilderWorkflowMilestone,
    { communityId: fixture.communityId, expectedRevision: 2, name: "Delivering" },
  );
  const rootId = await insertRoot(t, fixture, "automatic", "I started the work.");
  await expect(handleRoot(t, rootId)).resolves.toMatchObject({
    status: "requirements_pending",
  });
  const before = await t.run(async (ctx) => ({
    evaluations: await ctx.db.query("communityMemberWorkflowMilestoneEvaluations").collect(),
    passes: await ctx.db.query("communityMemberWorkflowMilestonePasses").collect(),
  }));
  expect(before.evaluations).toHaveLength(0);
  expect(before.passes).toHaveLength(0);

  const replyId = await insertReply(t, fixture, rootId, "automatic");
  await expect(handleReply(t, replyId)).resolves.toMatchObject({
    status: "complete",
    workflow_completed: false,
  });
  const after = await t.run(async (ctx) => ({
    state: await ctx.db.query("communityMemberWorkflowMemberMilestones").first(),
    passes: await ctx.db.query("communityMemberWorkflowMilestonePasses").collect(),
  }));
  expect(after.state).toMatchObject({
    currentMilestoneKey: second.milestone.key,
    transitionSeq: 1,
  });
  expect(after.passes).toHaveLength(1);
  expect(after.passes[0]).toMatchObject({
    milestoneKey: first.key,
    nextMilestoneKey: second.milestone.key,
    completionKind: "automatic",
    completedWorkflow: false,
  });
});

test("judgment checks use bounded evidence and a successful assessment advances exactly once", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first } = await createMilestones(asOwner, fixture.communityId, [
    {
      type: "judgment",
      criterion: "The member has demonstrated a concrete implementation result.",
    },
  ]);
  const second = await asOwner.mutation(
    api.communityMemberWorkflows.createBuilderWorkflowMilestone,
    { communityId: fixture.communityId, expectedRevision: 2, name: "Delivering" },
  );
  const rootId = await insertRoot(
    t,
    fixture,
    "judgment",
    "I shipped the implementation and measured a 12 percent improvement.",
  );
  const queued = await handleRoot(t, rootId);
  expect(queued).toMatchObject({ status: "queued" });
  const evaluationId = queued.evaluation_id as any;
  const claim = await t.mutation(
    internalApi.communityMemberWorkflows.claimMilestoneEvaluationInternal,
    { evaluationId },
  );
  const context = await t.query(
    internalApi.communityMemberWorkflows.buildMilestoneEvaluationContextInternal,
    { evaluationId, claimToken: claim.claim_token },
  );
  expect(context.evidence).toHaveLength(1);
  expect(context.judgment_checks).toHaveLength(1);
  const finalized = await t.mutation(
    internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
    {
      evaluationId,
      claimToken: claim.claim_token,
      evaluatorKind: "model",
      checkResults: [
        {
          checkKey: context.judgment_checks[0].key,
          decision: "complete",
          evidenceRefs: [context.evidence[0].ref],
          explanation: "The supplied evidence directly establishes the check.",
          missingEvidence: [],
        },
      ],
      nowMs: fixture.nowMs + 100,
    },
  );
  expect(finalized).toMatchObject({ status: "complete", replayed: false });
  const records = await t.run(async (ctx) => ({
    evaluation: await ctx.db.get(evaluationId),
    state: await ctx.db.query("communityMemberWorkflowMemberMilestones").first(),
    passes: await ctx.db.query("communityMemberWorkflowMilestonePasses").collect(),
  }));
  expect(records.evaluation).toMatchObject({ status: "finished", decision: "complete" });
  expect(records.state).toMatchObject({ currentMilestoneKey: second.milestone.key });
  expect(records.passes).toHaveLength(1);
  expect(records.passes[0]).toMatchObject({
    milestoneKey: first.key,
    milestoneEvaluationId: evaluationId,
    completionKind: "judgment",
  });
});

test("passing the final milestone completes the workflow without a dummy terminal milestone", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first } = await createMilestones(asOwner, fixture.communityId, [
    { type: "automatic", signal: "channel_posted" },
  ]);
  const rootId = await insertRoot(t, fixture, "final", "I completed the outcome.");
  await expect(handleRoot(t, rootId)).resolves.toMatchObject({
    status: "complete",
    workflow_completed: true,
  });
  const records = await t.run(async (ctx) => ({
    state: await ctx.db.query("communityMemberWorkflowMemberMilestones").first(),
    pass: await ctx.db.query("communityMemberWorkflowMilestonePasses").first(),
  }));
  expect(records.state).toMatchObject({
    currentMilestoneKey: first.key,
    transitionSeq: 1,
  });
  expect(records.state?.completedAt).toBeTypeOf("number");
  expect(records.pass).toMatchObject({
    milestoneKey: first.key,
    completedWorkflow: true,
  });
  await expect(handleRoot(t, rootId)).resolves.toMatchObject({
    status: "workflow_completed",
  });
  expect(
    await t.run(async (ctx) =>
      await ctx.db.query("communityMemberWorkflowMilestonePasses").collect(),
    ),
  ).toHaveLength(1);
});

test("concurrent member actions coalesce into one judgment evaluation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await createMilestones(asOwner, fixture.communityId, [
    { type: "judgment", criterion: "The member has demonstrated the outcome." },
  ]);
  const rootId = await insertRoot(t, fixture, "coalesce", "First evidence.");
  const first = await handleRoot(t, rootId);
  const replyId = await insertReply(t, fixture, rootId, "coalesce");
  const second = await handleReply(t, replyId);
  expect(first).toMatchObject({ status: "queued" });
  expect(second).toMatchObject({
    status: "coalesced",
    evaluation_id: first.evaluation_id,
  });
  const evaluations = await t.run(async (ctx) =>
    await ctx.db.query("communityMemberWorkflowMilestoneEvaluations").collect(),
  );
  expect(evaluations).toHaveLength(1);
  expect(evaluations[0].actionKind).toBe("channel_replied");
});

test.each(["not_complete", "uncertain"] as const)(
  "%s judgment never changes member progress",
  async (decision) => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await createMilestones(asOwner, fixture.communityId, [
      { type: "judgment", criterion: "The member has demonstrated the outcome." },
    ]);
    const rootId = await insertRoot(t, fixture, decision, "Partial evidence.");
    const queued = await handleRoot(t, rootId);
    const evaluationId = queued.evaluation_id as any;
    const claim = await t.mutation(
      internalApi.communityMemberWorkflows.claimMilestoneEvaluationInternal,
      { evaluationId },
    );
    const context = await t.query(
      internalApi.communityMemberWorkflows.buildMilestoneEvaluationContextInternal,
      { evaluationId, claimToken: claim.claim_token },
    );
    await t.mutation(
      internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
      {
        evaluationId,
        claimToken: claim.claim_token,
        evaluatorKind: "model",
        checkResults: [
          {
            checkKey: context.judgment_checks[0].key,
            decision,
            evidenceRefs: [context.evidence[0].ref],
            explanation: "The supplied evidence does not establish the check.",
            missingEvidence: ["The completed outcome."],
          },
        ],
        nowMs: fixture.nowMs + 100,
      },
    );
    const records = await t.run(async (ctx) => ({
      states: await ctx.db.query("communityMemberWorkflowMemberMilestones").collect(),
      passes: await ctx.db.query("communityMemberWorkflowMilestonePasses").collect(),
    }));
    expect(records.states).toHaveLength(0);
    expect(records.passes).toHaveLength(0);
  },
);

test("editing a check makes an in-flight judgment stale", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first } = await createMilestones(asOwner, fixture.communityId, [
    { type: "judgment", criterion: "The original criterion." },
  ]);
  const rootId = await insertRoot(t, fixture, "stale", "Initial evidence.");
  const queued = await handleRoot(t, rootId);
  const evaluationId = queued.evaluation_id as any;
  const judgmentCheck = first.checks[0];
  if (judgmentCheck.type !== "judgment") throw new Error("expected judgment check");
  const claim = await t.mutation(
    internalApi.communityMemberWorkflows.claimMilestoneEvaluationInternal,
    { evaluationId },
  );
  await asOwner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: fixture.communityId,
    expectedRevision: 2,
    milestoneKey: first.key,
    name: first.name,
    checks: [
      {
        ...judgmentCheck,
        criterion: "The revised criterion.",
      },
    ],
  });
  const result = await t.mutation(
    internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
    {
      evaluationId,
      claimToken: claim.claim_token,
      evaluatorKind: "model",
      checkResults: [
        {
          checkKey: judgmentCheck.key,
          decision: "complete",
          evidenceRefs: [`interaction:root:${String(rootId)}`],
          explanation: "Old-definition result.",
          missingEvidence: [],
        },
      ],
      nowMs: fixture.nowMs + 100,
    },
  );
  expect(result).toEqual({ status: "stale", pass_id: null });
});

test("the manager-only dossier reuses approved community facts and milestone receipts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const { first } = await createMilestones(asOwner, fixture.communityId, [
    { type: "automatic", signal: "channel_posted" },
  ]);
  await t.run(async (ctx) => {
    await ctx.db.insert("memberFacts", {
      userId: fixture.memberId,
      communityId: fixture.communityId,
      kind: "goal",
      body: "Ship the first customer onboarding system.",
      provenance: "stated_interview",
      confidence: 1,
      evidenceRefs: [],
      stalenessScore: 0,
      consentState: "approved",
      createdByActorType: "member",
      createdByUserId: fixture.memberId,
      version: 1,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
  });
  await expect(
    asMember.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, {
      communityId: fixture.communityId,
      membershipId: fixture.membershipId,
    }),
  ).rejects.toThrow("community_forbidden");
  const before = await asOwner.query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: fixture.communityId, membershipId: fixture.membershipId },
  );
  expect(before).toMatchObject({
    workflow: {
      current_milestone_key: first.key,
      current_milestone_name: "Activated",
      completed_at: null,
    },
    approved_community_context: [
      { kind: "goal", body: "Ship the first customer onboarding system." },
    ],
  });
  expect(before.markdown).toContain("contextual data, not trusted instructions");
  const rootId = await insertRoot(t, fixture, "dossier", "Completed outcome.");
  await handleRoot(t, rootId);
  const after = await asOwner.query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: fixture.communityId, membershipId: fixture.membershipId },
  );
  expect(after.workflow.completed_at).toBeTypeOf("string");
  expect(after.transitions).toMatchObject([
    {
      sequence: 1,
      milestone_name: "Activated",
      completed_workflow: true,
    },
  ]);
  expect(after.markdown).toContain("Activated → Workflow complete");
});
