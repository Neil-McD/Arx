import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildCommunityMemberWorkflowTransitionFingerprint,
  normalizeCommunityMemberWorkflowConfidence,
  normalizeCommunityMemberWorkflowDraft,
  normalizeCommunityMemberWorkflowEvidenceSummary,
  normalizeCommunityMemberWorkflowIdempotencyKey,
  normalizeCommunityMemberWorkflowReason,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeCommunityMemberWorkflowStageKey,
  type CommunityMemberWorkflowStage,
} from "../shared/communityMemberWorkflow";
import {
  communityMembershipRowIsActive,
  requireCommunityManager,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityMembershipLike,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

const workflowStageInputValidator = v.object({
  key: v.string(),
  name: v.string(),
  objective: v.string(),
  completionDefinition: v.string(),
});

const workflowDraftInputValidator = v.object({
  name: v.string(),
  outcomeName: v.string(),
  outcomeDefinition: v.string(),
  stages: v.array(workflowStageInputValidator),
});

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

const WORKFLOW_ACTIVATION_BLOCKER_SCAN_LIMIT = 500;

type WorkflowRow = any;
type WorkflowVersionRow = any;
type EnrollmentRow = any;
type EvidenceRow = any;
type TransitionRow = any;

function normalizeExpectedRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isFinite(revision) || revision < 0) {
    throw new Error("community_member_workflow_revision_invalid");
  }
  return Math.floor(revision);
}

function normalizeActivationSequence(value: unknown): number {
  const sequence = Number(value);
  return Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
}

async function requireWorkflowManager(args: {
  ctx: any;
  communityId: any;
  userId?: any;
  authSubject?: string | null;
}) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const { community } = await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  return { userId, community };
}

async function getCurrentWorkflowForCommunity(
  ctx: any,
  communityId: any,
): Promise<WorkflowRow | null> {
  const rows = (await ctx.db
    .query("communityMemberWorkflows" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as WorkflowRow[];
  const current = rows.filter((row) => row.status !== "archived");
  if (current.length > 1) {
    throw new Error("community_member_workflow_ambiguous");
  }
  return current[0] ?? null;
}

async function requireWorkflowVersion(
  ctx: any,
  workflow: WorkflowRow,
  versionId: any,
): Promise<WorkflowVersionRow> {
  const version = (await ctx.db.get(versionId)) as WorkflowVersionRow | null;
  if (
    !version ||
    String(version.workflowId) !== String(workflow._id) ||
    String(version.communityId) !== String(workflow.communityId)
  ) {
    throw new Error("community_member_workflow_version_invalid");
  }
  return version;
}

async function getUniqueEnrollmentForActivation(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
  activationSequence: number;
}): Promise<EnrollmentRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowEnrollments" as any)
    .withIndex("by_workflow_membership_activation", (q: any) =>
      q
        .eq("workflowId", args.workflowId)
        .eq("membershipId", args.membershipId)
        .eq("activationSequence", args.activationSequence),
    )
    .collect()) as EnrollmentRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_enrollment_ambiguous");
  }
  return rows[0] ?? null;
}

async function enrollmentHasCurrentActiveMembership(
  ctx: any,
  enrollment: EnrollmentRow,
): Promise<boolean> {
  const membership = (await ctx.db.get(
    enrollment.membershipId,
  )) as CommunityMembershipLike | null;
  return Boolean(
    membership &&
    String(membership.communityId) === String(enrollment.communityId) &&
    String(membership.userId) === String(enrollment.userId) &&
    communityMembershipRowIsActive(membership) &&
    normalizeActivationSequence(membership.activationSequence) ===
      normalizeActivationSequence(enrollment.activationSequence),
  );
}

async function workflowHasCurrentBlockingEnrollment(args: {
  ctx: any;
  workflowId: any;
}): Promise<boolean> {
  let inspected = 0;
  for (const status of ["active", "paused"] as const) {
    const rows = (await args.ctx.db
      .query("communityMemberWorkflowEnrollments" as any)
      .withIndex("by_workflow_status_stage", (q: any) =>
        q.eq("workflowId", args.workflowId).eq("status", status),
      )
      .take(WORKFLOW_ACTIVATION_BLOCKER_SCAN_LIMIT + 1)) as EnrollmentRow[];
    for (const enrollment of rows) {
      inspected += 1;
      if (inspected > WORKFLOW_ACTIVATION_BLOCKER_SCAN_LIMIT) {
        throw new Error(
          "community_member_workflow_activation_migration_required",
        );
      }
      if (await enrollmentHasCurrentActiveMembership(args.ctx, enrollment)) {
        return true;
      }
    }
  }
  return false;
}

