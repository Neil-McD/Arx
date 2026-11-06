export function slugifyCommunityName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// A community's own site address for a handle: the site it has (with this
// environment's suffix, as its site_url shows), or <handle>.polynet.page.
export function communitySiteAddress(nextSlug: string, current?: { slug?: string | null; site_url?: string | null }): string {
  const slug = nextSlug.trim() || "your-community";
  try {
    const host = current?.site_url ? new URL(current.site_url).host : "";
    const currentSlug = String(current?.slug ?? "");
    if (host && currentSlug && host.startsWith(currentSlug)) return `${slug}${host.slice(currentSlug.length)}`;
  } catch {
    // Not a URL: the plain address below.
  }
  return `${slug}.polynet.page`;
}

export function isValidCommunitySlug(value: string): boolean {
  if (value.length < 3 || value.length > 32) return false;
  return /^(?!-)[a-z0-9-]+(?<!-)$/.test(value);
}
