import { useEffect, useState } from "react";
import { PanelRight } from "lucide-react";

// Design v1, the desktop shell: a page's right column shows beside the middle
// only when the middle keeps its minimum width (1180px wide and up). Narrower,
// the column hides and this button in the page's header opens it as a panel
// over the page's edge. It never drops under the middle.
//
// One switch for the whole app (a page shows one right column at a time): the
// open state is `data-right-open` on <html>, which the CSS reads.
const RAILS = ".community-page-rail, .channel-roster-panel, .community-home-rail";

export function RightColumnToggle() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.rightOpen = "1";
    else delete root.dataset.rightOpen;
  }, [open]);
  // Leaving the page closes it.
  useEffect(() => () => { delete document.documentElement.dataset.rightOpen; }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    // A click outside the panel (and outside this button) closes it.
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(RAILS) || target?.closest(".right-column-toggle")) return;
      setOpen(false);
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
      onClick={() => setOpen((value) => !value)}>
      <PanelRight size={16} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}
