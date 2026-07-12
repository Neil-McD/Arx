const PROFILE_MUTATION_ERROR_MESSAGES = {
  profile_display_name_too_long: "Display name must be 120 characters or less.",
  profile_bio_too_long: "Bio must be 500 characters or less.",
  profile_handle_taken: "That handle is already taken.",
  profile_handle_empty: "Add a handle to continue.",
  profile_handle_reserved: "That handle is reserved.",
  profile_handle_too_short: "Handle must be at least 3 characters.",
  profile_handle_too_long: "Handle must be 32 characters or less.",
  profile_handle_invalid_format: "Handle can use lowercase letters, numbers, underscores, and hyphens.",
  profile_avatar_invalid: "Upload a valid profile photo and try again.",
  profile_link_invalid_youtube: "Enter a valid YouTube profile URL.",
  profile_link_invalid_x: "Enter a valid X profile URL.",
  profile_link_invalid_instagram: "Enter a valid Instagram profile URL.",
  platform_legal_versions_required: "Agree to the Terms of Service and acknowledge the Privacy & AI Data Policy to continue.",
  terms_of_service_version_stale: "Refresh the page and review the latest Terms of Service before continuing.",
  privacy_policy_version_stale: "Refresh the page and review the latest Privacy & AI Data Policy before continuing.",
  profile_forbidden: "We could not verify your account. Sign in again to continue.",
  user_not_found: "We could not verify your account. Sign in again to continue.",
} as const;

type ProfileMutationErrorCode = keyof typeof PROFILE_MUTATION_ERROR_MESSAGES;

function isProfileMutationErrorCode(value: unknown): value is ProfileMutationErrorCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PROFILE_MUTATION_ERROR_MESSAGES, value)
  );
}

function readObjectField(value: unknown, field: string): unknown {
  if (!value || typeof value !== "object" || !(field in value)) return null;
  return (value as Record<string, unknown>)[field];
}

function extractProfileMutationErrorCode(error: unknown): ProfileMutationErrorCode | null {
  const data = readObjectField(error, "data");
  const dataCode = readObjectField(data, "code");
  if (isProfileMutationErrorCode(dataCode)) return dataCode;
  const dataReason = readObjectField(data, "reason");
  if (isProfileMutationErrorCode(dataReason)) return dataReason;

  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const code of Object.keys(PROFILE_MUTATION_ERROR_MESSAGES)) {
    if (message.includes(code)) return code as ProfileMutationErrorCode;
  }
  return null;
}

function isRedactedServerErrorMessage(message: string): boolean {
  return /^\[Request ID:\s*[\w-]+\]\s*Server Error$/i.test(message.trim());
}

export function formatProfileMutationError(error: unknown, fallback: string): string {
  const code = extractProfileMutationErrorCode(error);
  if (code) return PROFILE_MUTATION_ERROR_MESSAGES[code];

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message || isRedactedServerErrorMessage(message)) return fallback;
  return message;
}
