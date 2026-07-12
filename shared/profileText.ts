export const PROFILE_DISPLAY_NAME_MAX_CHARS = 120;
export const PROFILE_BIO_MAX_CHARS = 500;

export type ProfileTextValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: "too_long" };

function validateProfileText(
  value: unknown,
  maxChars: number,
): ProfileTextValidationResult {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maxChars) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value: normalized || null };
}

export function validateProfileDisplayName(value: unknown): ProfileTextValidationResult {
  return validateProfileText(value, PROFILE_DISPLAY_NAME_MAX_CHARS);
}

export function validateProfileBio(value: unknown): ProfileTextValidationResult {
  return validateProfileText(value, PROFILE_BIO_MAX_CHARS);
}
