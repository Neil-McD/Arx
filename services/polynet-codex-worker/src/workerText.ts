export function safeResourceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63);
}

export function neutralizeWorkspaceText(value: unknown): string {
  return String(value ?? "").replace(/blaxel|daytona/gi, "workspace");
}

export function previewText(value: unknown, max = 500): string {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}
