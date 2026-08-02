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
  type FramedMediaFrame,
  type FramedMediaLayout,
} from "./framedMediaUi";

export const DEFAULT_AVATAR_FOCUS = DEFAULT_FRAMED_MEDIA_FOCUS;
export const DEFAULT_AVATAR_ZOOM = DEFAULT_FRAMED_MEDIA_ZOOM;
export const MIN_AVATAR_ZOOM = MIN_FRAMED_MEDIA_ZOOM;
export const MAX_AVATAR_ZOOM = MAX_FRAMED_MEDIA_ZOOM;

export const clampAvatarFocus = clampFramedMediaFocus;
export const clampAvatarZoom = clampFramedMediaZoom;

export type AvatarFrame = FramedMediaFrame;
export type AvatarLayout = FramedMediaLayout;

export const computeAvatarLayout = computeFramedMediaLayout;
export const focusFromAvatarLayoutPosition = focusFromFramedMediaLayoutPosition;
export const getAvatarLayoutImageStyle = getFramedMediaLayoutImageStyle;
