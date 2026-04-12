import type { CSSProperties, ReactNode } from "react";
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
  fallbackStyle?: CSSProperties;
  title?: string;
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
    fallbackStyle,
    title,
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
      aria-hidden={props["aria-hidden"]}
    >
      {showImage ? (
        <img
          className={imageClassName}
          src={imageUrl ?? undefined}
          alt={alt}
          decoding="async"
          draggable={false}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
