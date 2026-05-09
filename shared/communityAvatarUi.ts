import {
  DEFAULT_AVATAR_FOCUS,
  DEFAULT_AVATAR_ZOOM,
  MAX_AVATAR_ZOOM,
  MIN_AVATAR_ZOOM,
  clampAvatarFocus,
  clampAvatarZoom,
  computeAvatarLayout,
  focusFromAvatarLayoutPosition,
  getAvatarLayoutImageStyle,
  getAvatarImageStyle,
} from "./avatarUi";

export const DEFAULT_COMMUNITY_AVATAR_FOCUS = DEFAULT_AVATAR_FOCUS;
export const DEFAULT_COMMUNITY_AVATAR_ZOOM = DEFAULT_AVATAR_ZOOM;
export const MIN_COMMUNITY_AVATAR_ZOOM = MIN_AVATAR_ZOOM;
export const MAX_COMMUNITY_AVATAR_ZOOM = MAX_AVATAR_ZOOM;

export const clampCommunityAvatarFocus = clampAvatarFocus;
export const clampCommunityAvatarZoom = clampAvatarZoom;
export const computeCommunityAvatarLayout = computeAvatarLayout;
export const focusFromCommunityAvatarLayoutPosition = focusFromAvatarLayoutPosition;
export const getCommunityAvatarLayoutImageStyle = getAvatarLayoutImageStyle;
export const getCommunityAvatarImageStyle = getAvatarImageStyle;
