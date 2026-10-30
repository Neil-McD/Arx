import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import type { CommunityLessonSlide } from "../../../../shared/communityLessonContract";
import { renderMarkdown } from "../../../../shared/markdownUi";
import "./WebLessonSlideDeck.css";

const SWIPE_PX = 40;
const MAX_DOTS = 20;

// A lesson's "## Slides" section shown one slide at a time: the slide, its
// note underneath, arrows, a counter and full screen. Arrow keys work once the
// deck has focus, and a sideways swipe turns the slide on touch screens.
// Notes render like the rest of the lesson, so a checklist or quiz in one works.
export function WebLessonSlideDeck(props: { slides: CommunityLessonSlide[]; renderNote?: (markdown: string) => ReactNode }) {
  const { slides } = props;
  const [index, setIndex] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const deckRef = useRef<HTMLElement | null>(null);
  const noteRef = useRef<HTMLDivElement | null>(null);
  const swipeFrom = useRef<number | null>(null);
  const last = slides.length - 1;
  const current = slides[Math.min(index, last)];
  const go = (next: number) => setIndex(Math.max(0, Math.min(last, next)));
  // Rendered once per slide, so a checklist or quiz in the note keeps its place
  // (and focus) while the deck itself re-renders.
  const noteMd = current?.note_md ?? "";
  const { renderNote } = props;
  const note = useMemo(() => (noteMd ? (renderNote ? renderNote(noteMd) : renderMarkdown(noteMd)) : null), [noteMd, renderNote]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === deckRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Load the next slide ahead so turning the page never shows a blank stage.
  useEffect(() => {
    const next = slides[index + 1];
    if (next) new Image().src = next.image;
  }, [index, slides]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void deckRef.current?.requestFullscreen?.();
  };

  // Keys stay inside the deck, so Enter on an arrow never opens the owner's body editor.
  // Keys in a note's checklist, quiz or form (or a dialog it opens, which React
  // bubbles through here) belong to that control, not to the deck.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as Node;
    if (!event.currentTarget.contains(target) || noteRef.current?.contains(target)) return;
    event.stopPropagation();
    if (event.key === "ArrowRight" || event.key === "PageDown") go(index + 1);
    else if (event.key === "ArrowLeft" || event.key === "PageUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(last);
    else return;
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeFrom.current = event.pointerType === "mouse" ? null : event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (swipeFrom.current === null) return;
    const dx = event.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(dx) >= SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
  };

  if (!current) return null;
  return (
    <section
      ref={deckRef}
      className="lesson-slide-deck"
      data-resource-media="true"
      data-fullscreen={fullscreen ? "" : undefined}
      aria-roledescription="carousel"
      aria-label="Slides"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div
        className="lesson-slide-deck-stage"
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* One img whose src changes: the browser keeps the old slide up until the next has loaded. */}
        <img
          src={current.image}
          alt={current.alt}
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (!ratio && naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
          }}
        />
        {/* Pointer shortcuts on the slide; keyboard and screen reader users get the same buttons in the bar below. */}
        <button className="lesson-slide-deck-side is-prev" type="button" tabIndex={-1} aria-hidden="true" disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <button className="lesson-slide-deck-side is-next" type="button" tabIndex={-1} aria-hidden="true" disabled={index === last} onClick={() => go(index + 1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="lesson-slide-deck-bar">
        <span className="lesson-slide-deck-count" aria-live="polite">
          Slide {index + 1} of {slides.length}
        </span>
        {slides.length <= MAX_DOTS ? (
          <div className="lesson-slide-deck-dots">
            {slides.map((slide, dot) => (
              <button
                key={dot}
                type="button"
                className={dot === index ? "is-active" : undefined}
                aria-label={`Go to slide ${dot + 1}`}
                aria-current={dot === index ? "true" : undefined}
                onClick={() => go(dot)}
              />
            ))}
          </div>
        ) : (
          <div className="lesson-slide-deck-track" aria-hidden="true">
            <span style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
          </div>
        )}
        <div className="lesson-slide-deck-actions">
          <button className="lesson-slide-deck-prev" type="button" aria-label="Previous slide" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button className="lesson-slide-deck-next" type="button" aria-label="Next slide" disabled={index === last} onClick={() => go(index + 1)}>
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" aria-label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        </div>
      </div>
      {note ? <div ref={noteRef} className="lesson-slide-deck-note">{note}</div> : null}
    </section>
  );
}
