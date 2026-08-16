import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  normalizeIdValue,
  type CommunityMembershipLike,
} from "./communityCore";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import { createCommunityAgentCanonicalInteractionCore } from "./communityInteractions";
import {
  communityIsActive,
  normalizeCommunityLifecycle,
} from "../shared/communityLifecycle";
import {
  buildCommunityMemberWelcomeText,
  COMMUNITY_MEMBER_WELCOME_DELAY_MS,
  COMMUNITY_MEMBER_WELCOME_MAX_MENTIONS,
  communityMemberWelcomeIdempotencyKey,
} from "../shared/communityMemberWelcome";

const internalRefs = internal as any;
const CANDIDATE_LIMIT = COMMUNITY_MEMBER_WELCOME_MAX_MENTIONS * 2 + 2;

type WelcomeBatchRow = {
  _id: any;
  communityId: any;
  lifecycleGeneration: number;
  windowStartAt: number;
  dueAt: number;
  status: "scheduled" | "published" | "skipped";
  publishedRootId?: any;
};

export async function registerCommunityMemberWelcomeActivationCore(
  ctx: any,
  args: { membershipId: any; activationSequence: number },
) {
  const membership = (await ctx.db.get(
    args.membershipId,
  )) as CommunityMembershipLike | null;
  if (
    !communityMembershipRowIsActive(membership) ||
    Math.floor(Number(membership?.activationSequence ?? 0)) !==
      args.activationSequence ||
    typeof membership?.activatedAt !== "number"
  ) {
    return { scheduled: false, code: "membership_activation_inactive" };
  }
  const community = (await ctx.db.get(membership.communityId)) as Record<
    string,
    any
  > | null;
  if (!community || !communityIsActive(community)) {
    return { scheduled: false, code: "community_inactive" };
  }
  if (
    normalizeIdValue(community.ownerId) === normalizeIdValue(membership.userId)
  ) {
    return { scheduled: false, code: "community_owner_excluded" };
  }
  if (community.conciergeWelcomesEnabled === false) {
    return { scheduled: false, code: "concierge_welcomes_disabled" };
  }

  const activatedAt = Math.floor(membership.activatedAt);
  const existing = (await ctx.db
    .query("communityMemberWelcomeBatches")
    .withIndex("by_community_status_dueAt", (q: any) =>
      q
        .eq("communityId", membership.communityId)
        .eq("status", "scheduled")
        .gt("dueAt", activatedAt),
    )
    .order("asc")
    .first()) as WelcomeBatchRow | null;
  if (existing && existing.windowStartAt <= activatedAt) {
    return {
      scheduled: true,
      deduped: true,
      batchId: normalizeIdValue(existing._id),
      dueAt: existing.dueAt,
    };
  }

  const lifecycle = normalizeCommunityLifecycle(community);
  const dueAt = activatedAt + COMMUNITY_MEMBER_WELCOME_DELAY_MS;
  const nowMs = Date.now();
  const batchId = await ctx.db.insert("communityMemberWelcomeBatches", {
    communityId: membership.communityId,
    lifecycleGeneration: lifecycle.generation,
    windowStartAt: activatedAt,
    dueAt,
    status: "scheduled",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  try {
    await ctx.scheduler.runAt(
      dueAt,
      internalRefs.communityMemberWelcome
        .publishCommunityMemberWelcomeBatchInternal,
      { batchId },
    );
  } catch (error) {
    await ctx.db.delete(batchId);
    console.warn("community_member_welcome_publish_schedule_failed", error);
    return {
      scheduled: false,
      code: "community_member_welcome_publish_schedule_failed",
    };
  }
  return {
    scheduled: true,
    deduped: false,
    batchId: normalizeIdValue(batchId),
    dueAt,
  };
}

async function readCommunityMemberWelcomeBatchPlan(
  ctx: any,
  args: { batchId: any },
) {
  const batch = (await ctx.db.get(args.batchId)) as WelcomeBatchRow | null;
  if (!batch || batch.status !== "scheduled") return { kind: "noop" as const };
  if (Date.now() < batch.dueAt) return { kind: "not_due" as const };
  const community = (await ctx.db.get(batch.communityId)) as Record<
    string,
    any
  > | null;
  if (!community || !communityIsActive(community)) {
    return { kind: "skip" as const, reason: "community_inactive" };
  }
  if (
    normalizeCommunityLifecycle(community).generation !==
    batch.lifecycleGeneration
  ) {
    return { kind: "skip" as const, reason: "community_lifecycle_changed" };
  }
  if (community.conciergeWelcomesEnabled === false) {
    return { kind: "skip" as const, reason: "concierge_welcomes_disabled" };
  }
  const funding = await resolveCommunityInferenceFundingAdmission(
    ctx,
    batch.communityId,
  );
  if (!funding.ok) {
    return { kind: "skip" as const, reason: "community_ai_unfunded" };
  }

  const memberships = (await ctx.db
    .query("communityMemberships")
    .withIndex("by_community_active_activatedAt", (q: any) =>
      q
        .eq("communityId", batch.communityId)
        .eq("active", true)
        .gte("activatedAt", batch.windowStartAt)
        .lt("activatedAt", batch.dueAt),
    )
    .order("asc")
    .take(CANDIDATE_LIMIT)) as CommunityMembershipLike[];
  const members: Array<{ userId: string; handle: string }> = [];
  let hasOverflow = memberships.length >= CANDIDATE_LIMIT;
  for (const membership of memberships) {
    if (!communityMembershipRowIsActive(membership)) continue;
    if (
      normalizeIdValue(membership.userId) ===
      normalizeIdValue(community.ownerId)
    )
      continue;
    const identity = await readCanonicalUserIdentityProjection(
      ctx,
      membership.userId,
    );
    const handle = String(identity?.handle ?? "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    if (!handle) continue;
    if (members.length >= COMMUNITY_MEMBER_WELCOME_MAX_MENTIONS) {
      hasOverflow = true;
      break;
    }
    members.push({ userId: normalizeIdValue(membership.userId), handle });
  }
  if (members.length === 0) {
    return { kind: "skip" as const, reason: "no_eligible_members" };
  }
  return {
    kind: "publish" as const,
    ownerUserId: community.ownerId,
    communityId: batch.communityId,
    idempotencyKey: communityMemberWelcomeIdempotencyKey(batch._id),
    text: buildCommunityMemberWelcomeText({
      communityName: community.name,
      memberHandles: members.map((member) => member.handle),
      hasOverflow,
    }),
    mentions: members.map((member) => ({ userId: member.userId })),
  };
}

export const publishCommunityMemberWelcomeBatchInternal = internalMutation({
  args: { batchId: v.id("communityMemberWelcomeBatches") },
  handler: async (ctx, args) => {
    const plan = await readCommunityMemberWelcomeBatchPlan(ctx, args);
    if (plan.kind === "noop")
      return { published: false, code: "batch_not_scheduled" };
    if (plan.kind === "not_due")
      return { published: false, code: "batch_not_due" };
    if (plan.kind === "skip") {
      await ctx.db.patch(args.batchId, {
        status: "skipped",
        skipReason: plan.reason.slice(0, 120),
        updatedAt: Date.now(),
      });
      return { published: false, code: plan.reason };
    }
    const result = await createCommunityAgentCanonicalInteractionCore(ctx, {
      userId: plan.ownerUserId,
      communityId: plan.communityId,
      idempotencyKey: plan.idempotencyKey,
      text: plan.text,
      mentions: plan.mentions,
      memberWelcomeBatchId: args.batchId,
    });
    await ctx.db.patch(args.batchId, {
      status: "published",
      publishedRootId: result.interaction.root_id as any,
      updatedAt: Date.now(),
    });
    return {
      published: true,
      deduped: result.interaction.deduped,
      rootId: result.interaction.root_id,
    };
  },
});
