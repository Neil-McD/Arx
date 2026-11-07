
export function normalizeAuthRelinkEmail(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

export function isAnonymousAuthSubject(value: unknown): boolean {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("anon:");
}
