import {
  DEFAULT_FRAMED_MEDIA_FOCUS,
  DEFAULT_FRAMED_MEDIA_ZOOM,
  MAX_FRAMED_MEDIA_ZOOM,
  MIN_FRAMED_MEDIA_ZOOM,
  clampFramedMediaFocus,
  clampFramedMediaZoom,
  computeFramedMediaLayout,
  focusFromFramedMediaLayoutPosition,
  getFramedMediaLayoutImageStyle,
} from "./framedMediaUi";

export const DEFAULT_COMMUNITY_BANNER_FOCUS = DEFAULT_FRAMED_MEDIA_FOCUS;
export const DEFAULT_COMMUNITY_BANNER_ZOOM = DEFAULT_FRAMED_MEDIA_ZOOM;
export const MIN_COMMUNITY_BANNER_ZOOM = MIN_FRAMED_MEDIA_ZOOM;
export const MAX_COMMUNITY_BANNER_ZOOM = MAX_FRAMED_MEDIA_ZOOM;

export const clampCommunityBannerFocus = clampFramedMediaFocus;
export const clampCommunityBannerZoom = clampFramedMediaZoom;
export const computeCommunityBannerLayout = computeFramedMediaLayout;
export const focusFromCommunityBannerLayoutPosition = focusFromFramedMediaLayoutPosition;
export const getCommunityBannerLayoutImageStyle = getFramedMediaLayoutImageStyle;
