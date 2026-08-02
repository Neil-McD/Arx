import type { CSSProperties, DragEventHandler, ReactNode } from "react";
import { StableFramedMedia } from "./StableFramedMedia";

type CommunityBannerProps = {
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
  alt?: string;
  fallback?: ReactNode;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  "aria-hidden"?: boolean;
};

export function CommunityBanner(props: CommunityBannerProps) {
  return (
    <StableFramedMedia
      className={props.className}
      readyClassName={props.readyClassName}
      fallbackClassName={props.fallbackClassName}
      imageClassName={props.imageClassName ?? "community-banner-image"}
      imageUrl={props.imageUrl}
      frame={{
        focusX: props.focusX,
        focusY: props.focusY,
        zoom: props.zoom,
      }}
      alt={props.alt ?? ""}
      fallback={props.fallback ?? null}
      style={props.style}
      fallbackStyle={props.fallbackStyle}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-hidden={props["aria-hidden"]}
    />
  );
}
