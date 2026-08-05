import {
  COMMUNITY_FUNDING_POLICY_LEGACY_BYOK,
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  EXISTING_FOUNDER_INFERENCE_COHORT_KEY,
  type CommunityInferenceFundingAdmission,
  type CommunityInferenceFundingPolicy,
} from "../shared/founderInference";
import { founderSubscriptionStatusGrantsAccess } from "../shared/founderPlan";
import { normalizeCommunityLifecycleGeneration } from "./communityLifecycleCore";
import {
  getFounderSubscriptionByCommunity,
  getPendingFounderSubscriptionCheckoutForGeneration,
  type FounderSubscriptionRow,
  type PendingFounderSubscriptionCheckoutRow,
} from "./founderPlanCore";
import { hasPlatformOwnerComplimentaryAccess } from "./operatorEntitlementsCore";

export type FounderInferenceGrantRow = {
  _id: any;
  userId: any;
  cohortKey: string;
  status: "approved" | "active" | "suspended";
  activationAcceptanceId?: any;
  approvedAt: number;
  activatedAt?: number;
  suspendedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type CommunityOwnerFundingRow = {
  _id: any;
  ownerId?: any;
  inferenceFundingPolicy: CommunityInferenceFundingPolicy;
  lifecycleGeneration?: number;
};

export type CommunityOwnerFundingFacts = {
  ownerUserId: any;
  fundingPolicy: CommunityInferenceFundingPolicy;
  operatorComplimentaryAccess: boolean;
  subscription: FounderSubscriptionRow | null;
  subscriptionAmbiguous: boolean;
  pendingCheckout: PendingFounderSubscriptionCheckoutRow | null;
  legacyGrant: FounderInferenceGrantRow | null;
  legacyApiKeyConnected: boolean;
};

export type CommunityImmediateRestoreFundingAuthority =
  | {
      ok: true;
      mode: "platform_operator_grant" | "owner_api_key";
    }
  | {
      ok: false;
      code:
        | "community_restore_checkout_pending"
        | "community_restore_founder_subscription_conflict"
        | "founder_subscription_ambiguous"
        | "founder_plan_required"
        | "owner_funding_choice_required"
        | "owner_funding_suspended"
        | "owner_credential_missing";
    };

export async function getExistingFounderInferenceGrant(
  ctx: any,
  userId: any,
): Promise<FounderInferenceGrantRow | null> {
  return (await ctx.db
    .query("founderInferenceGrants" as any)
    .withIndex("by_user_cohort", (q: any) =>
      q.eq("userId", userId).eq("cohortKey", EXISTING_FOUNDER_INFERENCE_COHORT_KEY),
    )
    .first()) as FounderInferenceGrantRow | null;
}

async function ownerHasUsableOpenAiKey(
  ctx: any,
  ownerUserId: any,
): Promise<boolean> {
  const row = (await ctx.db
    .query("userProviderConnections" as any)
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", ownerUserId).eq("provider", "openai"),
    )
    .first()) as Record<string, unknown> | null;
  return Boolean(String(row?.encryptedSecretHex ?? "").trim());
}

export async function readCommunityOwnerFundingFacts(args: {
  ctx: any;
  community: CommunityOwnerFundingRow;
  nowMs: number;
  purpose: "inference" | "immediate_restore";
}): Promise<CommunityOwnerFundingFacts | null> {
  if (!args.community.ownerId) return null;
  const lifecycleGeneration = normalizeCommunityLifecycleGeneration(
    args.community.lifecycleGeneration,
  );
  const readSubscription = () => getFounderSubscriptionByCommunity(
    args.ctx,
    args.community._id,
    args.nowMs,
  ).then(
    (subscription) => ({ subscription, ambiguous: false }),
    (error) => {
      if (
        error instanceof Error &&
        error.message === "founder_subscription_ambiguous"
      ) {
        return { subscription: null, ambiguous: true };
      }
      throw error;
    },
  );
  const emptyFacts = (): CommunityOwnerFundingFacts => ({
    ownerUserId: args.community.ownerId,
    fundingPolicy: args.community.inferenceFundingPolicy,
    operatorComplimentaryAccess: false,
    subscription: null,
    subscriptionAmbiguous: false,
    pendingCheckout: null,
    legacyGrant: null,
    legacyApiKeyConnected: false,
  });

  if (args.purpose === "immediate_restore") {
    const [subscription, pendingCheckout] = await Promise.all([
      readSubscription(),
      getPendingFounderSubscriptionCheckoutForGeneration({
        ctx: args.ctx,
        communityId: args.community._id,
        lifecycleGeneration,
        nowMs: args.nowMs,
      }),
    ]);
    if (subscription.ambiguous || subscription.subscription || pendingCheckout) {
      return {
        ...emptyFacts(),
        subscription: subscription.subscription,
        subscriptionAmbiguous: subscription.ambiguous,
        pendingCheckout,
      };
    }
  }

  const operatorComplimentaryAccess =
    await hasPlatformOwnerComplimentaryAccess(
      args.ctx,
      args.community.ownerId,
    );
  if (operatorComplimentaryAccess) {
    return { ...emptyFacts(), operatorComplimentaryAccess: true };
  }

  let subscription = { subscription: null as FounderSubscriptionRow | null, ambiguous: false };
  if (args.purpose === "inference") {
    subscription = await readSubscription();
    if (subscription.ambiguous || subscription.subscription) {
      return {
        ...emptyFacts(),
        subscription: subscription.subscription,
        subscriptionAmbiguous: subscription.ambiguous,
      };
    }
  }

  if (args.community.inferenceFundingPolicy !== COMMUNITY_FUNDING_POLICY_LEGACY_BYOK) {
    return emptyFacts();
  }
  const legacyGrant = await getExistingFounderInferenceGrant(
    args.ctx,
    args.community.ownerId,
  );
  if (!legacyGrant || legacyGrant.status !== "active") {
    return { ...emptyFacts(), legacyGrant };
  }
  const legacyApiKeyConnected = await ownerHasUsableOpenAiKey(
    args.ctx,
    args.community.ownerId,
  );
  return {
    ...emptyFacts(),
    legacyGrant,
    legacyApiKeyConnected,
  };
}

