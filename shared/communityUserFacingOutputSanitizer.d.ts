export const USER_FACING_INTERNAL_IDENTIFIER_KEYS: readonly string[];

export function sanitizeUserFacingAssistantText(params: {
  text?: unknown;
  communityId?: unknown;
  communityName?: unknown;
  blockedIds?: unknown[];
}): string;
