export type CanonicalCommunityVisibility = "published" | "unlisted";

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

export function isPublishedCommunityVisibility(raw: unknown): boolean {
  return toCanonicalCommunityVisibility(raw) === "published";
}
