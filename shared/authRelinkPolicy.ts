export type AuthRelinkBucket =
  | "safe_auto_relink"
  | "manual_duplicate_email"
  | "manual_missing_email"
  | "manual_other";

export function normalizeAuthRelinkEmail(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

export function isAnonymousAuthSubject(value: unknown): boolean {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("anon:");
}

export function classifyAuthRelinkBucket(args: {
  authSubject: string | null;
  normalizedEmail: string | null;
  authenticatedEmailClusterSize: number;
}): AuthRelinkBucket {
  if (!args.authSubject) return "manual_other";
  if (!args.normalizedEmail) return "manual_missing_email";
  if (args.authenticatedEmailClusterSize !== 1) return "manual_duplicate_email";
  return "safe_auto_relink";
}
