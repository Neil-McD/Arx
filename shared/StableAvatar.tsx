import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type ReactNode,
} from "react";
import { computeAvatarLayout, getAvatarLayoutImageStyle, type AvatarFrame } from "./avatarUi";
import { useImageUrlReady } from "./useImageUrlReady";

type StableAvatarProps = {
  imageUrl: string | null | undefined;
  alt: string;
  fallback: ReactNode;
  className: string;
  readyClassName?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  imageFrame?: AvatarFrame;
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
    imageFrame,
    style,
    imageStyle,
    fallbackStyle,
    title,
    onDragOver,
    onDragLeave,
    onDrop,
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isReady = useImageUrlReady(imageUrl);
  const showImage = Boolean(imageUrl) && isReady;
  const hasImageFrame = Boolean(imageFrame);
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const combinedClassName = [
    className,
    showImage ? readyClassName : fallbackClassName,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!showImage || !hasImageFrame) return;
    const root = rootRef.current;
    if (!root) return;
    const syncRootSize = () => {
      const rect = root.getBoundingClientRect();
      setRootSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      });
    };
    syncRootSize();
    const observer = new ResizeObserver(syncRootSize);
    observer.observe(root);
    return () => observer.disconnect();
  }, [hasImageFrame, showImage]);

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [imageUrl]);

  const layout = useMemo(() => {
    if (!showImage || !imageFrame) return null;
    return computeAvatarLayout({
      viewportWidth: rootSize.width,
      viewportHeight: rootSize.height,
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      focusX: imageFrame.focusX,
      focusY: imageFrame.focusY,
      zoom: imageFrame.zoom,
    });
  }, [
    imageFrame?.focusX,
    imageFrame?.focusY,
    imageFrame?.zoom,
    naturalSize.height,
    naturalSize.width,
    rootSize.height,
    rootSize.width,
    showImage,
  ]);

  const rootStyle: CSSProperties | undefined = showImage && hasImageFrame
    ? {
        ...style,
        position: style?.position ?? "relative",
        overflow: style?.overflow ?? "hidden",
      }
    : showImage
      ? style
      : (fallbackStyle ?? style);
  const framedImageStyle: CSSProperties | undefined = layout
    ? {
        ...imageStyle,
        ...getAvatarLayoutImageStyle(layout),
      }
    : imageStyle;

  return (
    <div
      ref={rootRef}
      className={combinedClassName}
      style={rootStyle}
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
          style={framedImageStyle}
          onLoad={(event) => {
            const target = event.currentTarget;
            setNaturalSize({
              width: target.naturalWidth || target.width || 0,
              height: target.naturalHeight || target.height || 0,
            });
          }}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
