export const COMMUNITY_LIFECYCLE_STATUSES = [
  "active",
  "sunsetting",
  "archived",
] as const;

export type CommunityLifecycleStatus =
  (typeof COMMUNITY_LIFECYCLE_STATUSES)[number];

export const DEFAULT_COMMUNITY_LIFECYCLE_STATUS: CommunityLifecycleStatus =
  "active";
export const DEFAULT_COMMUNITY_LIFECYCLE_GENERATION = 0;
export const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";

export type CommunityLifecycleLike = {
  slug?: unknown;
  lifecycleStatus?: unknown;
  lifecycleGeneration?: unknown;
};

export function normalizeCommunityLifecycleStatus(
  value: unknown,
): CommunityLifecycleStatus {
  if (value === undefined) return DEFAULT_COMMUNITY_LIFECYCLE_STATUS;
  if (value === "active" || value === "sunsetting" || value === "archived") {
    return value;
  }
  throw new Error("community_lifecycle_status_invalid");
}

export function normalizeCommunityLifecycleGeneration(value: unknown): number {
  if (value === undefined) return DEFAULT_COMMUNITY_LIFECYCLE_GENERATION;
  const generation = Number(value);
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new Error("community_lifecycle_generation_invalid");
  }
  return generation;
}

export function communityIsArchived(
  community: CommunityLifecycleLike | null | undefined,
): boolean {
  return (
    normalizeCommunityLifecycleStatus(community?.lifecycleStatus) === "archived"
  );
}

export function communityIsOperational(
  community: CommunityLifecycleLike | null | undefined,
): boolean {
  return !communityIsArchived(community);
}

export function communityAcceptsNewOperations(
  community: CommunityLifecycleLike | null | undefined,
): boolean {
  return (
    normalizeCommunityLifecycleStatus(community?.lifecycleStatus) === "active"
  );
}

export function communityIsLifecycleProtected(
  community: CommunityLifecycleLike | null | undefined,
): boolean {
  return (
    String(community?.slug ?? "")
      .trim()
      .toLowerCase() === PLATFORM_HOME_COMMUNITY_SLUG
  );
}
