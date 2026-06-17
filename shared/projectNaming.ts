const DEFAULT_PROJECT_NAME_PATTERN = /^(?:project|computer)\s+([1-9]\d*)$/i;

export function formatDefaultProjectName(index: number): string {
  const safeIndex = Number.isInteger(index) && index > 0 ? index : 1;
  return `Project ${safeIndex}`;
}

export function readDefaultProjectNameIndex(raw: string | null | undefined): number | null {
  const normalized = String(raw ?? "").trim();
  const match = normalized.match(DEFAULT_PROJECT_NAME_PATTERN);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index > 0 ? index : null;
}

export function normalizeProjectDisplayName(raw: string | null | undefined): string {
  const normalized = String(raw ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "workspace") {
    return formatDefaultProjectName(1);
  }
  const defaultIndex = readDefaultProjectNameIndex(normalized);
  return defaultIndex ? formatDefaultProjectName(defaultIndex) : normalized;
}

export function buildNextDefaultProjectName(existingNames: Array<string | null | undefined>): string {
  const usedIndexes = new Set<number>();
  for (const name of existingNames) {
    const index = readDefaultProjectNameIndex(name);
    if (index) usedIndexes.add(index);
  }

  let nextIndex = 1;
  while (usedIndexes.has(nextIndex)) {
    nextIndex += 1;
  }
  return formatDefaultProjectName(nextIndex);
}
