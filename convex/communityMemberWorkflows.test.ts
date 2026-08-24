/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import schema from "./schema";
import type { CommunityMemberWorkflowDraft } from "../shared/communityMemberWorkflow";

const modules = import.meta.glob([
  "./communityCapabilityContext.ts",
  "./communityMemberWorkflows.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "workflow-owner";
const MEMBER_SUBJECT = "workflow-member";
const NEW_MEMBER_SUBJECT = "workflow-new-member";

const MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT: CommunityMemberWorkflowDraft = {
  stages: [{ key: "new", name: "New" }],
};

function revisedMinimalDraft(name: string): CommunityMemberWorkflowDraft {
  return { stages: [{ key: "new", name }] };
}

const TEST_MOVEMENT_WORKFLOW_DRAFT: CommunityMemberWorkflowDraft = {
  stages: [
    ...MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT.stages,
    {
      key: "getting-started",
      name: "Getting started",
    },
    {
      key: "activated",
      name: "Activated",
    },
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
    const newMemberId = await ctx.db.insert("users", {
      authSubject: NEW_MEMBER_SUBJECT,
      displayName: "Lin New",
      handle: "lin-new",
      normalizedHandle: "lin-new",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "workflow-foundation",
      name: "Workflow Foundation",
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
    return { communityId, memberId, membershipId, newMemberId, nowMs, ownerId };
  });
}

test("builder workflow authority, version activation, and enrollment backfill fail closed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

    await expect(
      asMember.mutation(api.communityMemberWorkflows.saveBuilderWorkflowDraft, {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
      }),
    ).rejects.toThrow("community_forbidden");

    await expect(
      asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflowDraft, {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
      }),
    ).resolves.toMatchObject({ revision: 1, version: 1 });

    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.activateBuilderWorkflowDraft,
        { communityId: fixture.communityId, expectedRevision: 0 },
      ),
    ).rejects.toThrow("community_member_workflow_revision_conflict");

    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.activateBuilderWorkflowDraft,
        { communityId: fixture.communityId, expectedRevision: 1 },
      ),
    ).resolves.toMatchObject({
      version: 1,
      revision: 2,
      enrollment_backfill_status: "queued",
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const board = await asOwner.query(
      api.communityMemberWorkflows.getBuilderWorkflowBoard,
      { communityId: fixture.communityId },
    );
    expect(board.workflow).toMatchObject({
      status: "active",
      revision: 2,
      enrollment_backfill_status: "complete",
      active_version: { version: 1, status: "active" },
      draft_version: null,
      members: [
        {
          membership_id: String(fixture.membershipId),
          display_name: "Grace Member",
          current_stage_key: "new",
          status: "active",
          revision: 1,
        },
      ],
    });

    await expect(
      asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflowDraft, {
        communityId: fixture.communityId,
        expectedRevision: 2,
        draft: revisedMinimalDraft("New cohort"),
      }),
    ).resolves.toMatchObject({ revision: 3, version: 2 });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.activateBuilderWorkflowDraft,
        { communityId: fixture.communityId, expectedRevision: 3 },
      ),
    ).rejects.toThrow(
      "community_member_workflow_active_enrollments_require_migration",
    );

    await expect(
      asMember.query(api.communityMemberWorkflows.getBuilderWorkflowBoard, {
        communityId: fixture.communityId,
      }),
    ).rejects.toThrow("community_forbidden");

    const selfProjection = await asMember.query(
      internal.communityCapabilityContext
        .resolveCommunitySemanticRepositoryInternal,
      {
        authSubject: MEMBER_SUBJECT,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        operation: "read",
        path: "/self.md",
      },
    );
    expect(selfProjection).toMatchObject({
      ok: true,
      result: {
        body: expect.stringContaining("## My success workflow"),
      },
    });
    expect((selfProjection as any).result.body).toContain(
      'Current stage: "New" (`new`)',
    );

    const publicMemberProjection = await asMember.query(
      internal.communityCapabilityContext
        .resolveCommunitySemanticRepositoryInternal,
      {
        authSubject: MEMBER_SUBJECT,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        operation: "read",
        path: "/members/grace-member.md",
      },
    );
    expect(publicMemberProjection).toMatchObject({ ok: true });
    expect((publicMemberProjection as any).result.body).not.toContain(
      "My success workflow",
    );
  } finally {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  }
});

