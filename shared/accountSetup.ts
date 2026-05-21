import { validateProfileHandle } from "./profileHandle.ts";

export type AccountSetupStep = "identity" | "inference" | "agent" | "direction" | "complete";

export type AccountSetupMissing =
  | "display_name"
  | "handle"
  | "avatar"
  | "platform_legal"
  | "inference_provider"
  | "agent_name";

export const ACCOUNT_SETUP_STEPS: AccountSetupStep[] = ["identity", "inference", "agent", "direction", "complete"];

export const ACCOUNT_SETUP_MISSING_FIELDS: AccountSetupMissing[] = [
  "display_name",
  "handle",
  "avatar",
  "platform_legal",
  "inference_provider",
  "agent_name",
];

export type AccountSetupStepStatus = {
  step: Exclude<AccountSetupStep, "complete">;
  completed: boolean;
  completed_items: number;
  total_items: number;
  missing: AccountSetupMissing[];
};

export type AccountSetupStatus = {
  current_step: AccountSetupStep;
  completed: boolean;
  completed_items: number;
  total_items: number;
  percent: number;
  missing: AccountSetupMissing[];
  steps: AccountSetupStepStatus[];
};

export type AccountSetupStatusInput = {
  displayName?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  avatarStorageId?: string | null;
  hasAcceptedPlatformLegal?: boolean | null;
  bio?: string | null;
  hasInferenceProvider?: boolean | null;
  agentName?: string | null;
  agentSoul?: string | null;
  onboardingDirection?: string | null;
};

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

export function getAccountSetupIdentityMissingFields(
  input: Pick<AccountSetupStatusInput, "displayName" | "handle" | "avatarUrl" | "avatarStorageId" | "hasAcceptedPlatformLegal">,
): AccountSetupMissing[] {
  const missing: AccountSetupMissing[] = [];
  if (!hasText(input.displayName)) missing.push("display_name");
  if (!validateProfileHandle(input.handle).ok) missing.push("handle");
  if (!hasText(input.avatarUrl) && !hasText(input.avatarStorageId)) missing.push("avatar");
  if (input.hasAcceptedPlatformLegal !== true) missing.push("platform_legal");
  return missing;
}

export function isAccountSetupIdentityComplete(
  input: Pick<AccountSetupStatusInput, "displayName" | "handle" | "avatarUrl" | "avatarStorageId" | "hasAcceptedPlatformLegal">,
): boolean {
  return getAccountSetupIdentityMissingFields(input).length === 0;
}

export function isAccountSetupStatusIdentityComplete(status: AccountSetupStatus | null | undefined): boolean {
  return Boolean(status?.steps.find((step) => step.step === "identity")?.completed);
}

function buildStepStatus(
  step: AccountSetupStepStatus["step"],
  missing: AccountSetupMissing[],
  totalItems: number,
): AccountSetupStepStatus {
  return {
    step,
    completed: missing.length === 0,
    completed_items: totalItems - missing.length,
    total_items: totalItems,
    missing,
  };
}

export function buildAccountSetupStatus(input: AccountSetupStatusInput): AccountSetupStatus {
  const identityMissing = getAccountSetupIdentityMissingFields(input);

  const inferenceMissing: AccountSetupMissing[] = input.hasInferenceProvider
    ? []
    : ["inference_provider"];

  const agentMissing: AccountSetupMissing[] = [];
  if (!hasText(input.agentName)) agentMissing.push("agent_name");

  const steps = [
    buildStepStatus("identity", identityMissing, 4),
    buildStepStatus("inference", inferenceMissing, 1),
    buildStepStatus("agent", agentMissing, 1),
    buildStepStatus("direction", [], 0),
  ];
  const missing = steps.flatMap((step) => step.missing);
  const totalItems = steps.reduce((sum, step) => sum + step.total_items, 0);
  const completedItems = totalItems - missing.length;
  const firstIncomplete = steps.find((step) => !step.completed)?.step ?? "complete";

  return {
    current_step: firstIncomplete,
    completed: missing.length === 0,
    completed_items: completedItems,
    total_items: totalItems,
    percent: Math.round((completedItems / totalItems) * 100),
    missing,
    steps,
  };
}
