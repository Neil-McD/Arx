import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import {
  computeFramedMediaLayout,
  getFramedMediaLayoutImageStyle,
  type FramedMediaFrame,
} from "./framedMediaUi";
import { useImageUrlReady } from "./useImageUrlReady";

type StableFramedMediaProps = {
  imageUrl: string | null | undefined;
  alt: string;
  fallback: ReactNode;
  className: string;
  readyClassName?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  frame?: FramedMediaFrame;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
  fallbackStyle?: CSSProperties;
  title?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  "aria-hidden"?: boolean;
};

const viewportStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  borderRadius: "inherit",
};

export function StableFramedMedia(props: StableFramedMediaProps) {
  const {
    imageUrl,
    alt,
    fallback,
    className,
    readyClassName,
    fallbackClassName,
    imageClassName,
    frame,
    style,
    imageStyle,
    fallbackStyle,
    title,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onDragOver,
    onDragLeave,
    onDrop,
  } = props;
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isReady = useImageUrlReady(imageUrl);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const normalizedImageUrl = String(imageUrl ?? "").trim() || null;
  const canLoadImage = Boolean(normalizedImageUrl) && isReady && failedImageUrl !== normalizedImageUrl;
  const hasFrame = Boolean(frame);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<{
    url: string | null;
    width: number;
    height: number;
  }>({ url: null, width: 0, height: 0 });

  useEffect(() => {
    if (!canLoadImage || !hasFrame) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const syncViewportSize = () => {
      setViewportSize({
        width: Math.max(0, viewport.clientWidth),
        height: Math.max(0, viewport.clientHeight),
      });
    };
    syncViewportSize();
    const observer = new ResizeObserver(syncViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [canLoadImage, hasFrame]);

  useEffect(() => {
    setNaturalSize({ url: null, width: 0, height: 0 });
    setFailedImageUrl(null);
  }, [normalizedImageUrl]);

  const syncNaturalSizeFromImage = useCallback((image: HTMLImageElement) => {
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (!normalizedImageUrl || width <= 0 || height <= 0) return;
    setNaturalSize((current) =>
      current.url === normalizedImageUrl &&
      current.width === width &&
      current.height === height
        ? current
        : { url: normalizedImageUrl, width, height },
    );
  }, [normalizedImageUrl]);

  useEffect(() => {
    if (!canLoadImage || !hasFrame) return;
    const image = imageRef.current;
    if (!image?.complete) return;
    syncNaturalSizeFromImage(image);
  }, [canLoadImage, hasFrame, syncNaturalSizeFromImage]);

  const layout = useMemo(() => {
    if (!canLoadImage || !frame || naturalSize.url !== normalizedImageUrl) return null;
    return computeFramedMediaLayout({
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      focusX: frame.focusX,
      focusY: frame.focusY,
      zoom: frame.zoom,
    });
  }, [
    canLoadImage,
    frame?.focusX,
    frame?.focusY,
    frame?.zoom,
    naturalSize.height,
    naturalSize.url,
    naturalSize.width,
    normalizedImageUrl,
    viewportSize.height,
    viewportSize.width,
  ]);

  const showImage = canLoadImage && (!hasFrame || Boolean(layout));
  const combinedClassName = [
    className,
    showImage ? readyClassName : fallbackClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const presentationStyle = showImage ? style : (fallbackStyle ?? style);
  const rootStyle: CSSProperties | undefined = hasFrame
    ? {
        ...presentationStyle,
        position: presentationStyle?.position ?? "relative",
        overflow: presentationStyle?.overflow ?? "hidden",
      }
    : presentationStyle;
  const resolvedImageStyle: CSSProperties | undefined = layout
    ? {
        ...imageStyle,
        ...getFramedMediaLayoutImageStyle(layout),
      }
    : hasFrame
      ? { ...imageStyle, visibility: "hidden" }
      : imageStyle;

  return (
    <div
      className={combinedClassName}
      style={rootStyle}
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-hidden={props["aria-hidden"]}
    >
      {canLoadImage ? (
        <span ref={viewportRef} style={viewportStyle}>
          {showImage ? null : fallback}
          <img
            ref={imageRef}
            className={imageClassName}
            src={normalizedImageUrl ?? undefined}
            alt={alt}
            decoding="async"
            draggable={false}
            style={resolvedImageStyle}
            onLoad={(event) => {
              syncNaturalSizeFromImage(event.currentTarget);
            }}
            onError={() => setFailedImageUrl(normalizedImageUrl)}
          />
        </span>
      ) : (
        fallback
      )}
    </div>
  );
}
