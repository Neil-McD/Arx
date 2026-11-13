import { useEffect, useSyncExternalStore } from "react";
import { PanelRight } from "lucide-react";

// Design v1, the desktop shell: a page's right column shows beside the middle
// only when the middle keeps its minimum width (1180px wide and up). Narrower,
// the column hides and this button in the page's header opens it as a panel
// over the page's edge. It never drops under the middle.
//
// One switch for the whole app (a page shows one right column at a time): the
// open state is `data-right-open` on <html>, which the CSS reads. Pages can
// open it too (Members opens a member's record when you pick one).
const RAILS = ".community-page-rail, .channel-roster-panel, .community-home-rail, .members-page-record";
const listeners = new Set<() => void>();
const isOpen = () => typeof document !== "undefined" && document.documentElement.dataset.rightOpen === "1";

export function setRightColumnOpen(open: boolean) {
  if (typeof document === "undefined" || isOpen() === open) return;
  if (open) document.documentElement.dataset.rightOpen = "1";
  else delete document.documentElement.dataset.rightOpen;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function RightColumnToggle() {
  const open = useSyncExternalStore(subscribe, isOpen, () => false);
  // Leaving the page closes it.
  useEffect(() => () => setRightColumnOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setRightColumnOpen(false); };
    // A click outside the panel (and outside this button) closes it.
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(RAILS) || target?.closest(".right-column-toggle") || target?.closest("[data-opens-right-column]")) return;
      setRightColumnOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <button type="button" className={`right-column-toggle${open ? " is-open" : ""}`} aria-pressed={open}
      aria-label={open ? "Hide the side panel" : "Show the side panel"} title={open ? "Hide the side panel" : "Show the side panel"}
      onClick={() => setRightColumnOpen(!open)}>
      <PanelRight size={16} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}
