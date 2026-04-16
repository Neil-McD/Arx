export type SmoothStreamingTextOptions = {
  draining?: boolean;
  reducedMotion?: boolean;
};

function splitGraphemes(value: string): string[] {
  const segmenter = (Intl as any)?.Segmenter;
  if (typeof segmenter === "function") {
    return Array.from(
      new segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (part: any) => String(part.segment ?? ""),
    ).filter(Boolean);
  }
  return Array.from(value);
}

function chooseRevealBudget(backlog: number, draining: boolean): number {
  if (draining) {
    if (backlog > 1000) return 240;
    if (backlog > 500) return 160;
    if (backlog > 180) return 96;
    if (backlog > 80) return 52;
    return 24;
  }
  if (backlog > 1000) return 96;
  if (backlog > 500) return 64;
  if (backlog > 180) return 38;
  if (backlog > 80) return 22;
  if (backlog > 24) return 12;
  if (backlog > 8) return 6;
  return 3;
}

function isSoftBoundary(segment: string): boolean {
  return /^\s$/.test(segment) || /^[,.;:!?)]$/.test(segment);
}

function chooseBoundary(segments: string[], budget: number, draining: boolean): number {
  const clampedBudget = Math.max(1, Math.min(segments.length, budget));
  if (clampedBudget >= segments.length) return segments.length;

  const extraWindow = draining ? 18 : 10;
  const limit = Math.min(segments.length, clampedBudget + extraWindow);
  for (let index = clampedBudget; index < limit; index += 1) {
    if (isSoftBoundary(segments[index] ?? "")) return index + 1;
  }
  return clampedBudget;
}

export function shouldDisableStreamingSmoothing(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

export function getNextSmoothStreamingText(
  currentText: string,
  targetText: string,
  options: SmoothStreamingTextOptions = {},
): string {
  const current = String(currentText ?? "");
  const target = String(targetText ?? "");
  if (options.reducedMotion === true || current === target) return target;
  if (!target.startsWith(current)) return target;

  const remaining = target.slice(current.length);
  if (!remaining) return target;

  const segments = splitGraphemes(remaining);
  const budget = chooseRevealBudget(segments.length, options.draining === true);
  const take = chooseBoundary(segments, budget, options.draining === true);
  return current + segments.slice(0, take).join("");
}
