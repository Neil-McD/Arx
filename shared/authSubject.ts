export function isAnonymousAuthSubject(value: unknown): boolean {
  return String(value ?? "").trim().startsWith("anon:");
}
