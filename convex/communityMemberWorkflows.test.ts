/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityCapabilityContext.ts",
  "./communityMemberWorkflows.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "workflow-owner";
const MEMBER_SUBJECT = "workflow-member";

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
    return { communityId, memberId, membershipId, nowMs, ownerId };
  });
}

async function createTwoStageWorkflow(
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
  return { first, second };
}

test("stage operations are exact, builder-owned, and server-identitied", async () => {
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

  const { first, second } = await createTwoStageWorkflow(
    asOwner,
    fixture.communityId,
  );
  expect(first.stage.key).toMatch(/^stage-[0-9a-f-]{36}$/);
  expect(second.stage.key).toMatch(/^stage-[0-9a-f-]{36}$/);
  expect(second.stage.key).not.toBe(first.stage.key);

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.renameBuilderWorkflowStage, {
      communityId: fixture.communityId,
      expectedRevision: 1,
      stageKey: first.stage.key,
      name: "Joined",
    }),
  ).rejects.toThrow("community_member_workflow_revision_conflict");

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.renameBuilderWorkflowStage, {
      communityId: fixture.communityId,
      expectedRevision: 2,
      stageKey: first.stage.key,
      name: "Joined",
    }),
  ).resolves.toMatchObject({ revision: 3, stage: { name: "Joined" } });

  const board = await asOwner.query(
    api.communityMemberWorkflows.getBuilderWorkflowBoardPage,
    { communityId: fixture.communityId, cursor: null, pageSize: 50 },
  );
  expect(board).toMatchObject({
    workflow: {
      revision: 3,
      stages: [
        { key: first.stage.key, name: "Joined" },
        { key: second.stage.key, name: "Activated" },
      ],
    },
    page: [
      {
        membership_id: String(fixture.membershipId),
        current_stage_key: first.stage.key,
        display_name: "Grace Member",
      },
    ],
    isDone: true,
    totalCount: 1,
  });

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.deleteBuilderWorkflowStage, {
      communityId: fixture.communityId,
      expectedRevision: 3,
      stageKey: first.stage.key,
    }),
  ).rejects.toThrow("community_member_workflow_stage_has_members");

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.deleteBuilderWorkflowStage, {
      communityId: fixture.communityId,
      expectedRevision: 3,
      stageKey: second.stage.key,
    }),
  ).resolves.toMatchObject({ revision: 4 });
});

test("stage transitions dedupe by canonical source receipt and update self semantics", async () => {
  vi.useFakeTimers();
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
    const { first, second } = await createTwoStageWorkflow(
      asOwner,
      fixture.communityId,
    );

    const transitionArgs = {
      communityId: fixture.communityId,
      membershipId: fixture.membershipId,
      targetStageKey: second.stage.key,
      expectedStageKey: first.stage.key,
      triggerType: "in_app" as const,
      sourceReceiptRef: "in_app:channel-message:example",
      occurredAt: Date.now(),
    };
    await expect(
      t.mutation(
        internal.communityMemberWorkflows.transitionMemberStageInternal,
        transitionArgs,
      ),
    ).resolves.toMatchObject({ changed: true, replayed: false });
    await expect(
      t.mutation(
        internal.communityMemberWorkflows.transitionMemberStageInternal,
        transitionArgs,
      ),
    ).resolves.toMatchObject({ changed: true, replayed: true });
    await expect(
      t.mutation(
        internal.communityMemberWorkflows.transitionMemberStageInternal,
        { ...transitionArgs, targetStageKey: first.stage.key },
      ),
    ).rejects.toThrow("community_member_workflow_idempotency_conflict");
    await expect(
      t.mutation(
        internal.communityMemberWorkflows.transitionMemberStageInternal,
        {
          ...transitionArgs,
          sourceReceiptRef: "time:schedule-run:wrong-family",
        },
      ),
    ).rejects.toThrow("community_member_workflow_source_ref_type_mismatch");

    const records = await t.run(async (ctx) => ({
      states: await ctx.db.query("communityMemberWorkflowMemberStages").collect(),
      transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    }));
    expect(records.states).toHaveLength(1);
    expect(records.transitions).toHaveLength(1);
    expect(records.transitions[0]).toMatchObject({
      fromStageKey: first.stage.key,
      toStageKey: second.stage.key,
      triggerType: "in_app",
      sourceReceiptRef: "in_app:channel-message:example",
    });

    await expect(
      asOwner.mutation(api.communityMemberWorkflows.deleteBuilderWorkflowStage, {
        communityId: fixture.communityId,
        expectedRevision: 2,
        stageKey: second.stage.key,
      }),
    ).rejects.toThrow("community_member_workflow_stage_has_members");

    const selfProfile = await asMember.action(
      internal.communityCapabilityContext.readCommunitySemanticRepositoryInternal,
      {
        authSubject: MEMBER_SUBJECT,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        path: "/self.md",
        surface: "member_agent_dock",
      },
    );
    expect(selfProfile).toMatchObject({ ok: true });
    expect(selfProfile.result.body).toContain('Current stage: "Activated"');
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});

