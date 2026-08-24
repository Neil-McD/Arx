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

async function createWorkflow(
  asOwner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  communityId: any,
) {
  const first = await asOwner.mutation(
    api.communityMemberWorkflows.createBuilderWorkflowStage,
    { communityId, expectedRevision: 0, name: "New" },
  );
  const second = await asOwner.mutation(
    api.communityMemberWorkflows.createBuilderWorkflowStage,
    { communityId, expectedRevision: 1, name: "Activated" },
  );
  const updated = await asOwner.mutation(
    api.communityMemberWorkflows.updateBuilderWorkflowStage,
    {
      communityId,
      expectedRevision: 2,
      stageKey: first.stage.key,
      name: first.stage.name,
      milestone: "The member has shared a concrete implementation and its result.",
    },
  );
  return { first: updated.stage, second, revision: updated.revision };
}

async function insertRoot(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  idempotencyKey: string,
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
      idempotencyKey,
      createdAt: fixture.nowMs + offsetMs,
      updatedAt: fixture.nowMs + offsetMs,
    }),
  );
}

async function enqueueRoot(t: ReturnType<typeof convexTest>, rootId: any) {
  return await t.mutation(
    internalApi.communityMemberWorkflows
      .enqueueChannelContributionRootEvaluationInternal,
    { rootId },
  );
}

test("stage definitions are builder-owned names plus natural-language milestones", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityMemberWorkflows.createBuilderWorkflowStage, {
      communityId: fixture.communityId,
      expectedRevision: 0,
      name: "New",
    }),
  ).rejects.toThrow("community_forbidden");

  const { first, second } = await createWorkflow(asOwner, fixture.communityId);
  expect(first).toMatchObject({
    name: "New",
    milestone: "The member has shared a concrete implementation and its result.",
  });
  expect(second.stage).toMatchObject({ name: "Activated" });

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowStage, {
      communityId: fixture.communityId,
      expectedRevision: 3,
      stageKey: second.stage.key,
      name: second.stage.name,
      milestone: "This terminal milestone cannot execute.",
    }),
  ).rejects.toThrow("community_member_workflow_terminal_stage_milestone_invalid");

  const board = await asOwner.query(
    api.communityMemberWorkflows.getBuilderWorkflowBoardPage,
    { communityId: fixture.communityId, cursor: null, pageSize: 50 },
  );
  expect(board).toMatchObject({
    workflow: { revision: 3, stages: [first, second.stage] },
    page: [
      {
        membership_id: String(fixture.membershipId),
        current_stage_key: first.key,
        display_name: "Grace Member",
      },
    ],
    totalCount: 1,
  });
});

test("a canonical contribution queues evaluation but cannot directly move a member", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first } = await createWorkflow(asOwner, fixture.communityId);
  const rootId = await insertRoot(
    t,
    fixture,
    "evidence-root",
    "I shipped the implementation and measured a 12 percent improvement.",
  );

  await expect(enqueueRoot(t, rootId)).resolves.toMatchObject({ status: "queued" });
  await expect(enqueueRoot(t, rootId)).resolves.toMatchObject({ status: "already_queued" });

  const records = await t.run(async (ctx) => ({
    evaluations: await ctx.db.query("communityMemberWorkflowMilestoneEvaluations").collect(),
    states: await ctx.db.query("communityMemberWorkflowMemberStages").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
  }));
  expect(records.evaluations).toHaveLength(1);
  expect(records.evaluations[0]).toMatchObject({
    stageKey: first.key,
    status: "queued",
    wakeReceiptRef: `interaction:root:${String(rootId)}`,
  });
  expect(records.states).toHaveLength(0);
  expect(records.transitions).toHaveLength(0);
});