async function insertTransition(args: {
  ctx: any;
  enrollment: EnrollmentRow;
  kind: TransitionRow["kind"];
  fromStageKey?: string | null;
  toStageKey?: string | null;
  evidenceIds?: any[];
  actorType: TransitionRow["actorType"];
  actorUserId?: any;
  reason: string;
  idempotencyKey: string;
  idempotencyFingerprint: string;
  occurredAt: number;
  seq: number;
}) {
  return await args.ctx.db.insert("communityMemberWorkflowTransitions" as any, {
    communityId: args.enrollment.communityId,
    workflowId: args.enrollment.workflowId,
    workflowVersionId: args.enrollment.workflowVersionId,
    enrollmentId: args.enrollment._id,
    membershipId: args.enrollment.membershipId,
    userId: args.enrollment.userId,
    seq: args.seq,
    ...(args.fromStageKey ? { fromStageKey: args.fromStageKey } : {}),
    ...(args.toStageKey ? { toStageKey: args.toStageKey } : {}),
    kind: args.kind,
    evidenceIds: args.evidenceIds ?? [],
    actorType: args.actorType,
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    reason: args.reason,
    idempotencyKey: args.idempotencyKey,
    idempotencyFingerprint: args.idempotencyFingerprint,
    occurredAt: args.occurredAt,
    createdAt: args.occurredAt,
  });
}

export async function enrollActiveMembershipInCommunityWorkflowCore(args: {
  ctx: any;
  communityId: any;
  membership: CommunityMembershipLike;
  nowMs: number;
}): Promise<{ enrollmentId: any | null; created: boolean }> {
  if (!communityMembershipRowIsActive(args.membership)) {
    return { enrollmentId: null, created: false };
  }
  const workflow = await getCurrentWorkflowForCommunity(
    args.ctx,
    args.communityId,
  );
  if (!workflow || workflow.status !== "active" || !workflow.activeVersionId) {
    return { enrollmentId: null, created: false };
  }
  const version = await requireWorkflowVersion(
    args.ctx,
    workflow,
    workflow.activeVersionId,
  );
  if (version.status !== "active") {
    throw new Error("community_member_workflow_active_version_invalid");
  }
  const stages = version.stages as CommunityMemberWorkflowStage[];
  const firstStage = stages[0];
  if (!firstStage) throw new Error("community_member_workflow_stage_missing");
  const activationSequence = normalizeActivationSequence(
    args.membership.activationSequence,
  );
  const existing = await getUniqueEnrollmentForActivation({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: args.membership._id,
    activationSequence,
  });
  if (existing) return { enrollmentId: existing._id, created: false };

  const enrollmentId = await args.ctx.db.insert(
    "communityMemberWorkflowEnrollments" as any,
    {
      communityId: args.communityId,
      workflowId: workflow._id,
      workflowVersionId: version._id,
      membershipId: args.membership._id,
      userId: args.membership.userId,
      activationSequence,
      status: "active",
      currentStageKey: firstStage.key,
      currentStageEnteredAt: args.nowMs,
      transitionSeq: 1,
      revision: 1,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    },
  );
  const enrollment = (await args.ctx.db.get(
    enrollmentId,
  )) as EnrollmentRow | null;
  if (!enrollment) {
    throw new Error("community_member_workflow_enrollment_create_failed");
  }
  const idempotencyKey = `enroll:${String(args.membership._id)}:${activationSequence}`;
  await insertTransition({
    ctx: args.ctx,
    enrollment,
    kind: "enrolled",
    toStageKey: firstStage.key,
    actorType: "system",
    reason: "Active membership enrolled in the community workflow.",
    idempotencyKey,
    idempotencyFingerprint: JSON.stringify({
      workflowId: String(workflow._id),
      versionId: String(version._id),
      membershipId: String(args.membership._id),
      activationSequence,
      stageKey: firstStage.key,
    }),
    occurredAt: args.nowMs,
    seq: 1,
  });
  return { enrollmentId, created: true };
}

