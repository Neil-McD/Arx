import type { CSSProperties } from "react";

export const DEFAULT_AVATAR_FOCUS = 0.5;
export const DEFAULT_AVATAR_ZOOM = 1;
export const MIN_AVATAR_ZOOM = 1;
export const MAX_AVATAR_ZOOM = 2.5;

export function clampAvatarFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_AVATAR_FOCUS;
  return Math.max(0, Math.min(1, parsed));
}

export function clampAvatarZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_AVATAR_ZOOM;
  return Math.max(MIN_AVATAR_ZOOM, Math.min(MAX_AVATAR_ZOOM, parsed));
}

export type AvatarFrame = {
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
};

export type AvatarLayout = {
  viewportWidth: number;
  viewportHeight: number;
  renderWidth: number;
  renderHeight: number;
  left: number;
  top: number;
  minLeft: number;
  minTop: number;
};

export function computeAvatarLayout(args: {
  viewportWidth: number;
  viewportHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
}): AvatarLayout | null {
  const viewportWidth = Math.max(0, args.viewportWidth);
  const viewportHeight = Math.max(0, args.viewportHeight);
  const naturalWidth = Math.max(0, args.naturalWidth);
  const naturalHeight = Math.max(0, args.naturalHeight);
  if (!viewportWidth || !viewportHeight || !naturalWidth || !naturalHeight) {
    return null;
  }

  const focusX = clampAvatarFocus(args.focusX);
  const focusY = clampAvatarFocus(args.focusY);
  const zoom = clampAvatarZoom(args.zoom);
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

export function focusFromAvatarLayoutPosition(layout: AvatarLayout, left: number, top: number) {
  return {
    focusX: clampAvatarFocus((layout.viewportWidth / 2 - left) / layout.renderWidth),
    focusY: clampAvatarFocus((layout.viewportHeight / 2 - top) / layout.renderHeight),
  };
}

export function getAvatarLayoutImageStyle(layout: AvatarLayout): CSSProperties {
  return {
    position: "absolute",
    width: `${layout.renderWidth}px`,
    height: `${layout.renderHeight}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    maxWidth: "none",
    maxHeight: "none",
  };
}

export function getAvatarImageStyle(args: AvatarFrame): CSSProperties {
  const focusX = clampAvatarFocus(args.focusX);
  const focusY = clampAvatarFocus(args.focusY);
  const zoom = clampAvatarZoom(args.zoom);
  return {
    objectPosition: `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: "center center",
  };
}
