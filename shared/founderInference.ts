export const COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-6-luna";
export const COMMUNITY_OWNER_FUNDED_MODEL_SUPPORTS_IMAGE_INPUT = true;

export const COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE = 6;
export const COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE = 60;

export const COMMUNITY_FUNDING_POLICY_MANAGED = "managed_required" as const;

// Free members of the platform-home community get a small monthly agent
// allowance; the owner is exempt. Only member-initiated surfaces count.
export const PLATFORM_HOME_MEMBER_MONTHLY_AGENT_TURNS = 25;
export const PLATFORM_HOME_MEMBER_LIMITED_SURFACES = [
  "member_agent_dock",
  "community_agent_mention",
] as const;
export const PLATFORM_HOME_MEMBER_AGENT_LIMIT_REACHED =
  "platform_home_member_agent_limit_reached";
// Client-facing code carried on the runtime turn error.
export const COMMUNITY_MEMBER_AGENT_LIMIT_REACHED_CODE =
  "community_member_agent_limit_reached";

// One member-facing explanation for every surface that hits the allowance.
export function formatPlatformHomeMemberLimitMessage(nowMs: number): string {
  const resetsOn = new Date(utcMonthWindow(nowMs).endAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    `You've used your ${PLATFORM_HOME_MEMBER_MONTHLY_AGENT_TURNS} free agent messages in Polynet this month. ` +
    `They reset on ${resetsOn}. Want an agent that works for you and your clients all month? Build your own community.`
  );
}

export function utcMonthWindow(nowMs: number): { startAt: number; endAt: number; key: string } {
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    startAt: Date.UTC(year, month, 1),
    endAt: Date.UTC(year, month + 1, 1),
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

export const COMMUNITY_INFERENCE_SURFACES = [
  "member_agent_dock",
  "community_funnel_builder",
  "community_agent_mention",
  "community_autonomous_cognition",
  "community_workflow_action",
  "community_setup_generation",
  "community_founder_brief",
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

// One provider response, not the sum of an agent's tool loop.
export type FounderProviderRequestUsage = {
  requestId: string;
  modelId: string;
  serviceTier: string;
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
};
