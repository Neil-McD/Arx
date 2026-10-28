

export function resolveHorizontalRovingIndex({
  key,
  currentIndex,
  enabled,
}: {
  key: string;
  currentIndex: number;
  enabled: readonly boolean[];
}): number | null {
  if (
    key !== "ArrowLeft" &&
    key !== "ArrowRight" &&
    key !== "Home" &&
    key !== "End"
  ) {
    return null;
  }

  const enabledIndexes = enabled
    .map((isEnabled, index) => (isEnabled ? index : -1))
    .filter((index) => index >= 0);
  if (enabledIndexes.length === 0) return null;

  if (key === "Home") return enabledIndexes[0] ?? null;
  if (key === "End") return enabledIndexes.at(-1) ?? null;

  const currentEnabledPosition = enabledIndexes.indexOf(currentIndex);
  if (currentEnabledPosition < 0) {
    return key === "ArrowRight"
      ? (enabledIndexes[0] ?? null)
      : (enabledIndexes.at(-1) ?? null);
  }

  const direction = key === "ArrowRight" ? 1 : -1;
  const nextEnabledPosition =
    (currentEnabledPosition + direction + enabledIndexes.length) %
    enabledIndexes.length;
  return enabledIndexes[nextEnabledPosition] ?? null;
}
