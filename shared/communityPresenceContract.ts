export const COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;
export const COMMUNITY_PRESENCE_LEASE_DURATION_MS = 90_000;
export const COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT = 64;
export const COMMUNITY_PRESENCE_FACE_LIMIT = 8;

type CommunityPresenceLeaseLike = {
  activeUntil?: number;
  lastSeenAt?: number;
};

export function normalizeCommunityPresenceTimestamp(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export function issueCommunityPresenceLease(nowMs: unknown): {
  lastSeenAt: number;
  activeUntil: number;
} {
  const lastSeenAt = normalizeCommunityPresenceTimestamp(nowMs);
  if (lastSeenAt === null) throw new Error("community_presence_clock_invalid");
  return {
    lastSeenAt,
    activeUntil: lastSeenAt + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
  };
}

export function communityPresenceLeaseIsActive(
  row: CommunityPresenceLeaseLike | null | undefined,
  nowMs: unknown,
): boolean {
  const now = normalizeCommunityPresenceTimestamp(nowMs);
  if (!row || now === null) return false;
  const activeUntil = normalizeCommunityPresenceTimestamp(row.activeUntil);
  if (activeUntil !== null) return activeUntil > now;
  const legacyLastSeenAt = normalizeCommunityPresenceTimestamp(row.lastSeenAt);
  return legacyLastSeenAt !== null
    && legacyLastSeenAt + COMMUNITY_PRESENCE_LEASE_DURATION_MS > now;
}