export const saveBuilderWorkflowDraft = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.optional(v.number()),
    draft: workflowDraftInputValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const draft = normalizeCommunityMemberWorkflowDraft(args.draft);
    const nowMs = Date.now();
    const existing = await getCurrentWorkflowForCommunity(
      ctx,
      args.communityId,
    );

    if (!existing) {
      if (args.expectedRevision !== undefined && args.expectedRevision !== 0) {
        throw new Error("community_member_workflow_revision_conflict");
      }
      const workflowId = await ctx.db.insert(
        "communityMemberWorkflows" as any,
        {
          communityId: args.communityId,
          name: draft.name,
          status: "draft",
          revision: 1,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      const versionId = await ctx.db.insert(
        "communityMemberWorkflowVersions" as any,
        {
          communityId: args.communityId,
          workflowId,
          version: 1,
          status: "draft",
          outcomeName: draft.outcomeName,
          outcomeDefinition: draft.outcomeDefinition,
          stages: draft.stages,
          createdByUserId: userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      await ctx.db.patch(workflowId, { draftVersionId: versionId });
      return { workflow_id: String(workflowId), revision: 1, version: 1 };
    }

    const expectedRevision = normalizeExpectedRevision(
      args.expectedRevision ?? existing.revision,
    );
    if (expectedRevision !== existing.revision) {
      throw new Error("community_member_workflow_revision_conflict");
    }
    let draftVersion: WorkflowVersionRow | null = null;
    if (existing.draftVersionId) {
      draftVersion = await requireWorkflowVersion(
        ctx,
        existing,
        existing.draftVersionId,
      );
      if (draftVersion.status !== "draft") {
        throw new Error("community_member_workflow_draft_version_invalid");
      }
      await ctx.db.patch(draftVersion._id, {
        outcomeName: draft.outcomeName,
        outcomeDefinition: draft.outcomeDefinition,
        stages: draft.stages,
        updatedAt: nowMs,
      });
    } else {
      const activeVersion = existing.activeVersionId
        ? await requireWorkflowVersion(ctx, existing, existing.activeVersionId)
        : null;
      const nextVersion = Math.max(1, Number(activeVersion?.version ?? 0) + 1);
      const versionId = await ctx.db.insert(
        "communityMemberWorkflowVersions" as any,
        {
          communityId: args.communityId,
          workflowId: existing._id,
          version: nextVersion,
          status: "draft",
          outcomeName: draft.outcomeName,
          outcomeDefinition: draft.outcomeDefinition,
          stages: draft.stages,
          createdByUserId: userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      draftVersion = await ctx.db.get(versionId);
      await ctx.db.patch(existing._id, { draftVersionId: versionId });
    }
    const revision = existing.revision + 1;
    await ctx.db.patch(existing._id, {
      name: draft.name,
      status: existing.activeVersionId ? "active" : "draft",
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    return {
      workflow_id: String(existing._id),
      revision,
      version: Number(draftVersion?.version ?? 1),
    };
  },
});

export const activateBuilderWorkflowDraft = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const workflow = await getCurrentWorkflowForCommunity(
      ctx,
      args.communityId,
    );
    if (!workflow || !workflow.draftVersionId) {
      throw new Error("community_member_workflow_draft_missing");
    }
    if (
      normalizeExpectedRevision(args.expectedRevision) !== workflow.revision
    ) {
      throw new Error("community_member_workflow_revision_conflict");
    }
    const draft = await requireWorkflowVersion(
      ctx,
      workflow,
      workflow.draftVersionId,
    );
    if (draft.status !== "draft") {
      throw new Error("community_member_workflow_draft_version_invalid");
    }
    normalizeCommunityMemberWorkflowDraft({
      name: workflow.name,
      outcomeName: draft.outcomeName,
      outcomeDefinition: draft.outcomeDefinition,
      stages: draft.stages,
    });
    const hasCurrentActiveEnrollment = workflow.activeVersionId
      ? await workflowHasCurrentBlockingEnrollment({
          ctx,
          workflowId: workflow._id,
        })
      : false;
    if (hasCurrentActiveEnrollment) {
      throw new Error(
        "community_member_workflow_active_enrollments_require_migration",
      );
    }
    const nowMs = Date.now();
    if (workflow.activeVersionId) {
      const previous = await requireWorkflowVersion(
        ctx,
        workflow,
        workflow.activeVersionId,
      );
      if (previous.status === "active") {
        await ctx.db.patch(previous._id, {
          status: "retired",
          updatedAt: nowMs,
        });
      }
    }
    await ctx.db.patch(draft._id, {
      status: "active",
      activatedByUserId: userId,
      activatedAt: nowMs,
      updatedAt: nowMs,
    });
    const revision = workflow.revision + 1;
    await ctx.db.patch(workflow._id, {
      status: "active",
      activeVersionId: draft._id,
      draftVersionId: undefined,
      enrollmentBackfillStatus: "queued",
      enrollmentBackfillVersionId: draft._id,
      enrollmentBackfillCursor: undefined,
      enrollmentBackfillError: undefined,
      enrollmentBackfillUpdatedAt: nowMs,
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    await ctx.scheduler.runAfter(
      0,
      (internal as any).communityMemberWorkflows
        .backfillActiveMembershipsPageInternal,
      {
        workflowId: workflow._id,
        workflowVersionId: draft._id,
      },
    );
    return {
      workflow_id: String(workflow._id),
      active_version_id: String(draft._id),
      version: draft.version,
      revision,
      enrollment_backfill_status: "queued",
    };
  },
});

export const backfillActiveMembershipsPageInternal = internalMutation({
  args: {
    workflowId: v.id("communityMemberWorkflows"),
    workflowVersionId: v.id("communityMemberWorkflowVersions"),
    cursor: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workflow = (await ctx.db.get(args.workflowId)) as WorkflowRow | null;
    if (
      !workflow ||
      workflow.status !== "active" ||
      String(workflow.activeVersionId ?? "") !==
        String(args.workflowVersionId) ||
      String(workflow.enrollmentBackfillVersionId ?? "") !==
        String(args.workflowVersionId)
    ) {
      return { status: "superseded", created: 0 };
    }
    const nowMs = Date.now();
    await ctx.db.patch(workflow._id, {
      enrollmentBackfillStatus: "running",
      enrollmentBackfillUpdatedAt: nowMs,
    });
    try {
      const page = await ctx.db
        .query("communityMemberships" as any)
        .withIndex("by_community", (q: any) =>
          q.eq("communityId", workflow.communityId),
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: 100,
          maximumRowsRead: 300,
        });
      let created = 0;
      for (const membership of page.page as CommunityMembershipLike[]) {
        const result = await enrollActiveMembershipInCommunityWorkflowCore({
          ctx,
          communityId: workflow.communityId,
          membership,
          nowMs,
        });
        if (result.created) created += 1;
      }
      if (page.isDone) {
        await ctx.db.patch(workflow._id, {
          enrollmentBackfillStatus: "complete",
          enrollmentBackfillCursor: undefined,
          enrollmentBackfillError: undefined,
          enrollmentBackfillUpdatedAt: Date.now(),
        });
        return { status: "complete", created };
      }
      await ctx.db.patch(workflow._id, {
        enrollmentBackfillCursor: page.continueCursor,
        enrollmentBackfillError: undefined,
        enrollmentBackfillUpdatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        (internal as any).communityMemberWorkflows
          .backfillActiveMembershipsPageInternal,
        {
          workflowId: workflow._id,
          workflowVersionId: args.workflowVersionId,
          cursor: page.continueCursor,
        },
      );
      return { status: "running", created };
    } catch (error) {
      const attempt = Math.max(0, Math.floor(Number(args.attempt ?? 0)));
      const retrying = attempt < 2;
      await ctx.db.patch(workflow._id, {
        enrollmentBackfillStatus: retrying ? "queued" : "error",
        enrollmentBackfillError: retrying
          ? "retrying"
          : String(error instanceof Error ? error.message : error).slice(
              0,
              240,
            ),
        enrollmentBackfillUpdatedAt: Date.now(),
      });
      if (retrying) {
        await ctx.scheduler.runAfter(
          1_000 * 2 ** attempt,
          (internal as any).communityMemberWorkflows
            .backfillActiveMembershipsPageInternal,
          {
            workflowId: workflow._id,
            workflowVersionId: args.workflowVersionId,
            ...(args.cursor ? { cursor: args.cursor } : {}),
            attempt: attempt + 1,
          },
        );
      }
      return { status: retrying ? "queued" : "error", created: 0 };
    }
  },
});

export const reconcileMembershipEnrollmentInternal = internalMutation({
  args: {
    membershipId: v.id("communityMemberships"),
    activationSequence: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = (await ctx.db.get(
      args.membershipId,
    )) as CommunityMembershipLike | null;
    const activationSequence = normalizeActivationSequence(
      args.activationSequence,
    );
    if (
      membership &&
      communityMembershipRowIsActive(membership) &&
      normalizeActivationSequence(membership.activationSequence) ===
        activationSequence
    ) {
      const result = await enrollActiveMembershipInCommunityWorkflowCore({
        ctx,
        communityId: membership.communityId,
        membership,
        nowMs: Date.now(),
      });
      return {
        created: result.created,
        exited: false,
        enrollment_id: result.enrollmentId ? String(result.enrollmentId) : null,
      };
    }
    const enrollments = (await ctx.db
      .query("communityMemberWorkflowEnrollments" as any)
      .withIndex("by_membership", (q: any) =>
        q.eq("membershipId", args.membershipId),
      )
      .collect()) as EnrollmentRow[];
    const current = enrollments.filter(
      (row) =>
        normalizeActivationSequence(row.activationSequence) ===
          activationSequence &&
        (row.status === "active" || row.status === "paused"),
    );
    if (current.length > 1) {
      throw new Error("community_member_workflow_enrollment_ambiguous");
    }
    const enrollment = current[0] ?? null;
    if (!enrollment) {
      return { created: false, exited: false, enrollment_id: null };
    }
    const nowMs = Date.now();
    const nextRevision = enrollment.revision + 1;
    const nextSeq = enrollment.transitionSeq + 1;
    const idempotencyKey = `membership-exit:${String(args.membershipId)}:${activationSequence}`;
    const fingerprint = buildCommunityMemberWorkflowTransitionFingerprint({
      enrollmentId: enrollment._id,
      expectedRevision: enrollment.revision,
      targetStageKey: enrollment.currentStageKey,
      kind: "exited",
      reason: "Community membership is no longer active.",
    });
    await ctx.db.patch(enrollment._id, {
      status: "exited",
      transitionSeq: nextSeq,
      revision: nextRevision,
      exitedAt: nowMs,
      updatedAt: nowMs,
    });
    await insertTransition({
      ctx,
      enrollment,
      kind: "exited",
      fromStageKey: enrollment.currentStageKey,
      toStageKey: enrollment.currentStageKey,
      actorType: "system",
      reason: "Community membership is no longer active.",
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      occurredAt: nowMs,
      seq: nextSeq,
    });
    return {
      created: false,
      exited: true,
      enrollment_id: String(enrollment._id),
    };
  },
});

function mapVersion(version: WorkflowVersionRow | null) {
  if (!version) return null;
  return {
    id: String(version._id),
    version: version.version,
    status: version.status,
    outcome_name: version.outcomeName,
    outcome_definition: version.outcomeDefinition,
    stages: version.stages,
    activated_at:
      typeof version.activatedAt === "number"
        ? toIsoString(version.activatedAt)
        : null,
    created_at: toIsoString(version.createdAt),
    updated_at: toIsoString(version.updatedAt),
  };
}

export const getBuilderWorkflowBoard = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    limitPerStage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const workflow = await getCurrentWorkflowForCommunity(
      ctx,
      args.communityId,
    );
    if (!workflow) return { workflow: null };
    const [activeVersion, draftVersion] = await Promise.all([
      workflow.activeVersionId
        ? requireWorkflowVersion(ctx, workflow, workflow.activeVersionId)
        : Promise.resolve(null),
      workflow.draftVersionId
        ? requireWorkflowVersion(ctx, workflow, workflow.draftVersionId)
        : Promise.resolve(null),
    ]);
    const displayVersion = activeVersion ?? draftVersion;
    const limitPerStage = Math.max(
      1,
      Math.min(100, Math.floor(Number(args.limitPerStage ?? 50))),
    );
    const members = [] as any[];
    const truncatedStageKeys = new Set<string>();
    for (const stage of (displayVersion?.stages ??
      []) as CommunityMemberWorkflowStage[]) {
      const stageRows: EnrollmentRow[] = [];
      for (const status of ["active", "paused", "completed"] as const) {
        const rows = (await ctx.db
          .query("communityMemberWorkflowEnrollments" as any)
          .withIndex("by_version_status_stage", (q: any) =>
            q
              .eq("workflowVersionId", displayVersion!._id)
              .eq("status", status)
              .eq("currentStageKey", stage.key),
          )
          .take(limitPerStage + 1)) as EnrollmentRow[];
        if (rows.length > limitPerStage) truncatedStageKeys.add(stage.key);
        stageRows.push(...rows.slice(0, limitPerStage));
      }
      if (stageRows.length > limitPerStage) truncatedStageKeys.add(stage.key);
      for (const enrollment of stageRows.slice(0, limitPerStage)) {
        const [membershipIsActive, profile, publicUserId] = await Promise.all([
          enrollmentHasCurrentActiveMembership(ctx, enrollment),
          resolveUserProfileDisplayProjection(ctx, enrollment.userId),
          resolvePublicUserId(ctx, enrollment.userId),
        ]);
        if (!membershipIsActive) continue;
        members.push({
          enrollment_id: String(enrollment._id),
          membership_id: String(enrollment.membershipId),
          user_id: publicUserId ?? String(enrollment.userId),
          workflow_version_id: String(enrollment.workflowVersionId),
          activation_sequence: enrollment.activationSequence,
          status: enrollment.status,
          current_stage_key: enrollment.currentStageKey,
          current_stage_entered_at: toIsoString(
            enrollment.currentStageEnteredAt,
          ),
          revision: enrollment.revision,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          avatar_storage_id: profile.avatar_storage_id,
          avatar_focus_x: profile.avatar_focus_x,
          avatar_focus_y: profile.avatar_focus_y,
          avatar_zoom: profile.avatar_zoom,
        });
      }
    }
    return {
      workflow: {
        id: String(workflow._id),
        community_id: String(workflow.communityId),
        name: workflow.name,
        status: workflow.status,
        revision: workflow.revision,
        active_version: mapVersion(activeVersion),
        draft_version: mapVersion(draftVersion),
        enrollment_backfill_status: workflow.enrollmentBackfillStatus ?? null,
        enrollment_backfill_error: workflow.enrollmentBackfillError ?? null,
        members,
        truncated_stage_keys: [...truncatedStageKeys],
        updated_at: toIsoString(workflow.updatedAt),
      },
    };
  },
});

export const getBuilderEnrollmentDetail = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    enrollmentId: v.id("communityMemberWorkflowEnrollments"),
  },
  handler: async (ctx, args) => {
    await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const enrollment = (await ctx.db.get(
      args.enrollmentId,
    )) as EnrollmentRow | null;
    if (
      !enrollment ||
      String(enrollment.communityId) !== String(args.communityId)
    ) {
      throw new Error("community_member_workflow_enrollment_not_found");
    }
    const [version, evidence, transitions, profile, publicUserId] =
      await Promise.all([
        ctx.db.get(enrollment.workflowVersionId),
        ctx.db
          .query("communityMemberWorkflowEvidence" as any)
          .withIndex("by_enrollment_createdAt", (q: any) =>
            q.eq("enrollmentId", enrollment._id),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("communityMemberWorkflowTransitions" as any)
          .withIndex("by_enrollment_seq", (q: any) =>
            q.eq("enrollmentId", enrollment._id),
          )
          .order("desc")
          .take(100),
        resolveUserProfileDisplayProjection(ctx, enrollment.userId),
        resolvePublicUserId(ctx, enrollment.userId),
      ]);
    return {
      enrollment: {
        id: String(enrollment._id),
        membership_id: String(enrollment.membershipId),
        user_id: publicUserId ?? String(enrollment.userId),
        workflow_version_id: String(enrollment.workflowVersionId),
        workflow_version: mapVersion(version),
        activation_sequence: enrollment.activationSequence,
        status: enrollment.status,
        current_stage_key: enrollment.currentStageKey,
        current_stage_entered_at: toIsoString(enrollment.currentStageEnteredAt),
        revision: enrollment.revision,
        completed_at:
          typeof enrollment.completedAt === "number"
            ? toIsoString(enrollment.completedAt)
            : null,
        exited_at:
          typeof enrollment.exitedAt === "number"
            ? toIsoString(enrollment.exitedAt)
            : null,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        avatar_storage_id: profile.avatar_storage_id,
        avatar_focus_x: profile.avatar_focus_x,
        avatar_focus_y: profile.avatar_focus_y,
        avatar_zoom: profile.avatar_zoom,
      },
      evidence: (evidence as EvidenceRow[]).map((row) => ({
        id: String(row._id),
        stage_key: row.stageKey,
        criterion_key: row.criterionKey ?? null,
        source_type: row.sourceType,
        status: row.status,
        summary: row.summary,
        source_ref: row.sourceRef ?? null,
        confidence: row.confidence,
        uncertainty: row.uncertainty ?? null,
        observed_at: toIsoString(row.observedAt),
        created_at: toIsoString(row.createdAt),
      })),
      transitions: (transitions as TransitionRow[]).map((row) => ({
        id: String(row._id),
        seq: row.seq,
        from_stage_key: row.fromStageKey ?? null,
        to_stage_key: row.toStageKey ?? null,
        kind: row.kind,
        reason: row.reason,
        actor_type: row.actorType,
        occurred_at: toIsoString(row.occurredAt),
      })),
    };
  },
});

