export const DISTRIBUTION_ATTRIBUTION_MAX_ATTEMPTS = 5;
export const DISTRIBUTION_ATTRIBUTION_LEASE_MS = 60_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeDistributionAttributionId(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return UUID_RE.test(normalized) ? normalized.toLowerCase() : undefined;
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
