export function normalizeInviteCode(inviteKey: string): string {
  return inviteKey.trim().replace(/\s+/g, "").toUpperCase();
}