export const recordBuilderEvidence = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    enrollmentId: v.id("communityMemberWorkflowEnrollments"),
    stageKey: v.string(),
    summary: v.string(),
    sourceRef: v.optional(v.string()),
    confidence: v.number(),
    observedAt: v.optional(v.number()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const enrollment = (await ctx.db.get(
      args.enrollmentId,
    )) as EnrollmentRow | null;
    if (
      !enrollment ||
      String(enrollment.communityId) !== String(args.communityId)
    ) {
      throw new Error("community_member_workflow_enrollment_not_found");
    }
    const version = (await ctx.db.get(
      enrollment.workflowVersionId,
    )) as WorkflowVersionRow | null;
    const stageKey = normalizeCommunityMemberWorkflowStageKey(args.stageKey);
    if (!version?.stages?.some((stage: any) => stage.key === stageKey)) {
      throw new Error("community_member_workflow_stage_not_found");
    }
    const summary = normalizeCommunityMemberWorkflowEvidenceSummary(
      args.summary,
    );
    const sourceRef = normalizeCommunityMemberWorkflowSourceRef(args.sourceRef);
    const confidence = normalizeCommunityMemberWorkflowConfidence(
      args.confidence,
    );
    const idempotencyKey = normalizeCommunityMemberWorkflowIdempotencyKey(
      args.idempotencyKey,
    );
    const fingerprint = JSON.stringify({
      enrollmentId: String(enrollment._id),
      stageKey,
      summary,
      sourceRef,
      confidence,
      observedAt: args.observedAt ?? null,
    });
    const existing = (await ctx.db
      .query("communityMemberWorkflowEvidence" as any)
      .withIndex("by_enrollment_idempotency", (q: any) =>
        q
          .eq("enrollmentId", enrollment._id)
          .eq("idempotencyKey", idempotencyKey),
      )
      .first()) as EvidenceRow | null;
    if (existing) {
      if (existing.idempotencyFingerprint !== fingerprint) {
        throw new Error("community_member_workflow_idempotency_conflict");
      }
      return { evidence_id: String(existing._id), replayed: true };
    }
    const nowMs = Date.now();
    const evidenceId = await ctx.db.insert(
      "communityMemberWorkflowEvidence" as any,
      {
        communityId: enrollment.communityId,
        workflowId: enrollment.workflowId,
        workflowVersionId: enrollment.workflowVersionId,
        enrollmentId: enrollment._id,
        membershipId: enrollment.membershipId,
        userId: enrollment.userId,
        stageKey,
        sourceType: "builder",
        status: "accepted",
        summary,
        ...(sourceRef ? { sourceRef } : {}),
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
        confidence,
        observedAt: args.observedAt ?? nowMs,
        createdByActorType: "builder",
        createdByUserId: userId,
        decidedByUserId: userId,
        decidedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
    );
    return { evidence_id: String(evidenceId), replayed: false };
  },
});

