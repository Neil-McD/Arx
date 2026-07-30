export function normalizeDirectMessageReadSeq(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function clampDirectMessageReadSeq(
  requestedThroughSeq: unknown,
  latestReadableSeq: unknown,
): number {
  const requested = normalizeDirectMessageReadSeq(requestedThroughSeq);
  const latest = normalizeDirectMessageReadSeq(latestReadableSeq);
  if (requested === 0 || latest === 0) return 0;
  return Math.min(requested, latest);
}

export function nextDirectMessageReadSeq(
  currentThroughSeq: unknown,
  requestedThroughSeq: unknown,
  latestReadableSeq: unknown,
): number {
  return Math.max(
    normalizeDirectMessageReadSeq(currentThroughSeq),
    clampDirectMessageReadSeq(requestedThroughSeq, latestReadableSeq),
  );
}
