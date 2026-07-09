export type RuntimeSkillLifecycleTrigger = "onboarding_completed";

export function normalizeRuntimeSkillLifecycleTrigger(
  value: unknown,
): RuntimeSkillLifecycleTrigger | null {
  return value === "onboarding_completed" ? value : null;
}

export function describeRuntimeSkillLifecycleTrigger(
  trigger: RuntimeSkillLifecycleTrigger,
): string {
  const descriptions: Record<RuntimeSkillLifecycleTrigger, string> = {
    onboarding_completed: "member onboarding completed",
  };
  return descriptions[trigger];
}