async function requireAcceptedEvidence(args: {
  ctx: any;
  enrollment: EnrollmentRow;
  evidenceIds: any[];
}) {
  const rows: EvidenceRow[] = [];
  for (const evidenceId of args.evidenceIds) {
    const row = (await args.ctx.db.get(evidenceId)) as EvidenceRow | null;
    if (
      !row ||
      String(row.enrollmentId) !== String(args.enrollment._id) ||
      row.status !== "accepted"
    ) {
      throw new Error("community_member_workflow_evidence_invalid");
    }
    rows.push(row);
  }
  return rows;
}

export const moveBuilderWorkflowEnrollment = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    enrollmentId: v.id("communityMemberWorkflowEnrollments"),
    expectedRevision: v.number(),
    targetStageKey: v.string(),
    reason: v.string(),
    evidenceIds: v.optional(v.array(v.id("communityMemberWorkflowEvidence"))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const enrollment = (await ctx.db.get(
      args.enrollmentId,
    )) as EnrollmentRow | null;
    if (
      !enrollment ||
      String(enrollment.communityId) !== String(args.communityId)
    ) {
      throw new Error("community_member_workflow_enrollment_not_found");
    }
    const targetStageKey = normalizeCommunityMemberWorkflowStageKey(
      args.targetStageKey,
    );
    const reason = normalizeCommunityMemberWorkflowReason(args.reason);
    const idempotencyKey = normalizeCommunityMemberWorkflowIdempotencyKey(
      args.idempotencyKey,
    );
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const evidenceIds = args.evidenceIds ?? [];
    const fingerprint = buildCommunityMemberWorkflowTransitionFingerprint({
      enrollmentId: enrollment._id,
      expectedRevision,
      targetStageKey,
      kind: "manual_move",
      reason,
      evidenceIds,
    });
    const existing = (await ctx.db
      .query("communityMemberWorkflowTransitions" as any)
      .withIndex("by_enrollment_idempotency", (q: any) =>
        q
          .eq("enrollmentId", enrollment._id)
          .eq("idempotencyKey", idempotencyKey),
      )
      .first()) as TransitionRow | null;
    if (existing) {
      if (existing.idempotencyFingerprint !== fingerprint) {
        throw new Error("community_member_workflow_idempotency_conflict");
      }
      return {
        transition_id: String(existing._id),
        enrollment_revision: existing.seq,
        replayed: true,
      };
    }
    if (enrollment.revision !== expectedRevision) {
      throw new Error("community_member_workflow_enrollment_revision_conflict");
    }
    if (!(await enrollmentHasCurrentActiveMembership(ctx, enrollment))) {
      throw new Error("community_member_workflow_membership_inactive");
    }
    if (enrollment.status !== "active") {
      throw new Error("community_member_workflow_enrollment_not_movable");
    }
    const version = (await ctx.db.get(
      enrollment.workflowVersionId,
    )) as WorkflowVersionRow | null;
    const stages = (version?.stages ?? []) as CommunityMemberWorkflowStage[];
    const targetIndex = stages.findIndex(
      (stage) => stage.key === targetStageKey,
    );
    if (targetIndex < 0) {
      throw new Error("community_member_workflow_stage_not_found");
    }
    if (targetStageKey === enrollment.currentStageKey) {
      throw new Error("community_member_workflow_stage_unchanged");
    }
    await requireAcceptedEvidence({ ctx, enrollment, evidenceIds });
    const nowMs = Date.now();
    const nextRevision = enrollment.revision + 1;
    const nextSeq = enrollment.transitionSeq + 1;
    await ctx.db.patch(enrollment._id, {
      status: "active",
      currentStageKey: targetStageKey,
      currentStageEnteredAt: nowMs,
      transitionSeq: nextSeq,
      revision: nextRevision,
      completedAt: undefined,
      exitedAt: undefined,
      updatedAt: nowMs,
    });
    const transitionId = await insertTransition({
      ctx,
      enrollment,
      kind: "manual_move",
      fromStageKey: enrollment.currentStageKey,
      toStageKey: targetStageKey,
      evidenceIds,
      actorType: "builder",
      actorUserId: userId,
      reason,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      occurredAt: nowMs,
      seq: nextSeq,
    });
    return {
      transition_id: String(transitionId),
      enrollment_revision: nextRevision,
      replayed: false,
    };
  },
});