test("transitions fail closed when membership access is inactive", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { second } = await createTwoStageWorkflow(asOwner, fixture.communityId);
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.membershipId, {
      active: false,
      revokedAt: fixture.nowMs + 1,
      updatedAt: fixture.nowMs + 1,
    });
  });
  await expect(
    t.mutation(
      internal.communityMemberWorkflows.transitionMemberStageInternal,
      {
        communityId: fixture.communityId,
        membershipId: fixture.membershipId,
        targetStageKey: second.stage.key,
        triggerType: "time",
        sourceReceiptRef: "time:schedule-run:inactive-member",
      },
    ),
  ).rejects.toThrow("community_member_workflow_membership_inactive");
});

test("board pagination reaches active members and resolves their exact state beyond 500 rows", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const { first, second } = await createTwoStageWorkflow(asOwner, fixture.communityId);
  await t.run(async (ctx) => {
    const workflowId = ctx.db.normalizeId(
      "communityMemberWorkflows",
      first.workflow_id,
    )!;
    await ctx.db.patch(fixture.membershipId, {
      active: false,
      revokedAt: fixture.nowMs + 1,
      updatedAt: fixture.nowMs + 1,
    });
    await ctx.db.insert("communityMemberWorkflowMemberStages", {
      workflowId,
      membershipId: fixture.membershipId,
      currentStageKey: first.stage.key,
      stageEnteredAt: fixture.nowMs,
      transitionSeq: 0,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    for (let index = 0; index < 510; index += 1) {
      const membershipId = await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: fixture.memberId,
        role: "member",
        accessSource: "manual_grant",
        active: false,
        activationSequence: index + 2,
        activatedAt: fixture.nowMs + index + 2,
        revokedAt: fixture.nowMs + index + 3,
        createdAt: fixture.nowMs + index + 2,
        updatedAt: fixture.nowMs + index + 3,
      });
      await ctx.db.insert("communityMemberWorkflowMemberStages", {
        workflowId,
        membershipId,
        currentStageKey: first.stage.key,
        stageEnteredAt: fixture.nowMs + index + 2,
        transitionSeq: 0,
        createdAt: fixture.nowMs + index + 2,
        updatedAt: fixture.nowMs + index + 2,
      });
    }
    const activeMembershipId = await ctx.db.insert("communityMemberships", {
      communityId: fixture.communityId,
      userId: fixture.memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      activationSequence: 513,
      activatedAt: fixture.nowMs + 513,
      createdAt: fixture.nowMs + 513,
      updatedAt: fixture.nowMs + 513,
    });
    await ctx.db.insert("communityMemberWorkflowMemberStages", {
      workflowId,
      membershipId: activeMembershipId,
      currentStageKey: second.stage.key,
      stageEnteredAt: fixture.nowMs + 513,
      transitionSeq: 1,
      createdAt: fixture.nowMs + 513,
      updatedAt: fixture.nowMs + 513,
    });
    await ctx.db.patch(fixture.communityId, { activeMemberCount: 2 });
  });

  let cursor: string | null = null;
  let isDone = false;
  const visible: Array<{ membership_id: string; current_stage_key: string }> = [];
  while (!isDone) {
    const result = (await asOwner.query(
      api.communityMemberWorkflows.getBuilderWorkflowBoardPage,
      { communityId: fixture.communityId, cursor, pageSize: 100 },
    )) as {
      page: Array<{ membership_id: string; current_stage_key: string }>;
      continueCursor: string | null;
      isDone: boolean;
    };
    visible.push(...result.page);
    cursor = result.continueCursor;
    isDone = result.isDone;
  }
  expect(visible).toHaveLength(1);
  expect(visible[0]?.current_stage_key).toBe(second.stage.key);
});
