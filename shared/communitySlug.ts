export function slugifyCommunityName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// A community's landing page address for a handle: /c/<handle> on this app
// (Nov 13: custom sites are being removed, so the page lives in the app).
export function communityPageAddress(nextSlug: string, host?: string): string {
  const slug = nextSlug.trim() || "your-community";
  const here = host ?? (typeof window !== "undefined" && window.location?.host ? window.location.host : "www.polynet.ai");
  return `${here}/c/${slug}`;
}

export function isValidCommunitySlug(value: string): boolean {
  if (value.length < 3 || value.length > 32) return false;
  return /^(?!-)[a-z0-9-]+(?<!-)$/.test(value);
}
