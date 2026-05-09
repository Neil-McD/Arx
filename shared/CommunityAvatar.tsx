import type { CSSProperties, DragEventHandler, ReactNode } from "react";
import { communityInitials } from "./messageMetadataUi";
import { StableAvatar } from "./StableAvatar";

type CommunityAvatarProps = {
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
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  alt?: string;
  fallback?: ReactNode;
  "aria-hidden"?: boolean;
};

export function CommunityAvatar(props: CommunityAvatarProps) {
  return (
    <StableAvatar
      className={props.className}
      readyClassName={props.readyClassName}
      fallbackClassName={props.fallbackClassName}
      imageClassName={props.imageClassName ?? "community-avatar-image"}
      imageUrl={props.imageUrl}
      imageFrame={{
        focusX: props.focusX,
        focusY: props.focusY,
        zoom: props.zoom,
      }}
      alt={props.alt ?? props.name}
      fallback={props.fallback ?? communityInitials(props.name)}
      style={props.style}
      fallbackStyle={props.fallbackStyle}
      title={props.title}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-hidden={props["aria-hidden"]}
    />
  );
}