test("definition cleanup strips only obsolete prose fields and is idempotent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const legacy = await t.run(async (ctx) => {
    const workflowId = await ctx.db.insert("communityMemberWorkflows", {
      communityId: fixture.communityId,
      name: "Client success",
      status: "draft",
      revision: 1,
      createdByUserId: fixture.ownerId,
      updatedByUserId: fixture.ownerId,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    const versionId = await ctx.db.insert("communityMemberWorkflowVersions", {
      communityId: fixture.communityId,
      workflowId,
      version: 1,
      status: "draft",
      outcomeName: "Member outcome achieved",
      outcomeDefinition: "The member reaches the promised result.",
      stages: [
        {
          key: "new",
          name: "New",
          objective: "Understand the member's starting point.",
          completionDefinition: "The starting point is understood.",
        },
        {
          key: "activated",
          name: "Activated",
          objective: "Produce an early result.",
          completionDefinition: "An early result exists.",
        },
      ],
      createdByUserId: fixture.ownerId,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    await ctx.db.patch(workflowId, { draftVersionId: versionId });
    return { workflowId, versionId };
  });

  await expect(
    t.mutation(
      internal.communityMemberWorkflows
        .stripObsoleteWorkflowDefinitionFieldsInternal,
      { table: "workflows", limit: 1 },
    ),
  ).resolves.toMatchObject({ scanned: 1, changed: 1, is_done: true });
  await expect(
    t.mutation(
      internal.communityMemberWorkflows
        .stripObsoleteWorkflowDefinitionFieldsInternal,
      { table: "versions", limit: 1 },
    ),
  ).resolves.toMatchObject({ scanned: 1, changed: 1, is_done: true });

  const cleaned = await t.run(async (ctx) => ({
    workflow: await ctx.db.get(legacy.workflowId),
    version: await ctx.db.get(legacy.versionId),
  }));
  expect(Object.prototype.hasOwnProperty.call(cleaned.workflow!, "name")).toBe(
    false,
  );
  expect(
    Object.prototype.hasOwnProperty.call(cleaned.version!, "outcomeName"),
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      cleaned.version!,
      "outcomeDefinition",
    ),
  ).toBe(false);
  expect(cleaned.version?.stages).toEqual([
    { key: "new", name: "New" },
    { key: "activated", name: "Activated" },
  ]);
  expect(cleaned.workflow).toMatchObject({
    _id: legacy.workflowId,
    draftVersionId: legacy.versionId,
    revision: 1,
    createdAt: fixture.nowMs,
    updatedAt: fixture.nowMs,
  });
  expect(cleaned.version).toMatchObject({
    _id: legacy.versionId,
    workflowId: legacy.workflowId,
    version: 1,
    createdAt: fixture.nowMs,
    updatedAt: fixture.nowMs,
  });

  await expect(
    t.mutation(
      internal.communityMemberWorkflows
        .stripObsoleteWorkflowDefinitionFieldsInternal,
      { table: "workflows", limit: 1 },
    ),
  ).resolves.toMatchObject({ scanned: 1, changed: 0, is_done: true });
  await expect(
    t.mutation(
      internal.communityMemberWorkflows
        .stripObsoleteWorkflowDefinitionFieldsInternal,
      { table: "versions", limit: 1 },
    ),
  ).resolves.toMatchObject({ scanned: 1, changed: 0, is_done: true });
});

