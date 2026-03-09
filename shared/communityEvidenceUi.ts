import type { CommunityEvidenceItem } from "./communityEvidence";

export function formatCommunityEvidenceTypeLabel(
  sourceType: CommunityEvidenceItem["source_type"],
): string {
  if (sourceType === "chat") return "Chat";
  if (sourceType === "ai_feed") return "AI Feed";
  return "Resource";
}

export function summarizeCommunityEvidenceSnippet(item: CommunityEvidenceItem): string {
  const primary = (item.snippet ?? "").trim();
  const fallback = (item.title ?? "").trim();
  const text = primary || fallback || item.source_id;
  const maxChars = 120;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}
