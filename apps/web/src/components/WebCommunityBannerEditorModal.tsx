import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampCommunityBannerZoom,
  computeCommunityBannerLayout,
  focusFromCommunityBannerLayoutPosition,
  getCommunityBannerLayoutImageStyle,
} from "../../../../shared/communityBannerUi";
import type { FramedMediaLayout } from "../../../../shared/framedMediaUi";

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

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startLayout: FramedMediaLayout;
};

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
      setViewportSize({
        width: Math.max(0, viewport.clientWidth),
        height: Math.max(0, viewport.clientHeight),
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
      computeCommunityBannerLayout({
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
    (dragLayout: FramedMediaLayout, nextLeft: number, nextTop: number) => {
      const clampedLeft = Math.max(dragLayout.minLeft, Math.min(0, nextLeft));
      const clampedTop = Math.max(dragLayout.minTop, Math.min(0, nextTop));
      const nextFocus = focusFromCommunityBannerLayoutPosition(
        dragLayout,
        clampedLeft,
        clampedTop,
      );
      onChangeFocusX(nextFocus.focusX);
      onChangeFocusY(nextFocus.focusY);
      onDirty();
    },
    [onChangeFocusX, onChangeFocusY, onDirty],
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
        startLayout: layout,
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
        dragState.startLayout,
        dragState.startLayout.left + (event.clientX - dragState.startX),
        dragState.startLayout.top + (event.clientY - dragState.startY),
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
                style={layout ? getCommunityBannerLayoutImageStyle(layout) : undefined}
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