test("completed and exited enrollment history does not permanently block a replacement version", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
      },
    );
    await asOwner.mutation(
      api.communityMemberWorkflows.activateBuilderWorkflowDraft,
      { communityId: fixture.communityId, expectedRevision: 1 },
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    await t.run(async (ctx) => {
      const workflow = (await ctx.db
        .query("communityMemberWorkflows")
        .first())!;
      const version = (await ctx.db.get(workflow.activeVersionId!))!;
      const enrollment = (await ctx.db
        .query("communityMemberWorkflowEnrollments")
        .first())!;
      await ctx.db.patch(enrollment._id, {
        status: "completed",
        currentStageKey: "outcome-achieved",
        completedAt: fixture.nowMs + 10,
        updatedAt: fixture.nowMs + 10,
      });
      for (let index = 0; index < 500; index += 1) {
        const status = index % 2 === 0 ? "completed" : "exited";
        await ctx.db.insert("communityMemberWorkflowEnrollments", {
          communityId: fixture.communityId,
          workflowId: workflow._id,
          workflowVersionId: version._id,
          membershipId: fixture.membershipId,
          userId: fixture.memberId,
          activationSequence: index + 2,
          status,
          currentStageKey: "outcome-achieved",
          currentStageEnteredAt: fixture.nowMs + index + 20,
          transitionSeq: 1,
          revision: 1,
          ...(status === "completed"
            ? { completedAt: fixture.nowMs + index + 20 }
            : { exitedAt: fixture.nowMs + index + 20 }),
          createdAt: fixture.nowMs + index + 20,
          updatedAt: fixture.nowMs + index + 20,
        });
      }
    });

    await expect(
      asOwner.mutation(api.communityMemberWorkflows.saveBuilderWorkflowDraft, {
        communityId: fixture.communityId,
        expectedRevision: 2,
        draft: revisedMinimalDraft("Replacement path"),
      }),
    ).resolves.toMatchObject({ revision: 3, version: 2 });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.activateBuilderWorkflowDraft,
        { communityId: fixture.communityId, expectedRevision: 3 },
      ),
    ).resolves.toMatchObject({ revision: 4, version: 2 });
  } finally {
    vi.useRealTimers();
  }
});

test("a current paused enrollment still blocks replacement activation", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
      },
    );
    await asOwner.mutation(
      api.communityMemberWorkflows.activateBuilderWorkflowDraft,
      { communityId: fixture.communityId, expectedRevision: 1 },
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async (ctx) => {
      const enrollment = (await ctx.db
        .query("communityMemberWorkflowEnrollments")
        .first())!;
      await ctx.db.patch(enrollment._id, {
        status: "paused",
        updatedAt: fixture.nowMs + 10,
      });
    });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 2,
        draft: revisedMinimalDraft("Paused replacement"),
      },
    );
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.activateBuilderWorkflowDraft,
        { communityId: fixture.communityId, expectedRevision: 3 },
      ),
    ).rejects.toThrow(
      "community_member_workflow_active_enrollments_require_migration",
    );
  } finally {
    vi.useRealTimers();
  }
});

test("a stale active enrollment with inactive membership does not block replacement activation", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
      },
    );
    await asOwner.mutation(
      api.communityMemberWorkflows.activateBuilderWorkflowDraft,
      { communityId: fixture.communityId, expectedRevision: 1 },
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.membershipId, {
        active: false,
        revokedAt: fixture.nowMs + 10,
        revokedReason: "workflow_replacement_test",
        updatedAt: fixture.nowMs + 10,
      });
    });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 2,
        draft: revisedMinimalDraft("Reactivated replacement"),
      },
    );
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.activateBuilderWorkflowDraft,
        { communityId: fixture.communityId, expectedRevision: 3 },
      ),
    ).resolves.toMatchObject({ revision: 4, version: 2 });
  } finally {
    vi.useRealTimers();
  }
});

