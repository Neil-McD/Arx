// Design system v1 is permanently active in apps/web/index.html (data-design="v1").
// Structural branches still read this helper while Step 2 retires remaining classic paths.
export function isDesignV1Active(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.design === "v1";
}
