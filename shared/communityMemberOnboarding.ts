export const COMMUNITY_MEMBER_ONBOARDING_PRIMARY_ACTIONS = [
  "introduce",
  "ask_agent",
  "view_resources",
  "start_workflow",
] as const;

export type CommunityMemberOnboardingPrimaryAction =
  (typeof COMMUNITY_MEMBER_ONBOARDING_PRIMARY_ACTIONS)[number];

export type CommunityMemberOnboardingConfig = {
  enabled: boolean;
  title: string;
  description: string;
  video_url: string | null;
  primary_action: CommunityMemberOnboardingPrimaryAction;
  ai_guide_prompt: string;
};

export type CommunityMemberOnboardingConfigInput = Partial<
  CommunityMemberOnboardingConfig & {
    videoUrl: string | null;
    primaryAction: CommunityMemberOnboardingPrimaryAction;
    aiGuidePrompt: string;
  }
> | null | undefined;

const DEFAULT_DESCRIPTION =
  "Watch the welcome, understand how this community works, and take your first action.";
const DEFAULT_AI_GUIDE_PROMPT =
  "Help new members understand what this community is for, what they can do first, and ask one question to learn what they need.";

function normalizeBoundedText(raw: unknown, fallback: string, maxLength: number): string {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, maxLength);
}

function normalizeOptionalUrl(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const bounded = text.slice(0, 2_000);
  let parsed: URL;
  try {
    parsed = new URL(bounded);
  } catch {
    throw new Error("community_member_onboarding_url_invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("community_member_onboarding_url_invalid");
  }
  return parsed.toString();
}

function normalizePrimaryAction(raw: unknown): CommunityMemberOnboardingPrimaryAction {
  const value = String(raw ?? "").trim();
  return COMMUNITY_MEMBER_ONBOARDING_PRIMARY_ACTIONS.includes(
    value as CommunityMemberOnboardingPrimaryAction,
  )
    ? (value as CommunityMemberOnboardingPrimaryAction)
    : "ask_agent";
}

export function buildDefaultCommunityMemberOnboardingConfig(
  communityName?: string | null,
): CommunityMemberOnboardingConfig {
  const name = String(communityName ?? "").trim() || "this community";
  return {
    enabled: false,
    title: `Welcome to ${name}`,
    description: DEFAULT_DESCRIPTION,
    video_url: null,
    primary_action: "ask_agent",
    ai_guide_prompt: DEFAULT_AI_GUIDE_PROMPT,
  };
}

export function normalizeCommunityMemberOnboardingConfig(
  input: CommunityMemberOnboardingConfigInput,
  communityName?: string | null,
): CommunityMemberOnboardingConfig {
  const defaults = buildDefaultCommunityMemberOnboardingConfig(communityName);
  const source = input ?? {};
  return {
    enabled: Boolean(source.enabled),
    title: normalizeBoundedText(source.title, defaults.title, 120),
    description: normalizeBoundedText(source.description, defaults.description, 400),
    video_url: normalizeOptionalUrl(source.video_url ?? source.videoUrl ?? null),
    primary_action: normalizePrimaryAction(source.primary_action ?? source.primaryAction),
    ai_guide_prompt: normalizeBoundedText(
      source.ai_guide_prompt ?? source.aiGuidePrompt,
      defaults.ai_guide_prompt,
      1_000,
    ),
  };
}
