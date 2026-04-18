export type DevBuilderTierUi = "free" | "builder";

const CREATOR_EMAIL_ALLOWLIST = new Set<string>([
  "neilmcdevitt@gmail.com",
  "neilmcdevittd@gmail.com",
]);

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isCreatorDevTierOverrideEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && CREATOR_EMAIL_ALLOWLIST.has(normalized);
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
  if (!isCreatorDevTierOverrideEmail(input.email)) return false;
  return input.isDev || isTruthyFlag(input.featureFlag);
}
