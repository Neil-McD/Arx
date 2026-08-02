import type { CSSProperties } from "react";

export const DEFAULT_FRAMED_MEDIA_FOCUS = 0.5;
export const DEFAULT_FRAMED_MEDIA_ZOOM = 1;
export const MIN_FRAMED_MEDIA_ZOOM = 1;
export const MAX_FRAMED_MEDIA_ZOOM = 2.5;

export function clampFramedMediaFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_FRAMED_MEDIA_FOCUS;
  return Math.max(0, Math.min(1, parsed));
}

export function clampFramedMediaZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_FRAMED_MEDIA_ZOOM;
  return Math.max(MIN_FRAMED_MEDIA_ZOOM, Math.min(MAX_FRAMED_MEDIA_ZOOM, parsed));
}

export type FramedMediaFrame = {
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
};

export type FramedMediaLayout = {
  viewportWidth: number;
  viewportHeight: number;
  renderWidth: number;
  renderHeight: number;
  left: number;
  top: number;
  minLeft: number;
  minTop: number;
};

export function computeFramedMediaLayout(args: {
  viewportWidth: number;
  viewportHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
}): FramedMediaLayout | null {
  const viewportWidth = Math.max(0, args.viewportWidth);
  const viewportHeight = Math.max(0, args.viewportHeight);
  const naturalWidth = Math.max(0, args.naturalWidth);
  const naturalHeight = Math.max(0, args.naturalHeight);
  if (!viewportWidth || !viewportHeight || !naturalWidth || !naturalHeight) {
    return null;
  }

  const focusX = clampFramedMediaFocus(args.focusX);
  const focusY = clampFramedMediaFocus(args.focusY);
  const zoom = clampFramedMediaZoom(args.zoom);
  const baseScale = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
  const renderWidth = naturalWidth * baseScale * zoom;
  const renderHeight = naturalHeight * baseScale * zoom;
  const minLeft = Math.min(0, viewportWidth - renderWidth);
  const minTop = Math.min(0, viewportHeight - renderHeight);
  const left = Math.max(minLeft, Math.min(0, viewportWidth / 2 - focusX * renderWidth));
  const top = Math.max(minTop, Math.min(0, viewportHeight / 2 - focusY * renderHeight));

  return {
    viewportWidth,
    viewportHeight,
    renderWidth,
    renderHeight,
    left,
    top,
    minLeft,
    minTop,
  };
}

export function focusFromFramedMediaLayoutPosition(
  layout: FramedMediaLayout,
  left: number,
  top: number,
) {
  return {
    focusX: clampFramedMediaFocus((layout.viewportWidth / 2 - left) / layout.renderWidth),
    focusY: clampFramedMediaFocus((layout.viewportHeight / 2 - top) / layout.renderHeight),
  };
}

export function getFramedMediaLayoutImageStyle(layout: FramedMediaLayout): CSSProperties {
  return {
    position: "absolute",
    display: "block",
    width: `${layout.renderWidth}px`,
    height: `${layout.renderHeight}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    maxWidth: "none",
    maxHeight: "none",
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: 0,
    objectFit: "fill",
  };
}
