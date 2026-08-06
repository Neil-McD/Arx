import { validateProfileHandle } from "./profileHandle.ts";

export type AccountSetupStep = "identity" | "complete";

export type AccountSetupMissing =
  | "display_name"
  | "handle"
  | "avatar"
  | "platform_legal";

export const ACCOUNT_SETUP_STEPS: AccountSetupStep[] = ["identity", "complete"];

export const ACCOUNT_SETUP_MISSING_FIELDS: AccountSetupMissing[] = [
  "display_name",
  "handle",
  "avatar",
  "platform_legal",
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
};

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
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
  const steps = [buildStepStatus("identity", identityMissing, 4)];
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

export function formatAccountSetupMissingGuidance(status: AccountSetupStatus | null | undefined): string {
  if (!status || status.completed || status.missing.length === 0) return "Account setup is complete.";

  if (status.missing.length === 1 && status.missing[0] === "platform_legal") {
    return "Agree to the Terms of Service and acknowledge the Privacy & AI Data Policy to finish account setup.";
  }

  const incompleteSteps = status.steps
    .filter((step) => !step.completed)
    .map(() => "profile");

  if (incompleteSteps.length === 1) {
    return "Finish your profile to continue.";
  }

  return `Finish ${formatList(incompleteSteps)} setup to continue.`;
}
