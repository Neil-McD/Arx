import type { CSSProperties } from "react";

export const DEFAULT_COMMUNITY_AVATAR_FOCUS = 0.5;
export const DEFAULT_COMMUNITY_AVATAR_ZOOM = 1;
export const MIN_COMMUNITY_AVATAR_ZOOM = 1;
export const MAX_COMMUNITY_AVATAR_ZOOM = 2.5;

export function clampCommunityAvatarFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COMMUNITY_AVATAR_FOCUS;
  return Math.max(0, Math.min(1, parsed));
}

export function clampCommunityAvatarZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COMMUNITY_AVATAR_ZOOM;
  return Math.max(MIN_COMMUNITY_AVATAR_ZOOM, Math.min(MAX_COMMUNITY_AVATAR_ZOOM, parsed));
}

export function getCommunityAvatarImageStyle(args: {
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
}): CSSProperties {
  const focusX = clampCommunityAvatarFocus(args.focusX);
  const focusY = clampCommunityAvatarFocus(args.focusY);
  const zoom = clampCommunityAvatarZoom(args.zoom);
  return {
    objectPosition: `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: "center center",
  };
}
