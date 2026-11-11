// Design system v1: on desktop windows wider than the mock's 1440px frame the
// whole app is drawn at the mock's proportions, enlarged to fill the window
// (Neil, Nov 11: the mock, as he sees it on a 1909px screen, is the target).
// The enlargement is capped so very large monitors don't get giant type.
// Narrower windows, phones and the default design are never scaled.
export const DESIGN_FRAME_WIDTH = 1440;
export const DESIGN_MAX_SCALE = 1.5;

export function designScaleFor(windowWidth: number): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= DESIGN_FRAME_WIDTH) return 1;
  return Math.min(DESIGN_MAX_SCALE, windowWidth / DESIGN_FRAME_WIDTH);
}

const VIEWPORT_UNITS = ["vh", "dvh", "svh", "lvh", "vw", "dvw", "svw", "lvw", "vmin", "vmax"] as const;

// Applies the scale to <body> and keeps one viewport unit (the --u-* custom
// properties the v1 CSS uses in place of vh/vw, apps/web/designViewportUnits.ts)
// equal to one unit of the scaled window. Returns a function that stops it.
export function startDesignScale(win: Window = window): () => void {
  const doc = win.document;
  const apply = () => {
    const scale = designScaleFor(win.innerWidth);
    const unitH = win.innerHeight / 100 / scale;
    const unitW = win.innerWidth / 100 / scale;
    const values: Record<(typeof VIEWPORT_UNITS)[number], number> = {
      vh: unitH, dvh: unitH, svh: unitH, lvh: unitH,
      vw: unitW, dvw: unitW, svw: unitW, lvw: unitW,
      vmin: Math.min(unitH, unitW), vmax: Math.max(unitH, unitW),
    };
    for (const unit of VIEWPORT_UNITS) doc.documentElement.style.setProperty(`--u-${unit}`, `${values[unit]}px`);
    doc.documentElement.style.setProperty("--design-scale", String(scale));
    if (scale === 1) doc.body.style.removeProperty("zoom");
    else doc.body.style.setProperty("zoom", String(scale));
  };
  apply();
  win.addEventListener("resize", apply);
  return () => win.removeEventListener("resize", apply);
}

// The zoom an element is drawn at. Positions the browser reports
// (getBoundingClientRect, pointer clientX/Y) are already scaled; a position
// written back into CSS inside the zoomed page is scaled again, so code that
// places things divides by this first.
export function cssZoomOf(element: Element | null | undefined): number {
  const zoom = (element as (Element & { currentCSSZoom?: number }) | null | undefined)?.currentCSSZoom;
  return typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}
