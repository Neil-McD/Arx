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

export const DEFAULT_COMMUNITY_AVATAR_FOCUS = DEFAULT_FRAMED_MEDIA_FOCUS;
export const DEFAULT_COMMUNITY_AVATAR_ZOOM = DEFAULT_FRAMED_MEDIA_ZOOM;
export const MIN_COMMUNITY_AVATAR_ZOOM = MIN_FRAMED_MEDIA_ZOOM;
export const MAX_COMMUNITY_AVATAR_ZOOM = MAX_FRAMED_MEDIA_ZOOM;

export const clampCommunityAvatarFocus = clampFramedMediaFocus;
export const clampCommunityAvatarZoom = clampFramedMediaZoom;
export const computeCommunityAvatarLayout = computeFramedMediaLayout;
export const focusFromCommunityAvatarLayoutPosition = focusFromFramedMediaLayoutPosition;
export const getCommunityAvatarLayoutImageStyle = getFramedMediaLayoutImageStyle;
