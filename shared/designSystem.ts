// Design system v1 is switched on at build time (apps/web/designSystemFlag.ts),
// which stamps data-design="v1" on <html>. Structural changes read it here.
export function isDesignV1Active(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.design === "v1";
}
