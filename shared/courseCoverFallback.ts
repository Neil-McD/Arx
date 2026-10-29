import type { CSSProperties } from "react";

// A course without a cover gets its own soft gradient in the community's
// colours, with the course's first letter on it. The course id picks the
// angle and where the two glows sit, so each course looks different but never
// changes between visits.
export function courseCoverFallback(seed: string, name: string): { initial: string; style: CSSProperties } {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const pick = (shift: number, range: number) => ((hash >>> shift) & 0xff) % range;
  const initial = Array.from(name.trim().replace(/^[^\p{L}\p{N}]+/u, ""))[0]?.toUpperCase() ?? "";
  return {
    initial,
    style: {
      "--cover-angle": `${pick(0, 8) * 45 + 20}deg`,
      "--cover-glow-a-x": `${10 + pick(8, 35)}%`,
      "--cover-glow-a-y": `${10 + pick(12, 40)}%`,
      "--cover-glow-b-x": `${55 + pick(16, 35)}%`,
      "--cover-glow-b-y": `${50 + pick(20, 40)}%`,
      "--cover-hue": `${pick(24, 7) * 5 - 15}`,
    } as CSSProperties,
  };
}
