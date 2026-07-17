function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateText(raw: unknown, maxLen: number): string {
  const value = collapseWhitespace(String(raw ?? ""));
  if (!value) return "";
  return value.length <= maxLen
    ? value
    : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export function normalizeOptionalText(raw: unknown, maxLen: number): string | null {
  const value = truncateText(raw, maxLen);
  return value || null;
}
