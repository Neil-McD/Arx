import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { computeCoverFrameLayout, getCoverFrameImageStyle, type CoverFrame } from "./coverFrameUi";
import { normalizeImageResourceUrl, useImageResource } from "./useImageResource";

export type StableFramedMediaProps = {
  imageUrl: string | null | undefined;
  frame?: CoverFrame;
  alt: string;
  fallback?: ReactNode;
  className: string;
  readyClassName?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
  fallbackStyle?: CSSProperties;
  title?: string;
  loading?: "eager" | "lazy";
  onClick?: MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  "aria-hidden"?: boolean;
};

export function StableFramedMedia(props: StableFramedMediaProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const url = normalizeImageResourceUrl(props.imageUrl);
  const imageResource = useImageResource(url);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !url) return;
    const syncRootSize = () => {
      const rect = root.getBoundingClientRect();
      const width = Math.max(0, rect.width);
      const height = Math.max(0, rect.height);
      setRootSize((current) => current.width === width && current.height === height
        ? current
        : { width, height });
    };
    syncRootSize();
    const observer = new ResizeObserver(syncRootSize);
    observer.observe(root);
    return () => observer.disconnect();
  }, [url]);

  const layout = useMemo(() => {
    if (imageResource.status !== "ready") return null;
    return computeCoverFrameLayout({
      viewportWidth: rootSize.width,
      viewportHeight: rootSize.height,
      naturalWidth: imageResource.resource.width,
      naturalHeight: imageResource.resource.height,
      focusX: props.frame?.focusX,
      focusY: props.frame?.focusY,
      zoom: props.frame?.zoom,
    });
  }, [imageResource, props.frame?.focusX, props.frame?.focusY, props.frame?.zoom, rootSize.height, rootSize.width]);

  const showImage = Boolean(url && layout);
  const combinedClassName = ["stable-framed-media", props.className, showImage ? props.readyClassName : props.fallbackClassName]
    .filter(Boolean)
    .join(" ");
  const rootStyle: CSSProperties | undefined = showImage
    ? props.style
    : (props.fallbackStyle ?? props.style);

  return (
    <div
      ref={rootRef}
      className={combinedClassName}
      style={rootStyle}
      title={props.title}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-hidden={props["aria-hidden"]}
    >
      {showImage && layout ? (
        <img
          className={props.imageClassName}
          src={url ?? undefined}
          alt={props.alt}
          decoding="async"
          loading={props.loading}
          draggable={false}
          style={{ ...props.imageStyle, ...getCoverFrameImageStyle(layout) }}
        />
      ) : props.fallback ?? null}
    </div>
  );
}
