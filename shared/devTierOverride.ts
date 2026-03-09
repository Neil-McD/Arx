export type DevBuilderTierUi = "free" | "builder";

const CREATOR_EMAIL_ALLOWLIST = new Set<string>([
  "neilmcdevitt@gmail.com",
  "neilmcdevittd@gmail.com",
]);

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isTruthyFlag(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function canUseCreatorDevTierOverride(input: {
  email: string | null | undefined;
  isDev: boolean;
  featureFlag: unknown;
}): boolean {
  const email = normalizeEmail(input.email);
  if (!email || !CREATOR_EMAIL_ALLOWLIST.has(email)) return false;
  return input.isDev || isTruthyFlag(input.featureFlag);
}
