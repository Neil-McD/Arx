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
    // Runtime tool loops can finish with several SSE chunks already buffered.
    // Keep the final drain visibly progressive instead of collapsing a short
    // answer into one paint, while the controller's deadline still bounds the
    // total handoff delay.
    if (backlog > 1000) return 42;
    if (backlog > 500) return 28;
    if (backlog > 180) return 18;
    if (backlog > 80) return 12;
    return 7;
  }
  if (backlog > 1000) return 140;
  if (backlog > 500) return 90;
  if (backlog > 180) return 56;
  if (backlog > 80) return 34;
  if (backlog > 24) return 18;
  if (backlog > 8) return 9;
  return 5;
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
