/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { CommunityMemberWorkflowDefinition } from "../shared/communityMemberWorkflow";

const modules = import.meta.glob([
  "./communityCapabilityContext.ts",
  "./communityMemberWorkflows.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "workflow-owner";
const MEMBER_SUBJECT = "workflow-member";

const DEFINITION: CommunityMemberWorkflowDefinition = {
  stages: [
    { key: "new", name: "New" },
    { key: "activated", name: "Activated" },
  ],
};

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
      activeMemberCount: 1,
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

test("workflow definition is direct, builder-owned, and revision guarded", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
      communityId: fixture.communityId,
      expectedRevision: 0,
      definition: DEFINITION,
    }),
  ).rejects.toThrow("community_forbidden");

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
      communityId: fixture.communityId,
      expectedRevision: 0,
      definition: DEFINITION,
    }),
  ).resolves.toMatchObject({ revision: 1 });

  const board = await asOwner.query(
    api.communityMemberWorkflows.getBuilderWorkflowBoard,
    { communityId: fixture.communityId },
  );
  expect(board.workflow).toMatchObject({
    revision: 1,
    stages: DEFINITION.stages,
    members: [
      {
        membership_id: String(fixture.membershipId),
        current_stage_key: "new",
        display_name: "Grace Member",
      },
    ],
  });

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
      communityId: fixture.communityId,
      expectedRevision: 0,
      definition: DEFINITION,
    }),
  ).rejects.toThrow("community_member_workflow_revision_conflict");

  await expect(
    asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
      communityId: fixture.communityId,
      expectedRevision: 1,
      definition: {
        stages: [
          { key: "new", name: "Joined" },
          { key: "activated", name: "Activated" },
        ],
      },
    }),
  ).resolves.toMatchObject({ revision: 2 });
});

test("stage transitions are minimal, idempotent, and receipt backed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
      communityId: fixture.communityId,
      expectedRevision: 0,
      definition: DEFINITION,
    });

    const transitionArgs = {
      communityId: fixture.communityId,
      membershipId: fixture.membershipId,
      targetStageKey: "activated",
      expectedStageKey: "new",
      causeType: "in_app" as const,
      sourceRef: "channel-message:example",
      actorType: "agent" as const,
      idempotencyKey: "trigger:example:1",
      occurredAt: Date.now(),
    };
    const first = await t.mutation(
      internal.communityMemberWorkflows.transitionMemberStageInternal,
      transitionArgs,
    );
    expect(first).toMatchObject({ changed: true, replayed: false });
    await expect(
      t.mutation(
        internal.communityMemberWorkflows.transitionMemberStageInternal,
        transitionArgs,
      ),
    ).resolves.toMatchObject({ changed: true, replayed: true });
    await expect(
      t.mutation(
        internal.communityMemberWorkflows.transitionMemberStageInternal,
        { ...transitionArgs, targetStageKey: "new" },
      ),
    ).rejects.toThrow("community_member_workflow_idempotency_conflict");

    const board = await asOwner.query(
      api.communityMemberWorkflows.getBuilderWorkflowBoard,
      { communityId: fixture.communityId },
    );
    expect(board.workflow?.members[0]?.current_stage_key).toBe("activated");

    const records = await t.run(async (ctx) => ({
      states: await ctx.db
        .query("communityMemberWorkflowMemberStages")
        .collect(),
      transitions: await ctx.db
        .query("communityMemberWorkflowTransitions")
        .collect(),
    }));
    expect(records.states).toHaveLength(1);
    expect(records.transitions).toHaveLength(1);
    expect(records.transitions[0]).toMatchObject({
      fromStageKey: "new",
      toStageKey: "activated",
      causeType: "in_app",
      actorType: "agent",
      sourceRef: "channel-message:example",
    });

    await expect(
      asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
        communityId: fixture.communityId,
        expectedRevision: 1,
        definition: { stages: [{ key: "new", name: "New" }] },
      }),
    ).rejects.toThrow("community_member_workflow_stage_has_members");
  } finally {
    vi.useRealTimers();
  }
});

test("transitions fail closed when membership access is inactive", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflow, {
    communityId: fixture.communityId,
    expectedRevision: 0,
    definition: DEFINITION,
  });
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
        targetStageKey: "activated",
        causeType: "system",
        actorType: "system",
        idempotencyKey: "inactive-member:1",
      },
    ),
  ).rejects.toThrow("community_member_workflow_membership_inactive");
});
