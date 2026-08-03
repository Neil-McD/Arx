import type { CSSProperties, DragEventHandler, MouseEventHandler, ReactNode } from "react";
import { StableAvatar } from "./StableAvatar";
import type { ImageFetchPriority } from "./useImageResource";

type UserAvatarProps = {
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
  onClick?: MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  alt?: string;
  fallback?: ReactNode;
  "aria-hidden"?: boolean;
};

function userInitials(name: string): string {
  const parts = name
    .trim()
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase() || "P";
}

export function UserAvatar(props: UserAvatarProps) {
  return (
    <StableAvatar
      className={props.className}
      readyClassName={props.readyClassName}
      fallbackClassName={props.fallbackClassName}
      imageClassName={props.imageClassName ?? "user-avatar-image"}
      imageUrl={props.imageUrl}
      imageFrame={{
        focusX: props.focusX,
        focusY: props.focusY,
        zoom: props.zoom,
      }}
      alt={props.alt ?? props.name}
      fallback={props.fallback ?? userInitials(props.name)}
      style={props.style}
      fallbackStyle={props.fallbackStyle}
      title={props.title}
      loading={props.loading}
      fetchPriority={props.fetchPriority}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-hidden={props["aria-hidden"]}
    />
  );
}
