export const COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-5.6-luna";
export const COMMUNITY_OWNER_FUNDED_MODEL_LABEL = "GPT 5.6 Luna";
export const COMMUNITY_OWNER_FUNDED_MODEL_SUPPORTS_IMAGE_INPUT = true;

export const COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE = 6;
export const COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE = 60;

export const COMMUNITY_FUNDING_POLICY_MANAGED = "managed_required" as const;

export const COMMUNITY_INFERENCE_SURFACES = [
  "member_agent_dock",
  "community_agent_mention",
  "community_autonomous_cognition",
] as const;

export type CommunityInferenceSurface = (typeof COMMUNITY_INFERENCE_SURFACES)[number];

export type CommunityInferenceFundingAdmission =
  | {
      ok: true;
      mode: "platform_subscription";
      transitional: false;
      payerUserId: unknown;
      subscriptionId: unknown;
      modelId: typeof COMMUNITY_OWNER_FUNDED_MODEL_ID;
    }
  | {
      ok: true;
      mode: "platform_operator_grant";
      transitional: false;
      payerUserId: unknown;
      modelId: typeof COMMUNITY_OWNER_FUNDED_MODEL_ID;
    }
  | {
      ok: false;
      code:
        | "community_not_found"
        | "founder_plan_required"
        | "founder_subscription_inactive"
        | "founder_subscription_ambiguous"
        | "founder_subscription_owner_mismatch";
    };
