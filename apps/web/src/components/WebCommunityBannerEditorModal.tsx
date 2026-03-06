import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampCommunityBannerFocus,
  clampCommunityBannerZoom,
} from "../../../../shared/communityBannerUi";

type WebCommunityBannerEditorModalProps = {
  isOpen: boolean;
  bannerUrl: string | null;
  focusX: number;
  focusY: number;
  zoom: number;
  onChangeFocusX: (value: number) => void;
  onChangeFocusY: (value: number) => void;
  onChangeZoom: (value: number) => void;
  onDirty: () => void;
  onClose: () => void;
};

type BannerLayout = {
  viewportWidth: number;
  viewportHeight: number;
  renderWidth: number;
  renderHeight: number;
  left: number;
  top: number;
  minLeft: number;
  minTop: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
};

function computeBannerLayout(args: {
  viewportWidth: number;
  viewportHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  focusX: number;
  focusY: number;
  zoom: number;
}): BannerLayout | null {
  const viewportWidth = Math.max(0, args.viewportWidth);
  const viewportHeight = Math.max(0, args.viewportHeight);
  const naturalWidth = Math.max(0, args.naturalWidth);
  const naturalHeight = Math.max(0, args.naturalHeight);
  if (!viewportWidth || !viewportHeight || !naturalWidth || !naturalHeight) {
    return null;
  }
  const baseScale = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
  const renderWidth = naturalWidth * baseScale * clampCommunityBannerZoom(args.zoom);
  const renderHeight = naturalHeight * baseScale * clampCommunityBannerZoom(args.zoom);
  const unclampedLeft = viewportWidth / 2 - clampCommunityBannerFocus(args.focusX) * renderWidth;
  const unclampedTop = viewportHeight / 2 - clampCommunityBannerFocus(args.focusY) * renderHeight;
  const minLeft = Math.min(0, viewportWidth - renderWidth);
  const minTop = Math.min(0, viewportHeight - renderHeight);
  const left = Math.max(minLeft, Math.min(0, unclampedLeft));
  const top = Math.max(minTop, Math.min(0, unclampedTop));
  return {
    viewportWidth,
    viewportHeight,
    renderWidth,
    renderHeight,
    left,
    top,
    minLeft,
    minTop,
  };
}

function focusFromLeftTop(layout: BannerLayout, left: number, top: number) {
  return {
    focusX: clampCommunityBannerFocus((layout.viewportWidth / 2 - left) / layout.renderWidth),
    focusY: clampCommunityBannerFocus((layout.viewportHeight / 2 - top) / layout.renderHeight),
  };
}

export function WebCommunityBannerEditorModal(props: WebCommunityBannerEditorModalProps) {
  const {
    isOpen,
    bannerUrl,
    focusX,
    focusY,
    zoom,
    onChangeFocusX,
    onChangeFocusY,
    onChangeZoom,
    onDirty,
    onClose,
  } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const syncViewport = () => {
      const rect = viewport.getBoundingClientRect();
      setViewportSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      });
    };
    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      dragStateRef.current = null;
      setIsDragging(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [bannerUrl]);

  const layout = useMemo(
    () =>
      computeBannerLayout({
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        focusX,
        focusY,
        zoom,
      }),
    [focusX, focusY, naturalSize.height, naturalSize.width, viewportSize.height, viewportSize.width, zoom],
  );

  const commitDraggedPosition = useCallback(
    (nextLeft: number, nextTop: number) => {
      if (!layout) return;
      const clampedLeft = Math.max(layout.minLeft, Math.min(0, nextLeft));
      const clampedTop = Math.max(layout.minTop, Math.min(0, nextTop));
      const nextFocus = focusFromLeftTop(layout, clampedLeft, clampedTop);
      onChangeFocusX(nextFocus.focusX);
      onChangeFocusY(nextFocus.focusY);
      onDirty();
    },
    [layout, onChangeFocusX, onChangeFocusY, onDirty],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!layout) return;
      if (event.button !== 0) return;
      event.preventDefault();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: layout.left,
        startTop: layout.top,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [layout],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      commitDraggedPosition(
        dragState.startLeft + (event.clientX - dragState.startX),
        dragState.startTop + (event.clientY - dragState.startY),
      );
    },
    [commitDraggedPosition],
  );

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  }, []);

  if (!isOpen || !bannerUrl) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal banner-focus-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Adjust banner framing</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="banner-editor-stage">
            <div
              ref={viewportRef}
              className={`banner-editor-viewport${isDragging ? " dragging" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <img
                className="banner-editor-image"
                src={bannerUrl}
                alt="Community banner preview"
                draggable={false}
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setNaturalSize({
                    width: target.naturalWidth || target.width || 0,
                    height: target.naturalHeight || target.height || 0,
                  });
                }}
                style={
                  layout
                    ? {
                        width: `${layout.renderWidth}px`,
                        height: `${layout.renderHeight}px`,
                        left: `${layout.left}px`,
                        top: `${layout.top}px`,
                      }
                    : undefined
                }
              />
            </div>
            <div className="create-community-hint banner-editor-hint">
              Drag the image to frame it inside the banner.
            </div>
          </div>
          <div className="banner-editor-controls">
            <label className="create-community-field banner-focus-field">
              <span>Zoom</span>
              <input
                type="range"
                min="100"
                max="250"
                step="1"
                value={Math.round(clampCommunityBannerZoom(zoom) * 100)}
                onChange={(event) => {
                  onChangeZoom(Number(event.target.value) / 100);
                  onDirty();
                }}
              />
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button type="button" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
