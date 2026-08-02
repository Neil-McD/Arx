import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampAvatarZoom,
  computeAvatarLayout,
  focusFromAvatarLayoutPosition,
  getAvatarLayoutImageStyle,
} from "../../../../shared/avatarUi";

type WebUserAvatarEditorModalProps = {
  isOpen: boolean;
  avatarUrl: string | null;
  focusX: number;
  focusY: number;
  zoom: number;
  title?: string;
  imageAlt?: string;
  hint?: string;
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
  startLeft: number;
  startTop: number;
};

export function WebUserAvatarEditorModal(props: WebUserAvatarEditorModalProps) {
  const {
    isOpen,
    avatarUrl,
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
  }, [avatarUrl]);

  const layout = useMemo(
    () =>
      computeAvatarLayout({
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
      const nextFocus = focusFromAvatarLayoutPosition(layout, clampedLeft, clampedTop);
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

  if (!isOpen || !avatarUrl) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal banner-focus-modal avatar-focus-modal user-avatar-focus-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{props.title ?? "Adjust profile photo"}</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="banner-editor-stage">
            <div
              ref={viewportRef}
              className={`banner-editor-viewport avatar-editor-viewport user-avatar-editor-viewport${isDragging ? " dragging" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <img
                className="banner-editor-image"
                src={avatarUrl}
                alt={props.imageAlt ?? "Profile photo preview"}
                draggable={false}
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setNaturalSize({
                    width: target.naturalWidth || target.width || 0,
                    height: target.naturalHeight || target.height || 0,
                  });
                }}
                style={layout ? getAvatarLayoutImageStyle(layout) : undefined}
              />
            </div>
            <div className="avatar-editor-hint">
              {props.hint ?? "Drag the image to frame it inside your profile photo."}
            </div>
          </div>
          <div className="banner-editor-controls">
            <label className="avatar-editor-field banner-focus-field">
              <span>Zoom</span>
              <input
                type="range"
                min="100"
                max="250"
                step="1"
                value={Math.round(clampAvatarZoom(zoom) * 100)}
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
