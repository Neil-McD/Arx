export const EXISTING_FOUNDER_INFERENCE_COHORT_KEY = "existing_founder_cutover_v1";
export const COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-5.6-luna";
export const COMMUNITY_OWNER_FUNDED_MODEL_LABEL = "GPT 5.6 Luna";

export const COMMUNITY_OWNER_INFERENCE_TERMS_KEY = "community_owner_inference_funding";
export const COMMUNITY_OWNER_INFERENCE_TERMS_VERSION = "community_owner_inference_funding_v1";

export const COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE = 6;
export const COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE = 60;

export type FounderInferenceGrantStatus = "approved" | "active" | "suspended";

export type CommunityInferenceFundingAdmission =
  | {
      ok: true;
      mode: "legacy_requester_chatgpt";
      transitional: true;
      payerUserId: null;
      grantId: null;
      modelId: null;
    }
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
      ok: false;
      code:
        | "community_not_found"
        | "founder_plan_required"
        | "owner_funding_suspended"
        | "owner_credential_missing"
        | "founder_subscription_inactive"
        | "founder_subscription_ambiguous"
        | "founder_subscription_owner_mismatch";
    };
