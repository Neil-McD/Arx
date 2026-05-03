import type { CSSProperties } from "react";

export const DEFAULT_COMMUNITY_BANNER_FOCUS = 0.5;
export const DEFAULT_COMMUNITY_BANNER_ZOOM = 1;
export const MIN_COMMUNITY_BANNER_ZOOM = 1;
export const MAX_COMMUNITY_BANNER_ZOOM = 2.5;

export function clampCommunityBannerFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COMMUNITY_BANNER_FOCUS;
  return Math.max(0, Math.min(1, parsed));
}

export function clampCommunityBannerZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COMMUNITY_BANNER_ZOOM;
  return Math.max(MIN_COMMUNITY_BANNER_ZOOM, Math.min(MAX_COMMUNITY_BANNER_ZOOM, parsed));
}

export function getCommunityBannerImageStyle(args: {
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
}): CSSProperties {
  const focusX = clampCommunityBannerFocus(args.focusX);
  const focusY = clampCommunityBannerFocus(args.focusY);
  const zoom = clampCommunityBannerZoom(args.zoom);
  return {
    objectPosition: `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`,
  };
}

export function getCommunityBannerBackgroundStyle(args: {
  imageUrl?: string | null;
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
}): CSSProperties | undefined {
  if (!args.imageUrl) return undefined;
  const focusX = clampCommunityBannerFocus(args.focusX);
  const focusY = clampCommunityBannerFocus(args.focusY);
  const zoom = clampCommunityBannerZoom(args.zoom);
  return {
    backgroundImage: `url(${args.imageUrl})`,
    backgroundPosition: `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`,
    backgroundSize: `${Math.max(100, zoom * 100)}%`,
  };
}
