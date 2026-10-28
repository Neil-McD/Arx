import {
  founderSubscriptionKeepsCommunityRunning,
  parseCommunityBuilderAccessMode,
  type CommunityBuilderAccessMode,
  type FounderSubscriptionStatus,
} from "../shared/founderPlan";
import { normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import {
  getFounderSubscriptionByCommunity,
  type FounderSubscriptionRow,
} from "./founderPlanCore";
import { hasPlatformOwnerComplimentaryAccess } from "./operatorEntitlementsCore";

export type CommunityBuilderAccessSource =
  | "grandfathered"
  | "operator_comp"
  | "founder_subscription"
  | "none";

export type CommunityBuilderAccessReason =
  | "grandfathered"
  | "operator_comp"
  | "active_subscription"
  | "community_archived"
  | "subscription_missing"
  | "subscription_inactive"
  | "subscription_attachment_invalid"
  | "subscription_ambiguous"
  | "community_access_mode_invalid"
  | "community_identity_invalid";

export type CommunityBuilderAccessDecision = {
  accessMode: CommunityBuilderAccessMode | "invalid";
  lifecycleStatus: "active" | "archived";
  lifecycleGeneration: number;
  operational: boolean;
  source: CommunityBuilderAccessSource;
  reason: CommunityBuilderAccessReason;
  subscriptionId: any | null;
  subscriptionStatus: FounderSubscriptionStatus | null;
  currentPeriodEndAt: number | null;
};

type CommunityBuilderAccessLike = {
  _id: any;
  ownerId?: any;
  lifecycleStatus?: unknown;
  lifecycleGeneration?: unknown;
  builderAccessMode?: unknown;
};

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function deniedDecision(args: {
  community: CommunityBuilderAccessLike;
  accessMode: CommunityBuilderAccessMode | "invalid";
  reason: Extract<
    CommunityBuilderAccessReason,
    | "community_archived"
    | "subscription_missing"
    | "subscription_inactive"
    | "subscription_attachment_invalid"
    | "subscription_ambiguous"
    | "community_access_mode_invalid"
    | "community_identity_invalid"
  >;
  subscription?: FounderSubscriptionRow | null;
}): CommunityBuilderAccessDecision {
  const lifecycle = normalizeCommunityLifecycle(args.community);
  return {
    accessMode: args.accessMode,
    lifecycleStatus: lifecycle.status,
    lifecycleGeneration: lifecycle.generation,
    operational: false,
    source: "none",
    reason: args.reason,
    subscriptionId: args.subscription?._id ?? null,
    subscriptionStatus: args.subscription?.status ?? null,
    currentPeriodEndAt:
      typeof args.subscription?.currentPeriodEndAt === "number"
        ? args.subscription.currentPeriodEndAt
        : null,
  };
}

export async function resolveCommunityBuilderAccess(args: {
  ctx: any;
  community: CommunityBuilderAccessLike;
  nowMs?: number;
}): Promise<CommunityBuilderAccessDecision> {
  const nowMs = args.nowMs ?? Date.now();
  const lifecycle = normalizeCommunityLifecycle(args.community);
  const parsedAccessMode = parseCommunityBuilderAccessMode(
    args.community.builderAccessMode,
  );
  const accessMode = parsedAccessMode ?? "invalid";

  // Lifecycle is the outer authority boundary. Payment, grandfathering, and
  // operator status cannot make an archived community operational.
  if (lifecycle.status === "archived") {
    return deniedDecision({
      community: args.community,
      accessMode,
      reason: "community_archived",
    });
  }
  if (!parsedAccessMode) {
    return deniedDecision({
      community: args.community,
      accessMode: "invalid",
      reason: "community_access_mode_invalid",
    });
  }
  if (!normalizeId(args.community._id) || !normalizeId(args.community.ownerId)) {
    return deniedDecision({
      community: args.community,
      accessMode: parsedAccessMode,
      reason: "community_identity_invalid",
    });
  }

  if (parsedAccessMode === "grandfathered") {
    return {
      accessMode: parsedAccessMode,
      lifecycleStatus: lifecycle.status,
      lifecycleGeneration: lifecycle.generation,
      operational: true,
      source: "grandfathered",
      reason: "grandfathered",
      subscriptionId: null,
      subscriptionStatus: null,
      currentPeriodEndAt: null,
    };
  }

  let subscription: FounderSubscriptionRow | null;
  try {
    subscription = await getFounderSubscriptionByCommunity(
      args.ctx,
      args.community._id,
      nowMs,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "founder_subscription_ambiguous"
    ) {
      return deniedDecision({
        community: args.community,
        accessMode: parsedAccessMode,
        reason: "subscription_ambiguous",
      });
    }
    throw error;
  }

  if (!subscription) {
    if (
      await hasPlatformOwnerComplimentaryAccess(
        args.ctx,
        args.community.ownerId,
      )
    ) {
      return {
        accessMode: parsedAccessMode,
        lifecycleStatus: lifecycle.status,
        lifecycleGeneration: lifecycle.generation,
        operational: true,
        source: "operator_comp",
        reason: "operator_comp",
        subscriptionId: null,
        subscriptionStatus: null,
        currentPeriodEndAt: null,
      };
    }
    return deniedDecision({
      community: args.community,
      accessMode: parsedAccessMode,
      reason: "subscription_missing",
    });
  }
  if (
    normalizeId(subscription.communityId) !== normalizeId(args.community._id) ||
    normalizeId(subscription.ownerUserId) !==
      normalizeId(args.community.ownerId) ||
    subscription.provider !== "stripe" ||
    !(typeof subscription.attachedAt === "number" && subscription.attachedAt > 0)
  ) {
    return deniedDecision({
      community: args.community,
      accessMode: parsedAccessMode,
      reason: "subscription_attachment_invalid",
      subscription,
    });
  }

  if (
    !founderSubscriptionKeepsCommunityRunning({
      status: subscription.status,
      currentPeriodEndAt: subscription.currentPeriodEndAt,
      nowMs,
    })
  ) {
    return deniedDecision({
      community: args.community,
      accessMode: parsedAccessMode,
      reason: "subscription_inactive",
      subscription,
    });
  }

  return {
    accessMode: parsedAccessMode,
    lifecycleStatus: lifecycle.status,
    lifecycleGeneration: lifecycle.generation,
    operational: true,
    source: "founder_subscription",
    reason: "active_subscription",
    subscriptionId: subscription._id,
    subscriptionStatus: subscription.status,
    currentPeriodEndAt: subscription.currentPeriodEndAt,
  };
}

export async function requireCommunityBuilderAccess(args: {
  ctx: any;
  community: CommunityBuilderAccessLike;
  nowMs?: number;
}): Promise<CommunityBuilderAccessDecision> {
  const decision = await resolveCommunityBuilderAccess(args);
  if (!decision.operational) {
    throw new Error(
      decision.reason === "community_archived"
        ? "community_archived"
        : "community_temporarily_unavailable",
    );
  }
  return decision;
}
