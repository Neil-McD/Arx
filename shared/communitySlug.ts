export function slugifyCommunityName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function normalizeCommunitySlugIdentity(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidCommunitySlug(value: string): boolean {
  if (value.length < 3 || value.length > 32) return false;
  return /^(?!-)[a-z0-9-]+(?<!-)$/.test(value);
}