export const completeBuilderWorkflowEnrollment = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    enrollmentId: v.id("communityMemberWorkflowEnrollments"),
    expectedRevision: v.number(),
    reason: v.string(),
    evidenceIds: v.optional(v.array(v.id("communityMemberWorkflowEvidence"))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const enrollment = (await ctx.db.get(
      args.enrollmentId,
    )) as EnrollmentRow | null;
    if (
      !enrollment ||
      String(enrollment.communityId) !== String(args.communityId)
    ) {
      throw new Error("community_member_workflow_enrollment_not_found");
    }
    const reason = normalizeCommunityMemberWorkflowReason(args.reason);
    const idempotencyKey = normalizeCommunityMemberWorkflowIdempotencyKey(
      args.idempotencyKey,
    );
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const evidenceIds = args.evidenceIds ?? [];
    const fingerprint = buildCommunityMemberWorkflowTransitionFingerprint({
      enrollmentId: enrollment._id,
      expectedRevision,
      targetStageKey: enrollment.currentStageKey,
      kind: "completed",
      reason,
      evidenceIds,
    });
    const existing = (await ctx.db
      .query("communityMemberWorkflowTransitions" as any)
      .withIndex("by_enrollment_idempotency", (q: any) =>
        q
          .eq("enrollmentId", enrollment._id)
          .eq("idempotencyKey", idempotencyKey),
      )
      .first()) as TransitionRow | null;
    if (existing) {
      if (existing.idempotencyFingerprint !== fingerprint) {
        throw new Error("community_member_workflow_idempotency_conflict");
      }
      return {
        transition_id: String(existing._id),
        enrollment_revision: existing.seq,
        replayed: true,
      };
    }
    if (enrollment.revision !== expectedRevision) {
      throw new Error("community_member_workflow_enrollment_revision_conflict");
    }
    if (!(await enrollmentHasCurrentActiveMembership(ctx, enrollment))) {
      throw new Error("community_member_workflow_membership_inactive");
    }
    if (enrollment.status !== "active") {
      throw new Error("community_member_workflow_enrollment_not_completable");
    }
    await requireAcceptedEvidence({ ctx, enrollment, evidenceIds });
    const nowMs = Date.now();
    const nextRevision = enrollment.revision + 1;
    const nextSeq = enrollment.transitionSeq + 1;
    await ctx.db.patch(enrollment._id, {
      status: "completed",
      transitionSeq: nextSeq,
      revision: nextRevision,
      completedAt: nowMs,
      exitedAt: undefined,
      updatedAt: nowMs,
    });
    const transitionId = await insertTransition({
      ctx,
      enrollment,
      kind: "completed",
      fromStageKey: enrollment.currentStageKey,
      toStageKey: enrollment.currentStageKey,
      evidenceIds,
      actorType: "builder",
      actorUserId: userId,
      reason,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      occurredAt: nowMs,
      seq: nextSeq,
    });
    return {
      transition_id: String(transitionId),
      enrollment_revision: nextRevision,
      replayed: false,
    };
  },
});