test("only a completed current assessment advances exactly one stage", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first, second } = await createWorkflow(asOwner, fixture.communityId);
  const rootId = await insertRoot(
    t,
    fixture,
    "complete-root",
    "I shipped the implementation and measured a 12 percent improvement.",
  );
  const queued = await enqueueRoot(t, rootId);
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

  const finalized = await t.mutation(
    internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
    {
      evaluationId,
      claimToken: claim.claim_token,
      decision: "complete",
      evaluatorKind: "model",
      evidenceRefs: [context.evidence[0].ref],
      explanation: "The supplied evidence directly establishes implementation and result.",
      missingEvidence: [],
      nowMs: fixture.nowMs + 100,
    },
  );
  expect(finalized).toMatchObject({ status: "complete", replayed: false });

  const records = await t.run(async (ctx) => ({
    evaluation: await ctx.db.get(evaluationId),
    states: await ctx.db.query("communityMemberWorkflowMemberStages").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
  }));
  expect(records.evaluation).toMatchObject({
    status: "finished",
    decision: "complete",
    evidenceRefs: [context.evidence[0].ref],
  });
  expect(records.states).toHaveLength(1);
  expect(records.states[0]).toMatchObject({
    currentStageKey: second.stage.key,
    transitionSeq: 1,
  });
  expect(records.transitions).toHaveLength(1);
  expect(records.transitions[0]).toMatchObject({
    fromStageKey: first.key,
    toStageKey: second.stage.key,
    milestoneEvaluationId: evaluationId,
    workflowRevision: 3,
  });
  await expect(enqueueRoot(t, rootId)).resolves.toMatchObject({ status: "already_queued" });
  expect(
    await t.run(async (ctx) => await ctx.db.query("communityMemberWorkflowTransitions").collect()),
  ).toHaveLength(1);
});

test("transition authority rejects evidence the evaluator was not allowed to read", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await createWorkflow(asOwner, fixture.communityId);
  const rootId = await insertRoot(t, fixture, "bounded-root", "Eligible evidence.");
  const queued = await enqueueRoot(t, rootId);
  const evaluationId = queued.evaluation_id as any;
  const claim = await t.mutation(
    internalApi.communityMemberWorkflows.claimMilestoneEvaluationInternal,
    { evaluationId },
  );

  await expect(
    t.mutation(
      internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
      {
        evaluationId,
        claimToken: claim.claim_token,
        decision: "complete",
        evaluatorKind: "model",
        evidenceRefs: ["interaction:root:invented"],
        explanation: "This citation was not supplied to the evaluator.",
        missingEvidence: [],
        nowMs: fixture.nowMs + 100,
      },
    ),
  ).rejects.toThrow("community_member_workflow_evaluation_evidence_invalid");
  expect(
    await t.run(async (ctx) =>
      await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    ),
  ).toHaveLength(0);
});

test.each(["not_complete", "uncertain"] as const)(
  "%s assessment never changes stage",
  async (decision) => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await createWorkflow(asOwner, fixture.communityId);
    const rootId = await insertRoot(t, fixture, `root-${decision}`, "I started working on it.");
    const queued = await enqueueRoot(t, rootId);
    const evaluationId = queued.evaluation_id as any;
    const claim = await t.mutation(
      internalApi.communityMemberWorkflows.claimMilestoneEvaluationInternal,
      { evaluationId },
    );
    await t.mutation(
      internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
      {
        evaluationId,
        claimToken: claim.claim_token,
        decision,
        evaluatorKind: "model",
        evidenceRefs: [`interaction:root:${String(rootId)}`],
        explanation: "The evidence does not establish the full milestone.",
        missingEvidence: ["The implementation result."],
        nowMs: fixture.nowMs + 100,
      },
    );
    const records = await t.run(async (ctx) => ({
      states: await ctx.db.query("communityMemberWorkflowMemberStages").collect(),
      transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    }));
    expect(records.states).toHaveLength(0);
    expect(records.transitions).toHaveLength(0);
  },
);

test("editing a milestone makes an in-flight assessment stale", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first } = await createWorkflow(asOwner, fixture.communityId);
  const rootId = await insertRoot(t, fixture, "stale-root", "Initial evidence.");
  const queued = await enqueueRoot(t, rootId);
  const evaluationId = queued.evaluation_id as any;
  const claim = await t.mutation(
    internalApi.communityMemberWorkflows.claimMilestoneEvaluationInternal,
    { evaluationId },
  );

  await asOwner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowStage, {
    communityId: fixture.communityId,
    expectedRevision: 3,
    stageKey: first.key,
    name: first.name,
    milestone: "A newly revised milestone.",
  });
  const result = await t.mutation(
    internalApi.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
    {
      evaluationId,
      claimToken: claim.claim_token,
      decision: "complete",
      evaluatorKind: "model",
      evidenceRefs: [`interaction:root:${String(rootId)}`],
      explanation: "Old definition result.",
      missingEvidence: [],
      nowMs: fixture.nowMs + 100,
    },
  );
  expect(result).toEqual({ status: "stale", transition_id: null });
  expect(
    await t.run(async (ctx) => await ctx.db.query("communityMemberWorkflowTransitions").collect()),
  ).toHaveLength(0);
});
