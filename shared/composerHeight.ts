// Every composer grows with what you type, line by line, up to about ten
// lines (never more than 40% of the window), then scrolls inside itself with
// the line you're on fully in view, padding included (Neil, Nov 14: in
// General, many Shift+Enters left the last line on the box's edge and the
// first ones gone at 5 lines).
export const COMPOSER_MAX_HEIGHT_PX = 240;
const COMPOSER_MAX_WINDOW_SHARE = 0.4;

export function composerMaxHeightPx(maxPx: number = COMPOSER_MAX_HEIGHT_PX): number {
  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  if (!windowHeight) return maxPx;
  return Math.max(96, Math.min(maxPx, Math.round(windowHeight * COMPOSER_MAX_WINDOW_SHARE)));
}

export function fitComposerHeight(textarea: HTMLTextAreaElement | null | undefined, maxPx?: number): void {
  if (!textarea) return;
  const limit = composerMaxHeightPx(maxPx);
  const value = textarea.value;
  // Typing at the end (the usual case) keeps the end in view; editing
  // higher up keeps the box where it was.
  const caretAtEnd = textarea.selectionEnd >= value.length;
  const previousScrollTop = textarea.scrollTop;
  textarea.style.height = "auto";
  const contentHeight = textarea.scrollHeight;
  // Scrolling is never switched off: a window made narrower can wrap a
  // draft past the limit before the next keystroke resizes it.
  const nextHeight = Math.min(contentHeight, limit);
  textarea.style.height = `${nextHeight}px`;
  textarea.scrollTop = caretAtEnd ? textarea.scrollHeight : previousScrollTop;
  // A mention layer drawn over the text follows its scroll.
  textarea.parentElement?.style.setProperty("--mention-composer-scroll-top", `${textarea.scrollTop}px`);
}

// Back to one line once the message has gone.
export function resetComposerHeight(textarea: HTMLTextAreaElement | null | undefined): void {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.scrollTop = 0;
  textarea.parentElement?.style.setProperty("--mention-composer-scroll-top", "0px");
}