export function resolveCommunityInferenceFundingAuthorityFromFacts(
  facts: CommunityOwnerFundingFacts | null,
  nowMs: number,
): CommunityInferenceFundingAdmission {
  if (!facts) return { ok: false, code: "community_not_found" };
  if (facts.operatorComplimentaryAccess) {
    return {
      ok: true,
      mode: "platform_operator_grant",
      transitional: false,
      payerUserId: facts.ownerUserId,
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
    };
  }
  if (facts.subscriptionAmbiguous) {
    return { ok: false, code: "founder_subscription_ambiguous" };
  }
  if (facts.subscription) {
    if (!founderSubscriptionStatusGrantsAccess({
      status: facts.subscription.status,
      currentPeriodEndAt: facts.subscription.currentPeriodEndAt,
      nowMs,
    })) {
      return { ok: false, code: "founder_subscription_inactive" };
    }
    if (String(facts.subscription.ownerUserId) !== String(facts.ownerUserId)) {
      return { ok: false, code: "founder_subscription_owner_mismatch" };
    }
    return {
      ok: true,
      mode: "platform_subscription",
      transitional: false,
      payerUserId: facts.ownerUserId,
      subscriptionId: facts.subscription._id,
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
    };
  }
  if (facts.fundingPolicy !== COMMUNITY_FUNDING_POLICY_LEGACY_BYOK) {
    return { ok: false, code: "founder_plan_required" };
  }
  if (!facts.legacyGrant) return { ok: false, code: "founder_plan_required" };
  if (facts.legacyGrant.status === "approved") {
    return { ok: false, code: "owner_funding_choice_required" };
  }
  if (facts.legacyGrant.status === "suspended") {
    return { ok: false, code: "owner_funding_suspended" };
  }
  if (!facts.legacyApiKeyConnected) {
    return { ok: false, code: "owner_credential_missing" };
  }
  return {
    ok: true,
    mode: "owner_api_key",
    transitional: false,
    payerUserId: facts.ownerUserId,
    grantId: facts.legacyGrant._id,
    modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
  };
}

export function resolveCommunityImmediateRestoreFundingAuthority(
  facts: CommunityOwnerFundingFacts | null,
): CommunityImmediateRestoreFundingAuthority {
  if (!facts) return { ok: false, code: "founder_plan_required" };
  if (facts.subscriptionAmbiguous) {
    return { ok: false, code: "founder_subscription_ambiguous" };
  }
  if (facts.pendingCheckout) {
    return { ok: false, code: "community_restore_checkout_pending" };
  }
  if (facts.subscription) {
    return {
      ok: false,
      code: "community_restore_founder_subscription_conflict",
    };
  }
  if (facts.operatorComplimentaryAccess) {
    return { ok: true, mode: "platform_operator_grant" };
  }
  if (facts.fundingPolicy !== COMMUNITY_FUNDING_POLICY_LEGACY_BYOK) {
    return { ok: false, code: "founder_plan_required" };
  }
  if (!facts.legacyGrant) return { ok: false, code: "founder_plan_required" };
  if (facts.legacyGrant.status === "approved") {
    return { ok: false, code: "owner_funding_choice_required" };
  }
  if (facts.legacyGrant.status === "suspended") {
    return { ok: false, code: "owner_funding_suspended" };
  }
  if (!facts.legacyApiKeyConnected) {
    return { ok: false, code: "owner_credential_missing" };
  }
  return { ok: true, mode: "owner_api_key" };
}