test("evidence and stage movement are idempotent, revision-bound, and append-only", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: TEST_MOVEMENT_WORKFLOW_DRAFT,
      },
    );
    await asOwner.mutation(
      api.communityMemberWorkflows.activateBuilderWorkflowDraft,
      { communityId: fixture.communityId, expectedRevision: 1 },
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const enrollmentId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("communityMemberWorkflowEnrollments")
        .collect();
      return rows[0]!._id;
    });

    const evidenceInput = {
      communityId: fixture.communityId,
      enrollmentId,
      stageKey: "new",
      summary: "Builder confirmed the member's baseline and intended outcome.",
      confidence: 1,
      idempotencyKey: "evidence:baseline:1",
    };
    const evidence = await asOwner.mutation(
      api.communityMemberWorkflows.recordBuilderEvidence,
      evidenceInput,
    );
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.recordBuilderEvidence,
        evidenceInput,
      ),
    ).resolves.toMatchObject({
      evidence_id: evidence.evidence_id,
      replayed: true,
    });
    await expect(
      asOwner.mutation(api.communityMemberWorkflows.recordBuilderEvidence, {
        ...evidenceInput,
        summary: "A conflicting replay.",
      }),
    ).rejects.toThrow("community_member_workflow_idempotency_conflict");

    const moveInput = {
      communityId: fixture.communityId,
      enrollmentId,
      expectedRevision: 1,
      targetStageKey: "getting-started",
      reason: "The baseline is explicit, so the member can begin setup.",
      evidenceIds: [evidence.evidence_id as any],
      idempotencyKey: "move:getting-started:1",
    };
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.moveBuilderWorkflowEnrollment,
        moveInput,
      ),
    ).resolves.toMatchObject({ enrollment_revision: 2, replayed: false });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.moveBuilderWorkflowEnrollment,
        moveInput,
      ),
    ).resolves.toMatchObject({ enrollment_revision: 2, replayed: true });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.moveBuilderWorkflowEnrollment,
        {
          ...moveInput,
          idempotencyKey: "move:stale:1",
          targetStageKey: "activated",
        },
      ),
    ).rejects.toThrow("community_member_workflow_enrollment_revision_conflict");
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.moveBuilderWorkflowEnrollment,
        {
          ...moveInput,
          expectedRevision: 2,
          targetStageKey: "activated",
          reason: "The member completed the activation action.",
          evidenceIds: [],
          idempotencyKey: "move:activated:1",
        },
      ),
    ).resolves.toMatchObject({ enrollment_revision: 3, replayed: false });
    const completionInput = {
      communityId: fixture.communityId,
      enrollmentId,
      expectedRevision: 3,
      reason: "The member achieved the defined workflow outcome.",
      evidenceIds: [evidence.evidence_id as any],
      idempotencyKey: "complete:outcome:1",
    };
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.completeBuilderWorkflowEnrollment,
        completionInput,
      ),
    ).resolves.toMatchObject({ enrollment_revision: 4, replayed: false });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.completeBuilderWorkflowEnrollment,
        completionInput,
      ),
    ).resolves.toMatchObject({ enrollment_revision: 4, replayed: true });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.completeBuilderWorkflowEnrollment,
        { ...completionInput, reason: "A conflicting replay." },
      ),
    ).rejects.toThrow("community_member_workflow_idempotency_conflict");
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.moveBuilderWorkflowEnrollment,
        moveInput,
      ),
    ).resolves.toMatchObject({ enrollment_revision: 2, replayed: true });

    const detail = await asOwner.query(
      api.communityMemberWorkflows.getBuilderEnrollmentDetail,
      { communityId: fixture.communityId, enrollmentId },
    );
    expect(detail.enrollment).toMatchObject({
      current_stage_key: "activated",
      status: "completed",
      revision: 4,
    });
    expect(detail.evidence).toHaveLength(1);
    expect(detail.transitions.map((row) => row.kind)).toEqual([
      "completed",
      "manual_move",
      "manual_move",
      "enrolled",
    ]);
    expect(detail.transitions.map((row) => row.seq)).toEqual([4, 3, 2, 1]);
  } finally {
    vi.useRealTimers();
  }
});

