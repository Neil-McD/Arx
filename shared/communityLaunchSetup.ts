import {
  getCommunityPublishReadinessMissingFields,
  type CommunityPublishReadinessMissing,
} from "./communityPublishReadiness.ts";

export type CommunityLaunchSetupStep =
  | "profile"
  | "about"
  | "agent"
  | "access"
  | "knowledge"
  | "publish";

export type CommunityLaunchSetupCurrentStep = CommunityLaunchSetupStep | "complete";

export type CommunityLaunchSetupMissing =
  | CommunityPublishReadinessMissing
  | "community_about"
  | "community_knowledge_material"
  | "community_knowledge_live"
  | "community_agent"
  | "community_access"
  | "community_publish";

export type CommunityLaunchSetupStepStatus = {
  step: CommunityLaunchSetupStep;
  completed: boolean;
  completed_items: number;
  total_items: number;
  missing: CommunityLaunchSetupMissing[];
};

export type CommunityLaunchSetupStatus = {
  current_step: CommunityLaunchSetupCurrentStep;
  completed: boolean;
  completed_items: number;
  total_items: number;
  percent: number;
  missing: CommunityLaunchSetupMissing[];
  steps: CommunityLaunchSetupStepStatus[];
};

export type CommunityLaunchSetupStatusInput = {
  name?: string | null;
  oneLiner?: string | null;
  avatarUrl?: string | null;
  avatarStorageId?: unknown;
  bannerUrl?: string | null;
  bannerStorageId?: unknown;
  about?: string | null;
  hasKnowledgeMaterial?: boolean | null;
  hasLiveKnowledge?: boolean | null;
  hasAgentConfig?: boolean | null;
  entryPolicy?: string | null;
  hasPaidAccessConfig?: boolean | null;
  visibility?: string | null;
};

export const COMMUNITY_LAUNCH_SETUP_STEPS: CommunityLaunchSetupStep[] = [
  "profile",
  "about",
  "agent",
  "access",
  "knowledge",
  "publish",
];

const COMMUNITY_PROFILE_TOTAL_ITEMS = 4;

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function isKnownEntryPolicy(value: unknown): boolean {
  const normalized = String(value ?? "").trim();
  return (
    normalized === "open" ||
    normalized === "approval" ||
    normalized === "paid_subscription"
  );
}

function isAccessConfigured(input: Pick<CommunityLaunchSetupStatusInput, "entryPolicy" | "hasPaidAccessConfig">): boolean {
  const normalized = String(input.entryPolicy ?? "").trim();
  if (normalized === "open" || normalized === "approval") return true;
  if (normalized === "paid_subscription") return Boolean(input.hasPaidAccessConfig);
  return false;
}

function buildStepStatus(
  step: CommunityLaunchSetupStep,
  missing: CommunityLaunchSetupMissing[],
  totalItems: number,
): CommunityLaunchSetupStepStatus {
  const normalizedTotal = Math.max(totalItems, missing.length);
  return {
    step,
    completed: missing.length === 0,
    completed_items: normalizedTotal - missing.length,
    total_items: normalizedTotal,
    missing,
  };
}

export function buildCommunityLaunchSetupStatus(
  input: CommunityLaunchSetupStatusInput,
): CommunityLaunchSetupStatus {
  const profileMissing = getCommunityPublishReadinessMissingFields({
    name: input.name,
    oneLiner: input.oneLiner,
    avatarUrl: input.avatarUrl,
    avatarStorageId: input.avatarStorageId,
    bannerUrl: input.bannerUrl,
    bannerStorageId: input.bannerStorageId,
  });
  const aboutMissing: CommunityLaunchSetupMissing[] = hasText(input.about)
    ? []
    : ["community_about"];
  const knowledgeMissing: CommunityLaunchSetupMissing[] = [
    ...(input.hasKnowledgeMaterial ? [] : ["community_knowledge_material" as const]),
    ...(input.hasLiveKnowledge ? [] : ["community_knowledge_live" as const]),
  ];
  const agentMissing: CommunityLaunchSetupMissing[] = input.hasAgentConfig
    ? []
    : ["community_agent"];
  const accessMissing: CommunityLaunchSetupMissing[] = isKnownEntryPolicy(input.entryPolicy) &&
    isAccessConfigured(input)
    ? []
    : ["community_access"];
  const publishMissing: CommunityLaunchSetupMissing[] =
    String(input.visibility ?? "").trim() === "published"
      ? []
      : ["community_publish"];

  const steps = [
    buildStepStatus("profile", profileMissing, COMMUNITY_PROFILE_TOTAL_ITEMS),
    buildStepStatus("about", aboutMissing, 1),
    buildStepStatus("agent", agentMissing, 1),
    buildStepStatus("access", accessMissing, 1),
    buildStepStatus("knowledge", knowledgeMissing, 2),
    buildStepStatus("publish", publishMissing, 1),
  ];
  const missing = steps.flatMap((step) => step.missing);
  const totalItems = steps.reduce((sum, step) => sum + step.total_items, 0);
  const completedItems = steps.reduce(
    (sum, step) => sum + step.completed_items,
    0,
  );
  const firstIncomplete = steps.find((step) => !step.completed)?.step ?? "complete";

  return {
    current_step: firstIncomplete,
    completed: missing.length === 0,
    completed_items: completedItems,
    total_items: totalItems,
    percent: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100,
    missing,
    steps,
  };
}
