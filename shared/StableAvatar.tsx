import type { CSSProperties, DragEventHandler, ReactNode } from "react";
import { useImageUrlReady } from "./useImageUrlReady";

type StableAvatarProps = {
  imageUrl: string | null | undefined;
  alt: string;
  fallback: ReactNode;
  className: string;
  readyClassName?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
  fallbackStyle?: CSSProperties;
  title?: string;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  "aria-hidden"?: boolean;
};

export function StableAvatar(props: StableAvatarProps) {
  const {
    imageUrl,
    alt,
    fallback,
    className,
    readyClassName,
    fallbackClassName,
    imageClassName,
    style,
    imageStyle,
    fallbackStyle,
    title,
    onDragOver,
    onDragLeave,
    onDrop,
  } = props;
  const isReady = useImageUrlReady(imageUrl);
  const showImage = Boolean(imageUrl) && isReady;
  const combinedClassName = [
    className,
    showImage ? readyClassName : fallbackClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={combinedClassName}
      style={showImage ? style : (fallbackStyle ?? style)}
      title={title}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-hidden={props["aria-hidden"]}
    >
      {showImage ? (
        <img
          className={imageClassName}
          src={imageUrl ?? undefined}
          alt={alt}
          decoding="async"
          draggable={false}
          style={imageStyle}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
