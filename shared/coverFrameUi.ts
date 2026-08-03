import type { CSSProperties } from "react";

export const DEFAULT_COVER_FOCUS = 0.5;
export const DEFAULT_COVER_ZOOM = 1;
export const MIN_COVER_ZOOM = 1;
export const MAX_COVER_ZOOM = 2.5;

export type CoverFrame = {
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
};

export type CoverFrameLayout = {
  viewportWidth: number;
  viewportHeight: number;
  renderWidth: number;
  renderHeight: number;
  left: number;
  top: number;
  minLeft: number;
  minTop: number;
};

export function clampCoverFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COVER_FOCUS;
  return Math.max(0, Math.min(1, parsed));
}

export function clampCoverZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COVER_ZOOM;
  return Math.max(MIN_COVER_ZOOM, Math.min(MAX_COVER_ZOOM, parsed));
}

export function computeCoverFrameLayout(args: {
  viewportWidth: number;
  viewportHeight: number;
  naturalWidth: number;
  naturalHeight: number;
} & CoverFrame): CoverFrameLayout | null {
  const viewportWidth = Math.max(0, args.viewportWidth);
  const viewportHeight = Math.max(0, args.viewportHeight);
  const naturalWidth = Math.max(0, args.naturalWidth);
  const naturalHeight = Math.max(0, args.naturalHeight);
  if (!viewportWidth || !viewportHeight || !naturalWidth || !naturalHeight) return null;

  const focusX = clampCoverFocus(args.focusX);
  const focusY = clampCoverFocus(args.focusY);
  const zoom = clampCoverZoom(args.zoom);
  const baseScale = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
  const renderWidth = naturalWidth * baseScale * zoom;
  const renderHeight = naturalHeight * baseScale * zoom;
  const minLeft = Math.min(0, viewportWidth - renderWidth);
  const minTop = Math.min(0, viewportHeight - renderHeight);
  const left = Math.max(minLeft, Math.min(0, viewportWidth / 2 - focusX * renderWidth));
  const top = Math.max(minTop, Math.min(0, viewportHeight / 2 - focusY * renderHeight));

  return { viewportWidth, viewportHeight, renderWidth, renderHeight, left, top, minLeft, minTop };
}

export function focusFromCoverFramePosition(layout: CoverFrameLayout, left: number, top: number) {
  return {
    focusX: clampCoverFocus((layout.viewportWidth / 2 - left) / layout.renderWidth),
    focusY: clampCoverFocus((layout.viewportHeight / 2 - top) / layout.renderHeight),
  };
}

export function getCoverFrameImageStyle(layout: CoverFrameLayout): CSSProperties {
  return {
    position: "absolute",
    width: `${layout.renderWidth}px`,
    height: `${layout.renderHeight}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "fill",
    transform: "none",
  };
}
