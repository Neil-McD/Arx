import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, Pin, PinOff } from "lucide-react";

type CommunityPinnedRootSurfaceProps = {
  children: ReactNode;
  hasRichContent: boolean;
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
    viewport.setAttribute("inert", "");
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
      className={`community-channel-pinned-root${props.hasRichContent ? " has-rich-content" : ""}${props.selected ? " is-selected" : ""}`}
      role="note"
      aria-label="Pinned post"
    >
      <div
        ref={viewportRef}
        className="community-channel-pinned-root-viewport"
        aria-hidden="true"
      >
        {props.children}
      </div>
      <div
        className="community-channel-pinned-root-preview-open"
        aria-hidden="true"
        onClick={props.onOpen}
      />
      {overflowState.overflowing ? (
        <div className="community-channel-pinned-root-fade" aria-hidden="true" />
      ) : null}
      <button
        type="button"
        className="community-channel-pinned-root-open"
        onClick={props.onOpen}
        aria-label={props.openLabel}
      >
        View full post <ArrowRight size={13} aria-hidden="true" />
      </button>
      {props.canUnpin ? (
        <button
          type="button"
          className="community-channel-pinned-root-pin is-action"
          onClick={props.onUnpin}
          disabled={props.isUnpinning}
          aria-label="Unpin from channel"
          title="Unpin from channel"
        >
          <PinOff size={15} aria-hidden="true" />
        </button>
      ) : (
        <span className="community-channel-pinned-root-pin" aria-hidden="true">
          <Pin size={15} />
        </span>
      )}
    </section>
  );
}
