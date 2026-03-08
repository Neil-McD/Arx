import type { CSSProperties } from "react";

export function buildPlatformSwitcherStyle(count: number, activeIndex: number): CSSProperties {
  const safeCount = Math.max(1, Math.floor(count));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Math.floor(activeIndex)));
  return {
    ["--switcher-pill-width" as const]: `calc((100% - 8px) / ${safeCount})`,
    ["--switcher-pill-left" as const]: `calc(4px + ${safeIndex} * ((100% - 8px) / ${safeCount}))`,
  } as CSSProperties;
}
