export const TYPING_PRESENCE_LEASE_DURATION_MS = 5_000;
export const TYPING_PRESENCE_RENEW_INTERVAL_MS = 2_000;

export const COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT = 25;
export const COMMUNITY_TYPING_PRESENCE_VISIBLE_LIMIT = 12;

export const DIRECT_MESSAGE_TYPING_PRESENCE_SCAN_LIMIT = 12;
export const DIRECT_MESSAGE_TYPING_PRESENCE_VISIBLE_LIMIT = 4;

export function normalizeTypingPresenceTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

export function issueTypingPresenceLease(nowMs: number): {
  displayUntil: number;
  updatedAt: number;
} {
  const updatedAt = normalizeTypingPresenceTimestamp(nowMs);
  if (updatedAt === null) throw new Error("typing_presence_clock_invalid");
  return {
    displayUntil: updatedAt + TYPING_PRESENCE_LEASE_DURATION_MS,
    updatedAt,
  };
}

export function typingPresenceLeaseIsActive(
  row: { displayUntil: unknown },
  nowMs: number,
): boolean {
  const displayUntil = normalizeTypingPresenceTimestamp(row.displayUntil);
  const now = normalizeTypingPresenceTimestamp(nowMs);
  return displayUntil !== null && now !== null && displayUntil > now;
}
