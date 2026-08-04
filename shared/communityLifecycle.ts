export const COMMUNITY_LIFECYCLE_STATUSES = [
  "active",
  "archiving",
  "archived",
] as const;

export type CommunityLifecycleStatus =
  (typeof COMMUNITY_LIFECYCLE_STATUSES)[number];

export type CommunityNewOperationsErrorCode =
  | "community_archiving"
  | "community_archived";

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
  if (value === "active" || value === "archiving" || value === "archived") {
    return value;
  }
  throw new Error("community_lifecycle_status_invalid");
}

export function normalizeCommunityLifecycleGeneration(value: unknown): number {
  if (value === undefined) return DEFAULT_COMMUNITY_LIFECYCLE_GENERATION;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("community_lifecycle_generation_invalid");
  }
  return value;
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
  if (!community) return false;
  return (
    normalizeCommunityLifecycleStatus(community.lifecycleStatus) === "active"
  );
}

export function communityAcceptsNewOperations(
  community: CommunityLifecycleLike | null | undefined,
): boolean {
  if (!community) return false;
  return (
    normalizeCommunityLifecycleStatus(community?.lifecycleStatus) === "active"
  );
}

export function resolveCommunityNewOperationsErrorCode(
  community: CommunityLifecycleLike | null | undefined,
): CommunityNewOperationsErrorCode | null {
  const status = normalizeCommunityLifecycleStatus(community?.lifecycleStatus);
  if (status === "active") return null;
  return status === "archived" ? "community_archived" : "community_archiving";
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