export const setBuilderWorkflowEnrollmentStatus = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    enrollmentId: v.id("communityMemberWorkflowEnrollments"),
    expectedRevision: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("exited"),
    ),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const enrollment = (await ctx.db.get(
      args.enrollmentId,
    )) as EnrollmentRow | null;
    if (
      !enrollment ||
      String(enrollment.communityId) !== String(args.communityId)
    ) {
      throw new Error("community_member_workflow_enrollment_not_found");
    }
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const reason = normalizeCommunityMemberWorkflowReason(args.reason);
    const idempotencyKey = normalizeCommunityMemberWorkflowIdempotencyKey(
      args.idempotencyKey,
    );
    const kind =
      args.status === "paused"
        ? "paused"
        : args.status === "exited"
          ? "exited"
          : "resumed";
    const fingerprint = buildCommunityMemberWorkflowTransitionFingerprint({
      enrollmentId: enrollment._id,
      expectedRevision,
      kind,
      reason,
    });
    const existing = (await ctx.db
      .query("communityMemberWorkflowTransitions" as any)
      .withIndex("by_enrollment_idempotency", (q: any) =>
        q
          .eq("enrollmentId", enrollment._id)
          .eq("idempotencyKey", idempotencyKey),
      )
      .first()) as TransitionRow | null;
    if (existing) {
      if (existing.idempotencyFingerprint !== fingerprint) {
        throw new Error("community_member_workflow_idempotency_conflict");
      }
      return {
        transition_id: String(existing._id),
        enrollment_revision: existing.seq,
        replayed: true,
      };
    }
    if (enrollment.revision !== expectedRevision) {
      throw new Error("community_member_workflow_enrollment_revision_conflict");
    }
    if (
      args.status !== "exited" &&
      !(await enrollmentHasCurrentActiveMembership(ctx, enrollment))
    ) {
      throw new Error("community_member_workflow_membership_inactive");
    }
    if (enrollment.status === args.status) {
      throw new Error("community_member_workflow_enrollment_status_unchanged");
    }
    if (args.status === "active" && enrollment.status !== "paused") {
      throw new Error("community_member_workflow_enrollment_not_resumable");
    }
    if (enrollment.status === "exited") {
      throw new Error("community_member_workflow_enrollment_exited");
    }
    if (enrollment.status === "completed" && args.status !== "exited") {
      throw new Error("community_member_workflow_enrollment_completed");
    }
    const nowMs = Date.now();
    const nextRevision = enrollment.revision + 1;
    const nextSeq = enrollment.transitionSeq + 1;
    await ctx.db.patch(enrollment._id, {
      status: args.status,
      transitionSeq: nextSeq,
      revision: nextRevision,
      exitedAt: args.status === "exited" ? nowMs : undefined,
      updatedAt: nowMs,
    });
    const transitionId = await insertTransition({
      ctx,
      enrollment,
      kind,
      fromStageKey: enrollment.currentStageKey,
      toStageKey: enrollment.currentStageKey,
      actorType: "builder",
      actorUserId: userId,
      reason,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      occurredAt: nowMs,
      seq: nextSeq,
    });
    return {
      transition_id: String(transitionId),
      enrollment_revision: nextRevision,
      replayed: false,
    };
  },
});
