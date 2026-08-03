import type {
  CSSProperties,
  DragEventHandler,
  MouseEventHandler,
  ReactNode,
} from "react";
import type { CoverFrame } from "./coverFrameUi";
import { StableFramedMedia } from "./StableFramedMedia";
import type { ImageFetchPriority } from "./useImageResource";

type StableAvatarProps = {
  imageUrl: string | null | undefined;
  alt: string;
  fallback: ReactNode;
  className: string;
  readyClassName?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  imageFrame?: CoverFrame;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
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
  "aria-hidden"?: boolean;
};

export function StableAvatar(props: StableAvatarProps) {
  return <StableFramedMedia {...props} frame={props.imageFrame} />;
}
