import { isPublishedCommunityVisibility } from "./communityVisibility";

export type CommunityPublishReadinessMissing =
  | "community_name"
  | "community_one_liner"
  | "community_avatar"
  | "community_banner";

export type CommunityPublishReadinessInput = {
  name?: string | null;
  oneLiner?: string | null;
  avatarUrl?: string | null;
  avatarStorageId?: unknown;
  bannerUrl?: string | null;
  bannerStorageId?: unknown;
};

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

export function getCommunityPublishReadinessMissingFields(
  input: CommunityPublishReadinessInput,
): CommunityPublishReadinessMissing[] {
  const missing: CommunityPublishReadinessMissing[] = [];
  if (!hasText(input.name)) missing.push("community_name");
  if (!hasText(input.oneLiner)) missing.push("community_one_liner");
  if (!hasText(input.avatarUrl) && !hasText(input.avatarStorageId)) {
    missing.push("community_avatar");
  }
  if (!hasText(input.bannerUrl) && !hasText(input.bannerStorageId)) {
    missing.push("community_banner");
  }
  return missing;
}

export function getCommunityPublishReadinessBlockingFields(input: {
  currentVisibility?: string | null;
  nextVisibility?: string | null;
  current: CommunityPublishReadinessInput;
  next: CommunityPublishReadinessInput;
}): CommunityPublishReadinessMissing[] {
  if (!isPublishedCommunityVisibility(input.nextVisibility)) return [];

  const nextMissing = getCommunityPublishReadinessMissingFields(input.next);
  if (nextMissing.length === 0) return [];

  if (!isPublishedCommunityVisibility(input.currentVisibility)) {
    return nextMissing;
  }

  const currentMissing = new Set(
    getCommunityPublishReadinessMissingFields(input.current),
  );
  return nextMissing.filter((field) => !currentMissing.has(field));
}
