export const DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS = 5;
export const DISTRIBUTION_ATTRIBUTION_LEASE_MS = 60_000;
export const DISTRIBUTION_ATTRIBUTION_SOURCE_SYSTEM = 'polynet';
export const DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX = 'polynet.user_created.v1:';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DistributionAttributionReceipt = {
  sourceEventId: string;
  viewerId: string;
  leadEventId: string;
  leadCreated: boolean;
  replayed: boolean;
};

export function normalizeDistributionAttributionId(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return UUID_RE.test(normalized) ? normalized.toLowerCase() : undefined;
}

export function createDistributionAttributionSourceEventId(): string {
  return `${DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX}${crypto.randomUUID()}`;
}

export function normalizeDistributionAttributionSourceEventId(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized.startsWith(DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX)) return undefined;
  const eventId = normalized.slice(DISTRIBUTION_ATTRIBUTION_SOURCE_EVENT_PREFIX.length);
  return UUID_RE.test(eventId) ? normalized : undefined;
}

export function parseDistributionAttributionReceipt(
  value: unknown,
  expectedSourceEventId: string,
):
  | { ok: true; receipt: DistributionAttributionReceipt }
  | { ok: false; errorCode: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, errorCode: 'distribution_engineer_receipt_not_object' };
  }
  const row = value as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, errorCode: 'distribution_engineer_receipt_not_ok' };
  }
  const sourceEventId = normalizeDistributionAttributionSourceEventId(row.source_event_id);
  if (!sourceEventId || sourceEventId !== expectedSourceEventId) {
    return { ok: false, errorCode: 'distribution_engineer_receipt_source_event_mismatch' };
  }
  const viewerId = normalizeDistributionAttributionId(row.viewer_id);
  if (!viewerId) {
    return { ok: false, errorCode: 'distribution_engineer_receipt_viewer_invalid' };
  }
  const leadEventId = normalizeDistributionAttributionId(row.lead_event_id);
  if (!leadEventId) {
    return { ok: false, errorCode: 'distribution_engineer_receipt_lead_invalid' };
  }
  if (typeof row.lead_created !== 'boolean') {
    return { ok: false, errorCode: 'distribution_engineer_receipt_created_invalid' };
  }
  if (typeof row.replayed !== 'boolean' || row.replayed === row.lead_created) {
    return { ok: false, errorCode: 'distribution_engineer_receipt_replay_invalid' };
  }
  return {
    ok: true,
    receipt: {
      sourceEventId,
      viewerId,
      leadEventId,
      leadCreated: row.lead_created,
      replayed: row.replayed,
    },
  };
}

export function distributionAttributionRetryDelayMs(attemptCount: number): number {
  const delays = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
  return delays[Math.max(0, Math.min(delays.length - 1, attemptCount - 1))]!;
}

export function shouldRetryDistributionAttribution(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}

export function distributionAttributionDeliveryKey(userId: string): string {
  return `polynet_user_created:${userId}`;
}
