export const COMMUNITY_LIFECYCLE_STATUSES = ["active", "archived"] as const;

export type CommunityLifecycleStatus =
  (typeof COMMUNITY_LIFECYCLE_STATUSES)[number];

export type CommunityLifecycleFields = {
  lifecycleStatus?: unknown;
  lifecycleGeneration?: unknown;
};

export type CommunityLifecycle = {
  status: CommunityLifecycleStatus;
  generation: number;
};

export type CommunityLifecycleTransition = {
  changed: boolean;
  previous: CommunityLifecycle;
  next: CommunityLifecycle;
};

function normalizeCommunityLifecycleStatus(
  value: unknown,
): CommunityLifecycleStatus {
  if (value === undefined) return "active";
  if (value === "active" || value === "archived") return value;
  throw new Error("community_lifecycle_status_invalid");
}

function normalizeCommunityLifecycleGeneration(value: unknown): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error("community_lifecycle_generation_invalid");
  }
  return Number(value);
}

export function normalizeCommunityLifecycle(
  fields: CommunityLifecycleFields,
): CommunityLifecycle {
  return {
    status: normalizeCommunityLifecycleStatus(fields.lifecycleStatus),
    generation: normalizeCommunityLifecycleGeneration(
      fields.lifecycleGeneration,
    ),
  };
}

export function communityIsActive(fields: CommunityLifecycleFields): boolean {
  return normalizeCommunityLifecycle(fields).status === "active";
}

export function communityLifecycleGenerationMatches(
  fields: CommunityLifecycleFields,
  expectedGeneration: unknown,
): boolean {
  return (
    normalizeCommunityLifecycle(fields).generation ===
    normalizeCommunityLifecycleGeneration(expectedGeneration)
  );
}

function nextCommunityLifecycleGeneration(current: number): number {
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new Error("community_lifecycle_generation_exhausted");
  }
  return current + 1;
}

function unchangedLifecycleTransition(
  lifecycle: CommunityLifecycle,
): CommunityLifecycleTransition {
  return {
    changed: false,
    previous: lifecycle,
    next: lifecycle,
  };
}

export function archiveCommunityLifecycle(
  fields: CommunityLifecycleFields,
): CommunityLifecycleTransition {
  const previous = normalizeCommunityLifecycle(fields);
  if (previous.status === "archived") {
    return unchangedLifecycleTransition(previous);
  }
  return {
    changed: true,
    previous,
    next: {
      status: "archived",
      generation: nextCommunityLifecycleGeneration(previous.generation),
    },
  };
}

export function restoreCommunityLifecycle(
  fields: CommunityLifecycleFields,
): CommunityLifecycleTransition {
  const previous = normalizeCommunityLifecycle(fields);
  if (previous.status === "active") {
    return unchangedLifecycleTransition(previous);
  }
  return {
    changed: true,
    previous,
    next: {
      status: "active",
      generation: nextCommunityLifecycleGeneration(previous.generation),
    },
  };
}
