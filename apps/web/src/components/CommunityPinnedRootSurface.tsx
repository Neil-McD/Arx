import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, PinOff } from "lucide-react";

type CommunityPinnedRootSurfaceProps = {
  children: ReactNode;
  selected: boolean;
  canUnpin: boolean;
  isUnpinning: boolean;
  openLabel: string;
  onUnpin: () => void;
  onOpen: () => void;
};

export type CommunityPinnedRootOverflowState = {
  overflowing: boolean;
};

const INITIAL_OVERFLOW_STATE: CommunityPinnedRootOverflowState = {
  overflowing: false,
};

export function resolveCommunityPinnedRootOverflowState(metrics: {
  scrollHeight: number;
  clientHeight: number;
}): CommunityPinnedRootOverflowState {
  return {
    overflowing: metrics.scrollHeight > metrics.clientHeight + 1,
  };
}

export function CommunityPinnedRootSurface(props: CommunityPinnedRootSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [overflowState, setOverflowState] = useState<CommunityPinnedRootOverflowState>(
    INITIAL_OVERFLOW_STATE,
  );

  const measureOverflow = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = resolveCommunityPinnedRootOverflowState({
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
    });
    setOverflowState((current) =>
      current.overflowing === next.overflowing ? current : next,
    );
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    measureOverflow();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(viewport);
    const content = viewport.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    return () => observer.disconnect();
  }, [props.children, measureOverflow]);

  return (
    <section
      className={`community-channel-pinned-root${props.selected ? " is-selected" : ""}`}
      role="note"
      aria-label="Pinned post"
    >
      <div
        ref={viewportRef}
        className="community-channel-pinned-root-viewport"
      >
        {props.children}
      </div>
      {overflowState.overflowing ? (
        <div className="community-channel-pinned-root-fade" aria-hidden="true" />
      ) : null}
      <div className="community-channel-pinned-root-footer">
        <button
          type="button"
          className="community-channel-pinned-root-open"
          onClick={props.onOpen}
          aria-label={props.openLabel}
        >
          View full post <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
      {props.canUnpin ? (
        <button
          type="button"
          className="community-channel-pinned-root-unpin"
          onClick={props.onUnpin}
          disabled={props.isUnpinning}
          aria-label="Unpin from channel"
          title="Unpin from channel"
        >
          <PinOff size={15} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
