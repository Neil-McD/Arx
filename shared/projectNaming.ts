const DEFAULT_COMPUTER_NAME_PATTERN = /^(?:project|computer)\s+([1-9]\d*)$/i;

export function formatDefaultComputerName(index: number): string {
  const safeIndex = Number.isInteger(index) && index > 0 ? index : 1;
  return `Computer ${safeIndex}`;
}

export function readDefaultComputerNameIndex(raw: string | null | undefined): number | null {
  const normalized = String(raw ?? "").trim();
  const match = normalized.match(DEFAULT_COMPUTER_NAME_PATTERN);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index > 0 ? index : null;
}

export function normalizeComputerDisplayName(raw: string | null | undefined): string {
  const normalized = String(raw ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "workspace") {
    return formatDefaultComputerName(1);
  }
  const defaultIndex = readDefaultComputerNameIndex(normalized);
  return defaultIndex ? formatDefaultComputerName(defaultIndex) : normalized;
}

export function buildNextDefaultComputerName(existingNames: Array<string | null | undefined>): string {
  const usedIndexes = new Set<number>();
  for (const name of existingNames) {
    const index = readDefaultComputerNameIndex(name);
    if (index) usedIndexes.add(index);
  }

  let nextIndex = 1;
  while (usedIndexes.has(nextIndex)) {
    nextIndex += 1;
  }
  return formatDefaultComputerName(nextIndex);
}
