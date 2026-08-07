export type CommunityInteractionLinkNormalizer = (rawUrl: string) => string | null;

export function extractCommunityInteractionLinkSources(
  text: string,
  normalizeUrl: CommunityInteractionLinkNormalizer,
  limit = 2,
): string[] {
  const matches = text.match(/\bhttps?:\/\/[^\s<>()]+/gi);
  if (!matches || limit <= 0) return [];
  const sources: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    if (sources.length >= limit) break;
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, "");
    const normalized = normalizeUrl(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    sources.push(normalized);
  }
  return sources;
}
