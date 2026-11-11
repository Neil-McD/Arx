import {
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { computeCoverFrameLayout, getCoverFrameImageStyle, type CoverFrame } from "./coverFrameUi";
import {
  isImageLoadAllowed,
  observeImageNearViewport,
  type ImageLoadingMode,
} from "./imageVisibilityObserver";
import {
  normalizeImageResourceUrl,
  useImageResource,
  type ImageFetchPriority,
} from "./useImageResource";

export type StableFramedMediaProps = {
  identityPending?: boolean;
  quietLoading?: boolean;
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
  loading?: ImageLoadingMode;
  fetchPriority?: ImageFetchPriority;
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
  const url = normalizeImageResourceUrl(props.identityPending ? null : props.imageUrl);
  const loading = props.loading ?? "eager";
  const [loadPermission, setLoadPermission] = useState(() => ({
    url,
    loading,
    allowed: loading === "eager",
  }));
  const shouldLoad = isImageLoadAllowed(url, loading, loadPermission);
  const imageResource = useImageResource(url, {
    enabled: shouldLoad,
    fetchPriority: props.fetchPriority,
  });

  useEffect(() => {
    if (!url || loading === "eager" || imageResource.status === "ready") return;
    const root = rootRef.current;
    if (!root) return;
    return observeImageNearViewport(root, () => {
      setLoadPermission({ url, loading, allowed: true });
    });
  }, [imageResource.status, loading, url]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !url || (!shouldLoad && imageResource.status !== "ready")) return;
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
  }, [imageResource.status, shouldLoad, url]);

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
  const isPending = Boolean(props.identityPending || (props.quietLoading && url && !showImage && imageResource.status !== "error"));
  const combinedClassName = ["stable-framed-media", props.className, showImage ? props.readyClassName : !isPending ? props.fallbackClassName : undefined]
    .filter(Boolean)
    .join(" ");
  const rootStyle: CSSProperties | undefined = isPending
    ? { ...props.style, backgroundColor: "var(--bg-tertiary, #292929)" }
    : showImage
    ? props.style
    : (props.fallbackStyle ?? props.style);

  return (
    <div
      ref={rootRef}
      className={combinedClassName}
      data-image-state={isPending ? "loading" : showImage ? "ready" : imageResource.status}
      aria-busy={isPending || undefined}
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
          loading={loading}
          {...{ fetchpriority: props.fetchPriority }}
          referrerPolicy="no-referrer"
          draggable={false}
          style={{ ...props.imageStyle, ...getCoverFrameImageStyle(layout) }}
        />
      ) : isPending ? null : props.fallback ?? null}
    </div>
  );
}