test("new membership activations reconcile to the active version without changing membership authority", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  try {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
    await asOwner.mutation(
      api.communityMemberWorkflows.saveBuilderWorkflowDraft,
      {
        communityId: fixture.communityId,
        expectedRevision: 0,
        draft: MINIMAL_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
      },
    );
    await asOwner.mutation(
      api.communityMemberWorkflows.activateBuilderWorkflowDraft,
      { communityId: fixture.communityId, expectedRevision: 1 },
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const activation = await t.run(async (ctx) =>
      activateCommunityMembershipCore({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.newMemberId,
        accessSource: "manual_grant",
        activationReason: "workflow_test",
        nowMs: fixture.nowMs + 100,
      }),
    );
    expect(activation).toMatchObject({
      accessGranted: true,
      membership: { active: true, activationSequence: 1 },
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const rows = await t.run(async (ctx) =>
      ctx.db.query("communityMemberWorkflowEnrollments").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.find((row) => row.userId === fixture.newMemberId),
    ).toMatchObject({
      membershipId: activation.membership._id,
      activationSequence: 1,
      currentStageKey: "new",
      status: "active",
    });

    await t.run(async (ctx) =>
      activateCommunityMembershipCore({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.newMemberId,
        accessSource: "manual_grant",
        activationReason: "workflow_test_replay",
        nowMs: fixture.nowMs + 200,
      }),
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(
      await t.run(async (ctx) =>
        ctx.db.query("communityMemberWorkflowEnrollments").collect(),
      ),
    ).toHaveLength(2);

    await t.run(async (ctx) => {
      await ctx.db.patch(activation.membership._id, {
        active: false,
        revokedAt: fixture.nowMs + 300,
        revokedReason: "workflow_test_exit",
        updatedAt: fixture.nowMs + 300,
      });
    });
    const staleEnrollmentId = await t.run(async (ctx) => {
      const currentRows = await ctx.db
        .query("communityMemberWorkflowEnrollments")
        .collect();
      return currentRows.find((row) => row.userId === fixture.newMemberId)!._id;
    });
    await expect(
      asOwner.mutation(
        api.communityMemberWorkflows.moveBuilderWorkflowEnrollment,
        {
          communityId: fixture.communityId,
          enrollmentId: staleEnrollmentId,
          expectedRevision: 1,
          targetStageKey: "getting-started",
          reason: "A stale builder command must fail closed.",
          idempotencyKey: "move:inactive:1",
        },
      ),
    ).rejects.toThrow("community_member_workflow_membership_inactive");
    await t.mutation(
      internal.communityMemberWorkflows.reconcileMembershipEnrollmentInternal,
      {
        membershipId: activation.membership._id,
        activationSequence: 1,
      },
    );
    const exitedRows = await t.run(async (ctx) =>
      ctx.db.query("communityMemberWorkflowEnrollments").collect(),
    );
    expect(
      exitedRows.find((row) => row.userId === fixture.newMemberId),
    ).toMatchObject({ status: "exited", revision: 2, transitionSeq: 2 });

    const reactivation = await t.run(async (ctx) =>
      activateCommunityMembershipCore({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.newMemberId,
        accessSource: "manual_grant",
        activationReason: "workflow_test_reactivation",
        nowMs: fixture.nowMs + 400,
      }),
    );
    expect(reactivation.membership).toMatchObject({
      active: true,
      activationSequence: 2,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const reactivatedRows = await t.run(async (ctx) =>
      ctx.db.query("communityMemberWorkflowEnrollments").collect(),
    );
    expect(reactivatedRows).toHaveLength(3);
    expect(
      reactivatedRows.find(
        (row) =>
          row.userId === fixture.newMemberId && row.activationSequence === 2,
      ),
    ).toMatchObject({ status: "active", currentStageKey: "new" });
  } finally {
    vi.useRealTimers();
  }
});
