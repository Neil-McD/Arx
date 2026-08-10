export type CommunityInteractionLinkNormalizer = (rawUrl: string) => string | null;

export function extractCommunityInteractionLinkSources(
  text: string,
  normalizeUrl: CommunityInteractionLinkNormalizer,
  limit = 2,
): string[] {
  if (limit <= 0) return [];
  const sources: string[] = [];
  const seen = new Set<string>();
  let insideCodeFence = false;
  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();
    if (/^```(?:[A-Za-z0-9_+-]*)\s*$/.test(trimmedLine)) {
      insideCodeFence = !insideCodeFence;
      continue;
    }
    if (insideCodeFence) continue;
    const visibleLine = line.replace(/`[^`]*`/g, " ");
    const matches = visibleLine.match(/\bhttps?:\/\/[^\s<>()]+/gi) ?? [];
    for (const raw of matches) {
      if (sources.length >= limit) return sources;
      const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, "");
      const normalized = normalizeUrl(trimmed);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      sources.push(normalized);
    }
  }
  return sources;
}
