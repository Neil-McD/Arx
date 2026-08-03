import type { CSSProperties, DragEventHandler, ReactNode } from "react";
import { communityInitials } from "./messageMetadataUi";
import { StableAvatar } from "./StableAvatar";
import { useCommunityVisualIdentity } from "./CommunityVisualIdentityRegistry";
import type { CommunityVisualIdentity } from "./communityVisualIdentity";
import type { ImageFetchPriority } from "./useImageResource";

type CommunityAvatarProps = {
  communityId?: string | null;
  visualIdentity?: CommunityVisualIdentity | null;
  name: string;
  imageUrl?: string | null;
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
  className: string;
  readyClassName?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  style?: CSSProperties;
  fallbackStyle?: CSSProperties;
  title?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: ImageFetchPriority;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  alt?: string;
  fallback?: ReactNode;
  "aria-hidden"?: boolean;
};

export function CommunityAvatar(props: CommunityAvatarProps) {
  const identity = useCommunityVisualIdentity(
    props.communityId,
    props.visualIdentity,
  );
  const name = identity?.name ?? props.name;
  return (
    <StableAvatar
      className={props.className}
      readyClassName={props.readyClassName}
      fallbackClassName={props.fallbackClassName}
      imageClassName={props.imageClassName ?? "community-avatar-image"}
      imageUrl={identity?.avatar.url ?? props.imageUrl}
      imageFrame={{
        focusX: identity?.avatar.focus_x ?? props.focusX,
        focusY: identity?.avatar.focus_y ?? props.focusY,
        zoom: identity?.avatar.zoom ?? props.zoom,
      }}
      alt={props.alt ?? name}
      fallback={props.fallback ?? communityInitials(name)}
      style={props.style}
      fallbackStyle={props.fallbackStyle}
      title={props.title}
      loading={props.loading}
      fetchPriority={props.fetchPriority}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-hidden={props["aria-hidden"]}
    />
  );
}
