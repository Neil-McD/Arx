export type CanonicalCommunityVisibility = "published" | "unlisted";
export type LegacyCommunityVisibility = "public" | "unlisted" | "private";

function normalizeVisibility(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function toCanonicalCommunityVisibility(
  raw: unknown,
  fallback: CanonicalCommunityVisibility = "unlisted",
): CanonicalCommunityVisibility {
  const visibility = normalizeVisibility(raw);
  if (visibility === "published" || visibility === "public") return "published";
  if (visibility === "unlisted" || visibility === "private") return "unlisted";
  return fallback;
}

export function toLegacyCommunityVisibility(
  raw: unknown,
  fallback: LegacyCommunityVisibility = "unlisted",
): LegacyCommunityVisibility {
  const visibility = normalizeVisibility(raw);
  if (visibility === "published" || visibility === "public") return "public";
  if (visibility === "unlisted" || visibility === "private") return "unlisted";
  if (fallback === "private") return "private";
  if (fallback === "public") return "public";
  return "unlisted";
}

export function isPublishedCommunityVisibility(raw: unknown): boolean {
  return toCanonicalCommunityVisibility(raw) === "published";
}

export function isUnlistedCommunityVisibility(raw: unknown): boolean {
  return toCanonicalCommunityVisibility(raw) === "unlisted";
}

export function formatCommunityVisibilityLabel(raw: unknown): "Published" | "Unlisted" {
  return isPublishedCommunityVisibility(raw) ? "Published" : "Unlisted";
}
