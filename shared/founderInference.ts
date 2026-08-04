export const EXISTING_FOUNDER_INFERENCE_COHORT_KEY = "existing_founder_cutover_v1";
export const COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-5.6-luna";
export const COMMUNITY_OWNER_FUNDED_MODEL_LABEL = "GPT 5.6 Luna";

export const COMMUNITY_OWNER_INFERENCE_TERMS_KEY = "community_owner_inference_funding";
export const COMMUNITY_OWNER_INFERENCE_TERMS_VERSION = "community_owner_inference_funding_v2";

export const COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE = 6;
export const COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE = 60;

export const COMMUNITY_FUNDING_POLICY_LEGACY_BYOK = "legacy_byok_allowed" as const;
export const COMMUNITY_FUNDING_POLICY_MANAGED = "managed_required" as const;

export const COMMUNITY_INFERENCE_SURFACES = [
  "community_agent_mention",
  "community_autonomous_cognition",
  "community_setup_generation",
] as const;

export type CommunityInferenceSurface = (typeof COMMUNITY_INFERENCE_SURFACES)[number];

export type CommunityInferenceFundingPolicy =
  | typeof COMMUNITY_FUNDING_POLICY_LEGACY_BYOK
  | typeof COMMUNITY_FUNDING_POLICY_MANAGED;

export type FounderInferenceGrantStatus = "approved" | "active" | "suspended";

export type CommunityInferenceFundingAdmission =
  | {
      ok: true;
      mode: "owner_api_key";
      transitional: false;
      payerUserId: unknown;
      grantId: unknown;
      modelId: typeof COMMUNITY_OWNER_FUNDED_MODEL_ID;
    }
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
        | "community_archived"
        | "founder_plan_required"
        | "owner_funding_choice_required"
        | "owner_funding_suspended"
        | "owner_credential_missing"
        | "founder_subscription_inactive"
        | "founder_subscription_ambiguous"
        | "founder_subscription_owner_mismatch";
    };
